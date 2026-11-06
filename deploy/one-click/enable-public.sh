#!/usr/bin/env bash
# 给 one-click 栈加一个公网入口：Caddy（自动 TLS）+ basic auth，反代到 dsh:3080。
#
# 前提：
#   - 栈已经用 setup.sh 装好（data/dsh 存在）；
#   - 域名 A/AAAA 已指向这台 VPS；
#   - 防火墙放行 80/443（ACME 和 HTTPS）。
#
# 不会：把 13080 发布到公网；不会暴露 NapCat WebUI。
# 做法：DSH 继续只绑 127.0.0.1；公网只开 Caddy 的 80/443；/dsh-fish/* 公网 404。
#
# 用法：
#   ./enable-public.sh fish.example.com
#   ./enable-public.sh fish.example.com --password '...'   # 非交互
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BASE="$ROOT/docker-compose.yml"
PUBLIC="$ROOT/docker-compose.public.yml"
ENVFILE="$ROOT/.env"

fail() { echo "错误：$*" >&2; exit 1; }

HOST="${1:-}"
[ -n "$HOST" ] || fail "用法：./enable-public.sh <域名> [--password <密码>]"
shift || true
case "$HOST" in
  *://*|*/*) fail "域名不要带协议或路径，只写 fish.example.com" ;;
esac
[ -f "$ROOT/data/dsh/.credentials.yaml" ] || fail "还没装好（data/dsh/.credentials.yaml 不存在），先跑 setup.sh"
[ -f "$PUBLIC" ] || fail "缺 docker-compose.public.yml"

PASS=""
if [ "${1:-}" = "--password" ]; then
  PASS="${2:-}"
  [ -n "$PASS" ] || fail "--password 后面要跟密码"
fi
if [ -z "$PASS" ]; then
  printf '设置公网访问密码（用户名固定 fish）：'
  read -r -s PASS
  echo
fi
[ -n "$PASS" ] || fail "密码不能为空"

echo "== 1/3 生成 bcrypt 哈希（caddy hash-password） =="
HASH="$(printf '%s' "$PASS" | docker run --rm -i caddy:2 hash-password 2>/dev/null | tr -d '\r\n')"
[ -n "$HASH" ] || fail "生成哈希失败；先确认能拉 caddy:2 镜像"
unset PASS

echo "== 2/3 写 .env（600） =="
if [ -f "$ENVFILE" ]; then
  cp "$ENVFILE" "$ENVFILE.bak-$(date +%Y%m%d-%H%M%S)"
fi
cat > "$ENVFILE" <<EOF
PUBLIC_HOST=$HOST
PUBLIC_URL=https://$HOST/
BASIC_AUTH_HASH='$HASH'
# 让不带 -f 的 docker compose 也带上公网叠加层
COMPOSE_FILE=docker-compose.yml:docker-compose.public.yml
EOF
chmod 600 "$ENVFILE"

echo "== 3/3 重建 dsh（加 --trusted-host/--public-url）并起 caddy =="
docker compose -f "$BASE" -f "$PUBLIC" up -d
sleep 2
docker compose -f "$BASE" -f "$PUBLIC" ps

echo
echo "========== 公网入口 =========="
echo "URL      : https://$HOST/"
echo "用户名   : fish"
echo "密码     : 你刚才设置的那个（没有打印、没有落盘明文）"
echo
echo "注意："
echo "  - DNS 必须指向这台 VPS，防火墙放行 80/443；否则 Caddy 申请不到证书。"
echo "  - DSH 的 13080 仍然只绑 127.0.0.1；不要改成 0.0.0.0。"
echo "  - NapCat WebUI（16099）没有暴露；扫码请用 SSH 隧道："
echo "      ssh -L 16099:127.0.0.1:16099 user@vps"
echo "  - /dsh-fish/* 在公网返回 404；桥仍然走内网 dsh:3080。"
echo "  - 关掉公网入口：./disable-public.sh"
