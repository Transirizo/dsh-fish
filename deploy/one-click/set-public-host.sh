#!/usr/bin/env bash
# 给 one-click 栈设置「公网域名」，让 DSH 接受外部反代（宝塔/Nginx/Caddy 都行）。
#
# 只做两件事：
#   1. 写 deploy/one-click/.env：PUBLIC_HOST / PUBLIC_URL；
#   2. 重建 dsh，让它带 --trusted-host <域名> --public-url https://<域名>/。
#
# 不装 Caddy、不开 basic auth——TLS 和密码由你的反代（宝塔）负责。
# 如果之前用过内置 Caddy，本脚本会把 caddy 容器移除，避免两套入口打架。
#
# 用法：./set-public-host.sh fish.example.com
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BASE="$ROOT/docker-compose.yml"
PUBLIC="$ROOT/docker-compose.public.yml"
ENVFILE="$ROOT/.env"

HOST="${1:-}"
[ -n "$HOST" ] || { echo "用法：./set-public-host.sh <域名>" >&2; exit 2; }
case "$HOST" in
  *://*|*/*) echo "域名不要带协议或路径，只写 fish.example.com" >&2; exit 2 ;;
esac
[ -f "$ROOT/data/dsh/.credentials.yaml" ] || { echo "还没装好，先跑 setup.sh" >&2; exit 1; }

if [ -f "$ENVFILE" ]; then
  cp "$ENVFILE" "$ENVFILE.bak-$(date +%Y%m%d-%H%M%S)"
fi
cat > "$ENVFILE" <<EOF
PUBLIC_HOST=$HOST
PUBLIC_URL=https://$HOST/
EOF
chmod 600 "$ENVFILE"

# 之前开过内置 Caddy 的话，移除它（TLS/密码交给宝塔）
if [ -f "$PUBLIC" ]; then
  docker compose -f "$BASE" -f "$PUBLIC" rm -f caddy 2>/dev/null || true
fi

docker compose -f "$BASE" up -d dsh
sleep 1

echo "已设置公网域名：https://$HOST/"
echo
echo "接下来在宝塔里给这个域名做反代："
echo "  1) 网站 → 设置 → SSL：申请 Let's Encrypt，打开「强制 HTTPS」；"
echo "  2) 反向代理 → 目标 URL：http://127.0.0.1:13080；"
echo "  3) 把 deploy/one-click/baota-reverse-proxy.conf 里的 location 贴进站点配置"
echo "     （关键是 proxy_set_header Host \$host; 少这行 DSH 会 403 / 登录循环）；"
echo "  4) 网站 → 访问限制：开密码访问（basic auth），用户名密码自己定。"
echo
echo "不要把 13080 / 16099 发布到公网。"
echo "NapCat WebUI 默认不公开；如果一定要公网，另建 napcat 子域名反代 16099，"
echo "并加独立强密码 + IP 白名单（片段：baota-napcat-reverse-proxy.conf），风险比 DSH 高得多。"
