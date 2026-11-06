#!/usr/bin/env bash
# 关掉 enable-public.sh 开的公网入口：停掉 Caddy、删掉 .env、把 dsh 重建回本机模式。
#
# 不删 Caddy 的证书缓存（data/caddy），下次再开不用重新申请。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BASE="$ROOT/docker-compose.yml"
PUBLIC="$ROOT/docker-compose.public.yml"
ENVFILE="$ROOT/.env"

echo "== 1/3 停 Caddy =="
if [ -f "$PUBLIC" ]; then
  docker compose -f "$BASE" -f "$PUBLIC" stop caddy 2>/dev/null || true
  docker compose -f "$BASE" -f "$PUBLIC" rm -f caddy 2>/dev/null || true
fi

echo "== 2/3 移除 .env（备份） =="
if [ -f "$ENVFILE" ]; then
  cp "$ENVFILE" "$ENVFILE.bak-$(date +%Y%m%d-%H%M%S)"
  rm -f "$ENVFILE"
fi

echo "== 3/3 把 dsh 重建回本机模式 =="
docker compose -f "$BASE" up -d dsh
docker compose -f "$BASE" ps
echo "公网入口已关闭；13080 仍只绑 127.0.0.1。"
