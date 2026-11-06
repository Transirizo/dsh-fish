#!/usr/bin/env bash
# 大肥鱼「已有 DSH」接入脚本（方案 B，未在全新机器实测）。
#
# 适用：你的 DSH 已经在跑（裸机或容器都行），只想补上大肥鱼插件 + 桥 + NapCat 配置。
# 不动你现有 DSH 的部署方式；只装插件、配 /say 凭据、起 host 网络的桥、生成 NapCat 配置。
#
# 用法：
#   ./setup.sh <QQ号> [选项]
#     --dsh-container <名>     现有 DSH 容器名（默认自动搜 deepseek-harness|dsh）
#     --napcat-container <名>  NapCat 容器名（默认 napcat）
#     --profile <名>           DSH profile（默认 web）
#     --dsh-url <URL>          现有 DSH 的 /say 地址（默认自动探测宿主机端口）
#     --napcat-ip <IP>         NapCat 容器 IP（默认 docker inspect 探测）
#
# 前置：docker；现有 DSH 容器健康；NapCat 容器在跑（容器内 OneBot HTTP 服务需绑 0.0.0.0:3000）。
set -euo pipefail

QQ="${1:?用法: ./setup.sh <QQ号> [--dsh-container 名] [--napcat-container 名] [--profile 名] [--dsh-url URL] [--napcat-ip IP] [--bridge-name 名] [--bridge-port 端口]}"
shift || true

DSH_CONTAINER=""
NAPCAT_CONTAINER="napcat"
PROFILE="web"
DSH_URL=""
NAP_IP=""
BRIDGE_NAME="dsh-fish-bridge"
BRIDGE_PORT="6199"
while [ $# -gt 0 ]; do
  case "$1" in
    --dsh-container) DSH_CONTAINER="$2"; shift 2 ;;
    --napcat-container) NAPCAT_CONTAINER="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --dsh-url) DSH_URL="$2"; shift 2 ;;
    --napcat-ip) NAP_IP="$2"; shift 2 ;;
    --bridge-name) BRIDGE_NAME="$2"; shift 2 ;;
    --bridge-port) BRIDGE_PORT="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
DATA="$ROOT/data"
IMAGE="runzhliu/deepseek-harness:0.2.2-rc.1-r1"
mkdir -p "$DATA/bridge-state"

# ---- 1) 找 DSH 容器 ----
if [ -z "$DSH_CONTAINER" ]; then
  DSH_CONTAINER="$(docker ps --format '{{.Names}}' | grep -iE 'deepseek-harness|dsh' | head -1 || true)"
fi
[ -n "$DSH_CONTAINER" ] || { echo "错误：找不到 DSH 容器，用 --dsh-container 指定"; exit 1; }
echo "== 1/6 DSH 容器：$DSH_CONTAINER =="
# 桥接上游 dsh-fish 时要读 DSH home 里的 browser-session 签名密钥与 sessions/。
# 只读挂进桥容器；v3 模式用不到，挂着也不影响。
DSH_HOME_HOST="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.dsh"}}{{.Source}}{{end}}{{end}}' "$DSH_CONTAINER" 2>/dev/null || true)"
if [ -n "$DSH_HOME_HOST" ]; then
  echo "   DSH home（宿主机）：$DSH_HOME_HOST"
else
  echo "   警告：没找到 /home/node/.dsh 的宿主机挂载；接上游时需手动给 FISH_DSH_SECRET 或挂目录。"
fi

# ---- 2) 探测 DSH 宿主机端口与 /say 地址 ----
DSH_PORT="$(docker port "$DSH_CONTAINER" 3080/tcp 2>/dev/null | head -1 | sed 's/.*://' || true)"
DSH_PORT="${DSH_PORT:-3080}"
[ -n "$DSH_URL" ] || DSH_URL="http://127.0.0.1:${DSH_PORT}/dsh-fish/say"
echo "== 2/6 DSH /say：$DSH_URL =="

# ---- 3) 找 OneBot 后端（NapCat）容器 IP 与网关；没有也继续 ----
# 桥说的是 OneBot v11，NapCat 只是默认例子。没有 NapCat 也能装插件+起桥，只是暂不发送。
NAP_AVAILABLE=1
if [ -z "$NAP_IP" ]; then
  NAP_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$NAPCAT_CONTAINER" 2>/dev/null | awk '{print $1}')"
