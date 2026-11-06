#!/usr/bin/env bash
# 大肥鱼一键部署脚本（首版，未在全新主机实测）。
# 用法：./setup.sh <机器人QQ号>
# 前置：宿主机装好 docker + docker compose；本仓库 clone 到本地。
# 流程：生成密钥 → 构建插件 → 准备 DSH profile → 写三份配置 → docker compose up。
set -euo pipefail

QQ="${1:?用法: ./setup.sh <机器人QQ号>}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
DATA="$ROOT/data"
IMAGE="runzhliu/deepseek-harness:0.2.2-rc.1-r1"
NAP_IMAGE="mlikiowa/napcat-docker:latest"

mkdir -p "$DATA/dsh" "$DATA/napcat/config" "$DATA/napcat/qq" "$DATA/bridge-state"

echo "== 1/5 生成密钥 =="
rand() { openssl rand -hex "$1" 2>/dev/null || node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }
DSH_TOKEN="$(rand 32)"        # 桥 ↔ DSH 的 /say 凭据
INBOUND_SECRET="$(rand 16)"   # NapCat 上报签名
NAP_TOKEN="$(rand 16)"        # NapCat HTTP 服务 token

echo "== 2/5 构建插件 tarball（用镜像里的 npm，宿主机无需 node）=="
docker run --rm -v "$REPO/packages/dsh-fish-v3:/pkg" -w /pkg "$IMAGE" npm pack --silent >/dev/null
TGZ="$(ls -1t "$REPO/packages/dsh-fish-v3/dsh-fish-v3-"*.tgz 2>/dev/null | head -1)"
[ -n "$TGZ" ] || { echo "错误：找不到插件 tarball"; exit 1; }

echo "== 3/5 准备 DSH profile（fish）+ 安装插件 =="
# 从 web 模板复制出 fish profile，再把插件装进去。
docker run --rm -e DSH_HOME=/home/node/.dsh \
  -v "$DATA/dsh:/home/node/.dsh" \
  -v "$TGZ:/pkg.tgz:ro" \
  --entrypoint sh "$IMAGE" \
  -c 'dsh --profile fish --from-default-profile web --dump-config >/dev/null 2>&1 || true; dsh plugin --profile fish add file:/pkg.tgz'

echo "== 4/5 写配置（DSH 凭据 / 桥环境 / NapCat onebot 配置）=="
cat > "$DATA/dsh/.credentials.yaml" <<EOF
version: 1
refs:
  DSH_FISH_INGRESS_TOKEN: $DSH_TOKEN
EOF
chmod 600 "$DATA/dsh/.credentials.yaml"

cat > "$DATA/bridge.env" <<EOF
FISH_SELF_ID=$QQ
FISH_SAY_URL=http://dsh:3080/dsh-fish-v3/say
FISH_SAY_TOKEN=$DSH_TOKEN
FISH_LISTEN=0.0.0.0:6199
FISH_INBOUND_SECRET=$INBOUND_SECRET
NAPCAT_API=http://napcat:3000
NAPCAT_TOKEN=$NAP_TOKEN
FISH_SEND_ENABLED=false
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
      { "enable": true, "name": "dsh", "url": "http://bridge:6199", "reportSelfMessage": false, "messagePostFormat": "array", "secret": "$INBOUND_SECRET" }
    ],
    "wsServers": [],
    "wsReverse": []
  }
}
EOF

echo "== 5/5 启动 =="
docker compose -f "$ROOT/docker-compose.yml" up -d

echo
echo "启动完成。接下来（手动）："
echo "  1) 打开 NapCat WebUI：http://127.0.0.1:6099/webui ，扫码登录机器人 QQ。"
echo "  2) 打开 DSH 设置页，勾选大肥鱼的「真实平台回复」。"
echo "  3) 把 bridge.env 里的 FISH_SEND_ENABLED 改成 true 后：docker compose restart bridge"
echo
echo "健康检查：curl http://127.0.0.1:3080/dsh-fish-v3/health"
echo "桥日志：  docker compose -f $ROOT/docker-compose.yml logs -f bridge"
