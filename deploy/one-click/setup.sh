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

echo "== 2/5 打包插件（tar，无需 node/npm/网络）=="
TGZ="$DATA/dsh-fish-v3.tgz"
(cd "$REPO/packages/dsh-fish-v3" && tar -czf "$TGZ" --transform='s,^,package/,' \
  package.json index.js client.js lib cordis.patch.yml locale icon.svg README.md AGENTS.md)
[ -s "$TGZ" ] || { echo "错误：插件打包失败"; exit 1; }

echo "== 3/5 准备 DSH profile（fish）+ 安装插件 =="
# 用 web 这个 profile 名：镜像的 web relay 只在 profile 名为 web 时启动（否则 Web 只监听回环、外部进不来）。
PDIR="$DATA/dsh/profiles/web"
mkdir -p "$PDIR"
cat > "$PDIR/package.json" <<EOF
{
  "name": "dsh-profile-fish",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-fish-v3"]
    }
  }
}
EOF
cat > "$PDIR/cordis.yml" <<EOF
[]
EOF
cat > "$PDIR/pnpm-workspace.yaml" <<EOF
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
EOF
# 关键：容器里 DSH 以 node(uid 1000) 运行，宿主机 root 建的文件它写不动，先 chown。
chown -R 1000:1000 "$DATA/dsh"
docker run --rm -e DSH_HOME=/home/node/.dsh \
  -v "$DATA/dsh:/home/node/.dsh" \
  -v "$TGZ:/pkg.tgz:ro" \
  --entrypoint sh "$IMAGE" \
  -c 'dsh plugin --profile web add file:/pkg.tgz'

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
FISH_SEND_ENABLED=auto
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
# 第 4 步又写了一批 root 属主文件（凭据/环境/配置），启动前统一 chown 给 node(1000) 与桥。
chown -R 1000:1000 "$DATA/dsh" "$DATA/bridge-state"
docker compose -f "$ROOT/docker-compose.yml" up -d

DSH_PORT="${DSH_PORT:-13080}"
NAP_WEB_PORT="${NAPCAT_WEB_PORT:-16099}"

# 等 DSH 真正起来（插件路由能响应就说明 Web 已就绪）
echo "等待 DSH 启动……"
DSH_UP=0
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${DSH_PORT}/dsh-fish-v3/health" >/dev/null 2>&1; then DSH_UP=1; break; fi
  sleep 2
done

# 从 DSH 容器日志里取带 token 的访问 URL（容器内是 3080；宿主机是 DSH_PORT，需重写端口）
DSH_TOKEN=$(docker compose -f "$ROOT/docker-compose.yml" logs dsh 2>/dev/null \
  | grep -oE 'token=[A-Za-z0-9._-]+' | head -1 || true)
DSH_GUI="http://127.0.0.1:${DSH_PORT}/"
if [ -n "$DSH_TOKEN" ]; then
  DSH_GUI="${DSH_GUI}?${DSH_TOKEN}"
else
  DSH_GUI="${DSH_GUI}（token 见：docker compose logs dsh | head -20）"
fi

echo
echo "========== 访问入口 =========="
echo "DSH 管理界面 : ${DSH_GUI}"
echo "NapCat WebUI : http://127.0.0.1:${NAP_WEB_PORT}/webui"
echo "健康检查     : curl http://127.0.0.1:${DSH_PORT}/dsh-fish-v3/health"
echo "桥日志       : docker compose -f $ROOT/docker-compose.yml logs -f bridge"
echo
echo "========== 接下来（手动） =========="
echo "  1) 打开上面的 NapCat WebUI，扫码登录机器人 QQ。"
echo "  2) 打开上面的 DSH 管理界面，设置页勾选大肥鱼的「真实平台回复」——桥会跟随，无需改文件。"
echo "  3) （可选）想强制 dry-run，把 bridge.env 的 FISH_SEND_ENABLED 改成 false 后重启桥。"

# 远程（SSH）连接时给端口转发提示
if [ -n "${SSH_CONNECTION:-}" ]; then
  SSH_SERVER_IP="$(echo "$SSH_CONNECTION" | awk '{print $3}')"
  echo
  echo "========== 远程访问提示（检测到 SSH） =========="
  echo "这两个端口只绑在服务器 127.0.0.1，远程电脑直接打不开，需要本地做 SSH 端口转发："
  echo "  ssh -L ${DSH_PORT}:127.0.0.1:${DSH_PORT} -L ${NAP_WEB_PORT}:127.0.0.1:${NAP_WEB_PORT} <用户名>@${SSH_SERVER_IP}"
  echo "然后在本地浏览器打开："
  echo "  DSH 管理界面 : ${DSH_GUI}"
  echo "  NapCat WebUI : http://127.0.0.1:${NAP_WEB_PORT}/webui"
fi

if [ "$DSH_UP" -eq 0 ]; then
  echo
  echo "警告：90 秒内没等到 DSH 健康响应，先看日志：docker compose -f $ROOT/docker-compose.yml logs dsh"
fi
echo
echo "注意：若与线上同机、同 QQ 号测试，扫码登录会顶掉线上 NapCat 的登录态。"
