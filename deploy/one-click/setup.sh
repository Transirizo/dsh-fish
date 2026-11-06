#!/usr/bin/env bash
# 大肥鱼一键部署（上游 @ssamurias/dsh-fish 0.9.x + OneBot 桥）。
#
# 用法：./setup.sh <机器人QQ号>
# 前置：宿主机装好 docker + docker compose；本仓库 clone 到本地。
#
# 与旧版的区别：不再打包/安装本仓库的 dsh-fish-v3，而是从 npm 装上游
# `@ssamurias/dsh-fish`；桥用 FISH_PROTOCOL=dsh-fish 接 `/dsh-fish/say`。
# 顺序上先起 DSH、等它写出 browser-session 密钥，再写桥的 FISH_DSH_SECRET，
# 最后才起桥——上游的 /dsh-fish/* 走 DSH 的 connection 信任栅栏，没有这个密钥调不通。
set -euo pipefail

QQ="${1:?用法: ./setup.sh <机器人QQ号>}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
DATA="$ROOT/data"
COMPOSE="$ROOT/docker-compose.yml"
IMAGE="runzhliu/deepseek-harness:0.2.2-rc.1-r1"
NAP_IMAGE="mlikiowa/napcat-docker:latest"
DSH_PORT="${DSH_PORT:-13080}"
NAP_WEB_PORT="${NAPCAT_WEB_PORT:-16099}"

compose() { docker compose -f "$COMPOSE" "$@"; }
rand() { openssl rand -hex "$1" 2>/dev/null || node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }
fail() { echo "错误：$*" >&2; exit 1; }
set_env() {
  local key="$1" val="$2" file="$3" tmp
  export SETV="$val"
  tmp="$(mktemp)"
  awk -v k="$key" 'BEGIN{done=0}
    index($0, k "=") == 1 { print k "=" ENVIRON["SETV"]; done=1; next }
    { print }
    END { if (!done) print k "=" ENVIRON["SETV"] }' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

mkdir -p "$DATA/dsh" "$DATA/napcat/config" "$DATA/napcat/qq" "$DATA/bridge-state" "$DATA/workspace"

echo "== 1/6 生成密钥 =="
INBOUND_SECRET="$(rand 16)"   # NapCat 上报签名
NAP_TOKEN="$(rand 16)"        # NapCat HTTP 服务 token
echo "   已生成（写进 bridge.env，权限 600）"

echo "== 2/6 准备 DSH profile（web） =="
# 镜像的 web relay 只在 profile 名为 web 时启动，名字不能改。
PDIR="$DATA/dsh/profiles/web"
mkdir -p "$PDIR"
cat > "$PDIR/package.json" <<EOF
{
  "name": "dsh-profile-fish",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]
    }
  }
}
EOF
printf '[]\n' > "$PDIR/cordis.yml"
cat > "$PDIR/pnpm-workspace.yaml" <<EOF
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
EOF
chown -R 1000:1000 "$DATA/dsh" "$DATA/workspace" 2>/dev/null || true

echo "== 3/6 安装上游 @ssamurias/dsh-fish =="
docker run --rm -e DSH_HOME=/home/node/.dsh \
  -v "$DATA/dsh:/home/node/.dsh" \
  --entrypoint dsh "$IMAGE" \
  plugin --profile web add @ssamurias/dsh-fish
PKG="$DATA/dsh/profiles/web/node_modules/@ssamurias/dsh-fish/package.json"
[ -f "$PKG" ] || fail "上游插件没装进去（$PKG 不存在）"
echo "   版本：$(grep -m1 '"version"' "$PKG" | sed 's/.*: *"//; s/".*//')"

echo "== 4/6 给 /say 打 issue #51 补丁（普通聊天正文也返回） =="
docker run --rm -v "$DATA/dsh:/dsh-home" -v "$REPO/scripts:/scripts:ro" \
  --entrypoint node "$IMAGE" \
  /scripts/patch-dsh-fish-say.mjs /dsh-home/profiles/web/node_modules/@ssamurias/dsh-fish/lib/say.js

echo "== 5/6 写配置（bridge.env 先留空 secret，等 DSH 启动后填） =="
cat > "$DATA/bridge.env" <<EOF
FISH_SELF_ID=$QQ
FISH_PROTOCOL=dsh-fish
FISH_SAY_URL=http://dsh:3080/dsh-fish/say
FISH_DSH_HOME=/dsh-home
FISH_DSH_REPLY=session
FISH_DSH_SECRET=
FISH_OWNER_QQ=$QQ
FISH_SEND_ENABLED=true
FISH_GROUP_REQUIRE_AT=true
FISH_LISTEN=0.0.0.0:6199
FISH_INBOUND_SECRET=$INBOUND_SECRET
NAPCAT_API=http://napcat:3000
NAPCAT_TOKEN=$NAP_TOKEN
FISH_STATE_FILE=/state/bridge-state.jsonl
EOF
chmod 600 "$DATA/bridge.env"