fi
NAP_GATEWAY="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.Gateway}} {{end}}' "$NAPCAT_CONTAINER" 2>/dev/null | awk '{print $1}')"
if [ -n "$NAP_IP" ]; then
  echo "== 3/6 OneBot 后端：NapCat 容器 IP $NAP_IP（宿主机网关：${NAP_GATEWAY:-未知}）=="
else
  NAP_AVAILABLE=0
  echo "== 3/6 没找到 NapCat 容器（$NAPCAT_CONTAINER）：先装插件+起桥，发送留空，配好后填 NAPCAT_API =="
fi

# ---- 4) 生成密钥 ----
rand() { openssl rand -hex "$1" 2>/dev/null || node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }
INBOUND_SECRET="$(rand 16)"   # NapCat 上报签名
NAP_TOKEN="$(rand 16)"        # NapCat HTTP 服务 token
echo "== 4/6 密钥已生成 =="

# ---- 5) 迁到上游 @ssamurias/dsh-fish，并给 /say 打补丁 ----
echo "== 5/6 迁到上游 @ssamurias/dsh-fish（摘 v3 → 装上游 → 打 say 补丁 → 重启）=="
PROFILE_DIR="/home/node/.dsh/profiles/$PROFILE"
# 1) 摘掉 dsh-fish-v3 的依赖/bundles/覆盖行（不删 node_modules、不删数据）
docker cp "$REPO/scripts/strip-v3-attrs.mjs" "$DSH_CONTAINER:/tmp/strip-v3-attrs.mjs"
docker exec "$DSH_CONTAINER" node /tmp/strip-v3-attrs.mjs "$PROFILE_DIR"
# 2) 装上游（已有就跳过）
if docker exec "$DSH_CONTAINER" test -f "$PROFILE_DIR/node_modules/@ssamurias/dsh-fish/package.json"; then
  echo "   上游已安装，跳过"
else
  docker exec "$DSH_CONTAINER" sh -c "dsh plugin --profile $PROFILE add @ssamurias/dsh-fish"
fi
# 3) 打 issue #51 补丁：普通聊天正文也作为 herReply 返回
docker cp "$REPO/scripts/patch-dsh-fish-say.mjs" "$DSH_CONTAINER:/tmp/patch-dsh-fish-say.mjs"
docker exec "$DSH_CONTAINER" node /tmp/patch-dsh-fish-say.mjs "$PROFILE_DIR/node_modules/@ssamurias/dsh-fish/lib/say.js"
# 4) 重启 DSH，等它起来
docker restart "$DSH_CONTAINER" >/dev/null
echo "等待 DSH 起来……"
UP=0
for _ in $(seq 1 60); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DSH_PORT}/" 2>/dev/null || true)"
  if [ "$CODE" = "401" ]; then UP=1; break; fi
  sleep 2
done
[ "$UP" = "1" ] || echo "警告：401 还没出现，继续试着取密钥。"
# 5) 取 browser-session 签名密钥（桥用它离线铸造 dsh-auth cookie）
docker cp "$REPO/scripts/read-dsh-secret.mjs" "$DSH_CONTAINER:/tmp/read-dsh-secret.mjs"
SECRET="$(docker exec "$DSH_CONTAINER" node /tmp/read-dsh-secret.mjs /home/node/.dsh/.credentials.yaml 2>/dev/null | tr -d '\r' || true)"
[ -n "$SECRET" ] || { echo "错误：没读到 browser-session 密钥；看 docker logs $DSH_CONTAINER"; exit 1; }
echo "   密钥已取到"

# ---- 6) 写桥配置并起桥（host 网络，才能同时够到 DSH 回环与 NapCat 容器 IP）----
echo "== 6/6 写桥配置并启动 =="
{
  echo "FISH_SELF_ID=$QQ"
  echo "FISH_PROTOCOL=dsh-fish"
  echo "FISH_SAY_URL=http://127.0.0.1:${DSH_PORT}/dsh-fish/say"
  echo "FISH_DSH_SECRET=$SECRET"
  if [ -n "$DSH_HOME_HOST" ]; then
    echo "FISH_DSH_HOME=/dsh-home"
    echo "FISH_DSH_REPLY=session"
  else
    echo "FISH_DSH_REPLY=api"
  fi
  echo "FISH_OWNER_QQ=$QQ"
  echo "FISH_GROUP_REQUIRE_AT=true"
  echo "FISH_LISTEN=0.0.0.0:$BRIDGE_PORT"
  echo "FISH_INBOUND_SECRET=$INBOUND_SECRET"
  if [ "$NAP_AVAILABLE" = 1 ]; then
    echo "NAPCAT_API=http://$NAP_IP:3000"
    echo "NAPCAT_TOKEN=$NAP_TOKEN"
    echo "FISH_SEND_ENABLED=true"
  else
    echo "# NAPCAT_API=http://<你的OneBot后端>:3000   # 配好后取消注释"
    echo "# NAPCAT_TOKEN="
    echo "FISH_SEND_ENABLED=false   # 没配 OneBot 后端前先 dry-run"
  fi
  echo "FISH_STATE_FILE=/state/bridge-state.jsonl"
} > "$DATA/bridge.env"
chmod 600 "$DATA/bridge.env"

