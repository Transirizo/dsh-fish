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

# ---- 2) 探测 DSH 宿主机端口与 /say 地址 ----
DSH_PORT="$(docker port "$DSH_CONTAINER" 3080/tcp 2>/dev/null | head -1 | sed 's/.*://' || true)"
DSH_PORT="${DSH_PORT:-3080}"
[ -n "$DSH_URL" ] || DSH_URL="http://127.0.0.1:${DSH_PORT}/dsh-fish-v3/say"
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
DSH_TOKEN="$(rand 32)"        # 桥 ↔ DSH /say
INBOUND_SECRET="$(rand 16)"   # NapCat 上报签名
NAP_TOKEN="$(rand 16)"        # NapCat HTTP 服务 token
echo "== 4/6 密钥已生成 =="

# ---- 5) 打包并安装插件到 DSH，配 /say 凭据 ----
echo "== 5/6 安装插件到 DSH（装完需重启 DSH 生效）=="
TGZ="$DATA/dsh-fish-v3.tgz"
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/package"
(cd "$REPO/packages/dsh-fish-v3" && cp -R package.json index.js client.js lib cordis.patch.yml locale icon.svg README.md AGENTS.md "$STAGE/package/")
tar -czf "$TGZ" -C "$STAGE" package
rm -rf "$STAGE"
[ -s "$TGZ" ] || { echo "错误：打包失败"; exit 1; }

docker cp "$TGZ" "$DSH_CONTAINER:/tmp/dsh-fish-v3.tgz"
docker exec "$DSH_CONTAINER" sh -c "dsh plugin --profile $PROFILE add file:/tmp/dsh-fish-v3.tgz"

# 补 bundles + 写凭据（用独立 JS 文件，避免引号地狱）
cat > "$DATA/install-hook.mjs" <<'JS'
import fs from 'node:fs'
const dir = process.env.PROFILE_DIR
const token = process.env.FISH_TOKEN
// 1) 把 dsh-fish-v3 加进 profile 的 bundles
const pj = `${dir}/package.json`
const j = JSON.parse(fs.readFileSync(pj, 'utf8'))
j.dsh = j.dsh || {}
j.dsh.profile = j.dsh.profile || {}
const b = (j.dsh.profile.bundles = j.dsh.profile.bundles || [])
if (!b.includes('dsh-fish-v3')) b.push('dsh-fish-v3')
fs.writeFileSync(pj, JSON.stringify(j, null, 2) + '\n')
// 2) 把 /say 凭据写进 DSH 凭据文件（保留其它 refs）
const cf = '/home/node/.dsh/.credentials.yaml'
let t
try { t = fs.readFileSync(cf, 'utf8') } catch { t = 'version: 1\nrefs:\n' }
if (t.includes('DSH_FISH_INGRESS_TOKEN')) {
  console.log('凭据已存在，跳过')
} else {
  const m = t.match(/^refs:[ \t]*$/m)
  if (m) {
    const i = t.indexOf('\n', m.index) + 1
    t = t.slice(0, i) + '  DSH_FISH_INGRESS_TOKEN: ' + token + '\n' + t.slice(i)
  } else {
    t = t.replace(/\s*$/, '') + '\nrefs:\n  DSH_FISH_INGRESS_TOKEN: ' + token + '\n'
  }
  fs.writeFileSync(cf, t, { mode: 0o600 })
  console.log('凭据已写入')
}
JS
docker cp "$DATA/install-hook.mjs" "$DSH_CONTAINER:/tmp/fish-install-hook.mjs"
docker exec -e FISH_TOKEN="$DSH_TOKEN" -e PROFILE_DIR="/home/node/.dsh/profiles/$PROFILE" \
  "$DSH_CONTAINER" node /tmp/fish-install-hook.mjs

# ---- 6) 写桥配置并起桥（host 网络，才能同时够到 DSH 回环与 NapCat 容器 IP）----
echo "== 6/6 写桥配置并启动 =="
{
  echo "FISH_SELF_ID=$QQ"
  echo "FISH_SAY_URL=$DSH_URL"
  echo "FISH_SAY_TOKEN=$DSH_TOKEN"
  echo "FISH_LISTEN=0.0.0.0:$BRIDGE_PORT"
  echo "FISH_INBOUND_SECRET=$INBOUND_SECRET"
  if [ "$NAP_AVAILABLE" = 1 ]; then
    echo "NAPCAT_API=http://$NAP_IP:3000"
    echo "NAPCAT_TOKEN=$NAP_TOKEN"
    echo "FISH_SEND_ENABLED=auto"
  else
    echo "# NAPCAT_API=http://<你的OneBot后端>:3000   # 配好后取消注释"
    echo "# NAPCAT_TOKEN="
    echo "FISH_SEND_ENABLED=false   # 没配 OneBot 后端前先 dry-run"
  fi
  echo "FISH_STATE_FILE=/state/bridge-state.jsonl"
} > "$DATA/bridge.env"
chmod 600 "$DATA/bridge.env"

docker rm -f "$BRIDGE_NAME" 2>/dev/null || true
docker run -d --restart=unless-stopped --name "$BRIDGE_NAME" \
  --network=host --user 0:0 \
  -v "$REPO/bridge/onebot:/app:ro" \
  -v "$DATA/bridge-state:/state" \
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
  echo "   配好后在 $DATA/bridge.env 填 NAPCAT_API / NAPCAT_TOKEN，把 FISH_SEND_ENABLED 改回 auto，再重启桥。"
fi
echo "3) 重启 DSH 让插件生效："
echo "     docker restart $DSH_CONTAINER"
echo
GUI_TOKEN="$(docker logs "$DSH_CONTAINER" 2>&1 | grep -oE 'token=[A-Za-z0-9._-]+' | tail -1 || true)"
if [ -n "$GUI_TOKEN" ]; then
  echo "DSH 管理界面：http://127.0.0.1:${DSH_PORT}/?${GUI_TOKEN}   ← 宿主机端口是 ${DSH_PORT}（不是容器日志里的 3080）"
else
  echo "DSH 管理界面：http://127.0.0.1:${DSH_PORT}/   ← 宿主机端口是 ${DSH_PORT}（不是容器日志里的 3080）；token 见 docker logs $DSH_CONTAINER"
fi
echo "之后：DSH 设置页勾「真实平台回复」，桥会跟随（FISH_SEND_ENABLED=auto）。"
echo "健康检查：curl -o /dev/null -w '%{http_code}\n' $DSH_URL  # 未带 token 应 401"
