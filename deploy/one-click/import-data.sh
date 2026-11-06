#!/usr/bin/env bash
# 在另一台 VPS 上导入 export-data.sh 的包。
#
# 前提：目标机已经 clone 本仓库、装好 docker + docker compose；
#       **不要先跑 setup.sh**——导入包自带 profile、插件、凭据、桥环境。
# 镜像默认与源机相同（runzhliu/deepseek-harness:0.2.2-rc.1-r1）；架构/镜像不同时
# 见 docs/vps-migration.md 的「换镜像/换架构」一节。
#
# 用法：./import-data.sh <dsh-fish-data-XXXX.tar.gz>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="$ROOT/data"
COMPOSE="$ROOT/docker-compose.yml"
ARCHIVE="${1:?用法: ./import-data.sh <dsh-fish-data-XXXX.tar.gz>}"
DSH_PORT="${DSH_PORT:-13080}"

compose() { docker compose -f "$COMPOSE" "$@"; }
fail() { echo "错误：$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "找不到 $ARCHIVE"
[ -f "$COMPOSE" ] || fail "找不到 $COMPOSE（是不是不在 deploy/one-click 里跑？）"
grep -q 'data/workspace:/workspace' "$COMPOSE" || fail "compose 缺 ./data/workspace:/workspace 挂载；先应用仓库里的 compose"

echo "== 1/5 停掉目标机现有的栈（如果有） =="
compose stop 2>/dev/null || true

echo "== 2/5 备份目标机现有 data/（如果有） =="
if [ -d "$DATA" ] && [ -n "$(ls -A "$DATA" 2>/dev/null || true)" ]; then
  BK="$DATA.before-import-$(date +%Y%m%d-%H%M%S)"
  mv "$DATA" "$BK"
  echo "   旧数据移到：$BK"
else
  mkdir -p "$DATA"
fi

echo "== 3/5 解包 =="
tar -xzf "$ARCHIVE" -C "$ROOT"
[ -f "$DATA/dsh/.credentials.yaml" ] || fail "包里没有 data/dsh/.credentials.yaml"
[ -d "$DATA/workspace/.dsh-fish" ] || fail "包里没有 data/workspace/.dsh-fish"

echo "== 4/5 清掉旧机器的租约/锁（不清会导致只读房客或建会话卡住） =="
rm -f "$DATA/workspace/.dsh-fish/instance.json"
rm -f "$DATA/workspace/.dsh-fish/.talk-session.lock"
find "$DATA/dsh/sessions" -name 'session.lock' -delete 2>/dev/null || true
chown -R 1000:1000 "$DATA" 2>/dev/null || true
chmod 600 "$DATA/bridge.env" "$DATA/dsh/.credentials.yaml" 2>/dev/null || true

echo "== 5/5 启动 =="
compose up -d
echo "等待 DSH 起来……"
UP=0
for _ in $(seq 1 90); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DSH_PORT}/" 2>/dev/null || true)"
  if [ "$CODE" = "401" ]; then UP=1; break; fi
  sleep 2
done
[ "$UP" = "1" ] || echo "警告：401 还没出现，看 docker compose logs dsh。"

echo
echo "========== 完成 =========="
compose ps
echo
echo "桥最近日志："
compose logs --tail 12 bridge || true
echo
echo "接下来：给机器人发一条私聊，确认 协议：dsh-fish → 收到上报 → sent。"
echo "NapCat 换了机器/IP 时可能需要重新扫码（QQ 登录态在 data/napcat/qq，但设备指纹变了会掉线）。"