cat > "$DATA/napcat/config/onebot11_${QQ}.json" <<EOF
{
  "network": {
    "httpServers": [
      { "enable": true, "name": "http-api", "host": "0.0.0.0", "port": 3000, "enableCors": true, "enableWebsocket": false, "messagePostFormat": "array", "reportSelfMessage": false, "token": "$NAP_TOKEN" }
    ],
    "httpClients": [
      { "enable": true, "name": "dsh", "url": "http://bridge:6199", "reportSelfMessage": false, "messagePostFormat": "array", "token": "$INBOUND_SECRET" }
    ],
    "wsServers": [],
    "wsReverse": []
  }
}
EOF

grep -q -- '--trusted-host' "$COMPOSE" || fail "docker-compose.yml 的 dsh command 缺 --trusted-host dsh（桥用 dsh:3080 访问 /dsh-fish/* 会被 403）"
grep -q 'data/workspace:/workspace' "$COMPOSE" || echo "警告：compose 没有 ./data/workspace:/workspace 挂载；她的家 /workspace/.dsh-fish 可能不持久。"

echo "== 6/6 启动 =="
chown -R 1000:1000 "$DATA/dsh" "$DATA/bridge-state" "$DATA/workspace" 2>/dev/null || true
compose up -d dsh napcat

echo "等待 DSH 起来……"
DSH_UP=0
for _ in $(seq 1 90); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DSH_PORT}/" 2>/dev/null || true)"
  if [ "$CODE" = "401" ]; then DSH_UP=1; break; fi
  sleep 2
done
[ "$DSH_UP" = "1" ] || echo "警告：DSH 的 401 还没出现，继续试着取密钥。"

echo "等 DSH 写出 browser-session 签名密钥……"
SECRET=""
for _ in $(seq 1 90); do
  SECRET="$(docker run --rm -v "$DATA/dsh:/dsh-home:ro" -v "$REPO/scripts:/scripts:ro" \
    --entrypoint node "$IMAGE" /scripts/read-dsh-secret.mjs /dsh-home/.credentials.yaml 2>/dev/null | tr -d '\r' || true)"
  [ -n "$SECRET" ] && break
  sleep 2
done
[ -n "$SECRET" ] || fail "没读到 DSH 的 browser-session 密钥；先看 docker compose logs dsh"
set_env FISH_DSH_SECRET "$SECRET" "$DATA/bridge.env"
chmod 600 "$DATA/bridge.env"
unset SETV SECRET

compose up -d bridge
sleep 2

DSH_TOKEN="$(compose logs dsh 2>/dev/null | grep -oE 'token=[A-Za-z0-9._-]+' | head -1 || true)"
DSH_GUI="http://127.0.0.1:${DSH_PORT}/"
if [ -n "$DSH_TOKEN" ]; then DSH_GUI="${DSH_GUI}?${DSH_TOKEN}"; else DSH_GUI="${DSH_GUI}（token 见：docker compose logs dsh | head -20）"; fi

echo
echo "========== 访问入口 =========="
echo "DSH 管理界面 : ${DSH_GUI}"
echo "NapCat WebUI : http://127.0.0.1:${NAP_WEB_PORT}/webui"
echo "桥日志       : docker compose -f $COMPOSE logs -f bridge"
echo "DSH 日志     : docker compose -f $COMPOSE logs -f dsh"
echo
echo "========== 配置状态 =========="
echo "协议         : FISH_PROTOCOL=dsh-fish（/dsh-fish/say）"
echo "发送         : FISH_SEND_ENABLED=true（桥侧闸门仍然生效）"
echo "群聊         : 默认只回 @（FISH_GROUP_REQUIRE_AT=true）"
echo "回话         : 已打 say.js 补丁；FISH_DSH_REPLY=session 仅作兜底"
echo "她的家       : data/workspace/.dsh-fish（/workspace 已挂卷，重建不丢）"
echo
echo "========== NapCat WebUI 登录 token =========="
sleep 8
NAP_CFG="$(compose exec -T napcat sh -c 'cat /app/napcat/config/webui.json 2>/dev/null' 2>/dev/null || true)"
TOKEN_FROM_CFG="$(printf '%s' "$NAP_CFG" | grep -oE '"(token|password|pwd)"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 || true)"
TOKEN_FROM_LOG="$(compose logs napcat 2>&1 | grep -iE 'token' | tail -3 || true)"
if [ -n "$TOKEN_FROM_CFG" ]; then
  echo "配置里的登录凭据：$TOKEN_FROM_CFG"
elif [ -n "$TOKEN_FROM_LOG" ]; then
  echo "日志里的 token 行："
  printf '%s\n' "$TOKEN_FROM_LOG"
else
  echo "还没读到（NapCat 首次启动在下 QQ 客户端，可能要几分钟）。稍后手动看："
  echo "  docker compose -f $COMPOSE logs napcat | grep -i token"
  echo "  docker compose -f $COMPOSE exec napcat cat /app/napcat/config/webui.json"
fi
echo
echo "========== 接下来（手动） =========="
echo "  1) 打开 NapCat WebUI，扫码登录机器人 QQ。"
echo "  2) 给机器人发一条私聊；桥日志应出现：协议：dsh-fish → 收到上报 → sent。"
echo "  3) 若日志是 say-forbidden：确认 DSH 的 command 里有 --trusted-host dsh（compose 已带）。"
echo "     若 say-unauthorized：FISH_DSH_SECRET 不对，重跑本脚本或从 .credentials.yaml 重新取。"
