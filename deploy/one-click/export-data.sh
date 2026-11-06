#!/usr/bin/env bash
# 导出一套 one-click 大肥鱼的全部运行数据，给另一台 VPS 导入用。
#
# 导出内容（都在 deploy/one-click/data/ 下）：
#   dsh/            DSH home：profile、插件、凭据、sessions、storages
#   workspace/      DSH 的 /workspace，她的家在这里（/workspace/.dsh-fish）
#   napcat/config/  OneBot 配置
#   napcat/qq/      QQ 登录态
#   bridge-state/   桥去重状态
#   bridge.env      桥环境（含 FISH_DSH_SECRET / NapCat token）
#
# 不导出：chrome-profile、tmp、*.lock、instance.json（旧机器的租约，导入时要重建）。
#
# 用法：./export-data.sh [输出文件.tar.gz]
# 导出期间会 docker compose stop，结束后自动 start；QQ/DSH 会断几十秒。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="$ROOT/data"
COMPOSE="$ROOT/docker-compose.yml"
OUT="${1:-$ROOT/dsh-fish-data-$(date +%Y%m%d-%H%M%S).tar.gz}"

compose() { docker compose -f "$COMPOSE" "$@"; }
fail() { echo "错误：$*" >&2; exit 1; }

[ -f "$DATA/bridge.env" ] || fail "没有 $DATA/bridge.env，这不像一套装好的大肥鱼"
[ -f "$DATA/dsh/.credentials.yaml" ] || fail "没有 $DATA/dsh/.credentials.yaml"
[ -d "$DATA/workspace" ] || fail "没有 $DATA/workspace（她的家）"

echo "== 停止三件套（保证导出时没人写盘） =="
compose stop
trap 'compose start >/dev/null 2>&1 || true' EXIT

echo "== 打包到 $OUT =="
tar -czf "$OUT" -C "$ROOT" \
  --exclude='data/dsh/chrome-profile' \
  --exclude='data/dsh/.pnpm-store' \
  --exclude='data/dsh/tmp' \
  --exclude='*.lock' \
  --exclude='instance.json' \
  data/dsh data/workspace data/napcat/config data/napcat/qq data/bridge-state data/bridge.env
chmod 600 "$OUT"

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "== 完成：$OUT（$SIZE） =="
echo "注意：这个包里有 DSH 凭据、FISH_DSH_SECRET、NapCat token 和 QQ 登录态。"
echo "     用 scp 走加密通道传；导入后 chmod 600，用完删掉。"
echo
echo "导入目标机："
echo "  cd deploy/one-click && ./import-data.sh /path/to/$(basename "$OUT")"