docker rm -f "$BRIDGE_NAME" 2>/dev/null || true
BRIDGE_MOUNTS=(-v "$REPO/bridge/onebot:/app:ro" -v "$DATA/bridge-state:/state")
if [ -n "$DSH_HOME_HOST" ]; then BRIDGE_MOUNTS+=(-v "$DSH_HOME_HOST:/dsh-home:ro"); fi
docker run -d --restart=unless-stopped --name "$BRIDGE_NAME" \
  --network=host --user 0:0 \
  "${BRIDGE_MOUNTS[@]}" \
  -w /app \
  --env-file "$DATA/bridge.env" \
  --entrypoint node "$IMAGE" index.mjs

# ---- 生成 OneBot 配置（NapCat 格式；没有 NapCat 就跳过）----
if [ "$NAP_AVAILABLE" = 1 ]; then
  cat > "$DATA/napcat-onebot11_${QQ}.json" <<EOF
{
  "network": {
    "httpServers": [
      { "enable": true, "name": "http-api", "host": "0.0.0.0", "port": 3000, "enableCors": true, "enableWebsocket": false, "messagePostFormat": "array", "reportSelfMessage": false, "token": "$NAP_TOKEN" }
    ],
    "httpClients": [
      { "enable": true, "name": "dsh", "url": "http://${NAP_GATEWAY:-$NAP_IP}:${BRIDGE_PORT}", "reportSelfMessage": false, "messagePostFormat": "array", "token": "$INBOUND_SECRET" }
    ],
    "wsServers": [],
    "wsReverse": []
  }
}
EOF
fi

echo
echo "========== 完成 =========="
echo "1) 桥已启动（host 网络，监听 0.0.0.0:${BRIDGE_PORT}）：docker logs ${BRIDGE_NAME}"
if [ "$NAP_AVAILABLE" = 1 ]; then
  echo "2) OneBot(NapCat) 配置已生成：$DATA/napcat-onebot11_${QQ}.json"
  echo "   替换进 NapCat 并重启（路径按你的版本）："
  echo "     docker cp $DATA/napcat-onebot11_${QQ}.json $NAPCAT_CONTAINER:/app/napcat/config/onebot11_${QQ}.json"
  echo "     docker restart $NAPCAT_CONTAINER"
else
  echo "2) 没配 OneBot 后端——桥暂为 dry-run。"
  echo "   配好后在 $DATA/bridge.env 填 NAPCAT_API / NAPCAT_TOKEN，把 FISH_SEND_ENABLED 改成 true，再重启桥。"
fi
echo "3) DSH 已在上一步重启（无需再动）"
echo
GUI_TOKEN="$(docker logs "$DSH_CONTAINER" 2>&1 | grep -oE 'token=[A-Za-z0-9._-]+' | tail -1 || true)"
if [ -n "$GUI_TOKEN" ]; then
  echo "DSH 管理界面：http://127.0.0.1:${DSH_PORT}/?${GUI_TOKEN}   ← 宿主机端口是 ${DSH_PORT}（不是容器日志里的 3080）"
else
  echo "DSH 管理界面：http://127.0.0.1:${DSH_PORT}/   ← 宿主机端口是 ${DSH_PORT}（不是容器日志里的 3080）；token 见 docker logs $DSH_CONTAINER"
fi
echo "之后：给机器人发一条私聊；桥日志应出现 协议：dsh-fish → 收到上报 → sent。"
echo "若 say-forbidden：DSH 没信任 Host（用 127.0.0.1 一般不会）；say-unauthorized：FISH_DSH_SECRET 不对。"
echo "健康检查：curl -o /dev/null -w '%{http_code}\n' $DSH_URL  # 未带 token 应 401"
