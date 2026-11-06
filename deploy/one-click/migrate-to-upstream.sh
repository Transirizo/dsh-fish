#!/usr/bin/env bash
# 把已经在跑的 one-click 栈从 dsh-fish-v3 迁到上游 @ssamurias/dsh-fish。
#
# 不重建 data/、不删旧数据；只动：
#   - profile 里 dsh-fish-v3 的依赖/bundles/覆盖行（摘掉）
#   - 安装 @ssamurias/dsh-fish（已有则跳过）
#   - 给上游 say.js 打 issue #51 补丁
#   - 重建 dsh（应用 --trusted-host dsh）与 bridge（换成 dsh-fish 协议）
#
# 用法：./migrate-to-upstream.sh [机器人QQ号]
#   QQ 号不给时从 data/bridge.env 的 FISH_SELF_ID 读。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
DATA="$ROOT/data"
COMPOSE="$ROOT/docker-compose.yml"
IMAGE="runzhliu/deepseek-harness:0.2.2-rc.1-r1"
DSH_PORT="${DSH_PORT:-13080}"

compose() { docker compose -f "$COMPOSE" "$@"; }
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

QQ="${1:-}"
if [ -z "$QQ" ] && [ -f "$DATA/bridge.env" ]; then
  QQ="$(grep -E '^FISH_SELF_ID=' "$DATA/bridge.env" | head -1 | cut -d= -f2- || true)"
fi
[ -n "$QQ" ] || fail "用法：./migrate-to-upstream.sh <机器人QQ号>"
[ -f "$DATA/bridge.env" ] || fail "没有 $DATA/bridge.env，先跑 setup.sh"
[ -f "$COMPOSE" ] || fail "没有 $COMPOSE"
grep -q -- '--trusted-host' "$COMPOSE" || fail "docker-compose.yml 的 dsh command 缺 --trusted-host dsh；先应用仓库里的 compose"
grep -q 'dsh-home' "$COMPOSE" || fail "docker-compose.yml 的 bridge 缺 ./data/dsh:/dsh-home:ro 挂载"
grep -q 'data/workspace:/workspace' "$COMPOSE" || fail "docker-compose.yml 缺 ./data/workspace:/workspace 挂载；重建 dsh 会丢她的 /workspace/.dsh-fish"

# 当前容器的 /workspace 如果还没挂卷，先把她家拷到宿主机卷目录，重建后再挂回去。
if ! docker inspect "$CID" --format '{{range .Mounts}}{{.Destination}}{{"\n"}}{{end}}' | grep -qx '/workspace'; then
  mkdir -p "$DATA/workspace"
  if [ ! -e "$DATA/workspace/.dsh-fish" ]; then
    if docker cp "$CID:/workspace/.dsh-fish" "$DATA/workspace/" 2>/dev/null; then
      chown -R 1000:1000 "$DATA/workspace" 2>/dev/null || true
      echo "   已把容器里的 /workspace/.dsh-fish 拷到 $DATA/workspace/"
    else
      echo "   容器里没有 /workspace/.dsh-fish，跳过"
    fi
  fi
fi

CID="$(compose ps -q dsh || true)"
[ -n "$CID" ] || fail "one-click 的 dsh 容器没在跑"

STAMP="$(date +%Y%m%d-%H%M%S)"
BK="$DATA/migration-backup-$STAMP"
mkdir -p "$BK" "$DATA/bridge-state"

echo "== 1/6 备份 =="
cp "$DATA/bridge.env" "$BK/bridge.env"
docker cp "$CID:/home/node/.dsh/profiles/web/package.json" "$BK/package.json" 2>/dev/null || true
docker cp "$CID:/home/node/.dsh/profiles/web/cordis.patch.yml" "$BK/cordis.patch.yml" 2>/dev/null || true
echo "   $BK"

echo "== 2/6 摘掉 dsh-fish-v3 的依赖/bundles/覆盖行 =="
docker cp "$REPO/scripts/strip-v3-attrs.mjs" "$CID:/tmp/strip-v3-attrs.mjs"
docker exec "$CID" node /tmp/strip-v3-attrs.mjs /home/node/.dsh/profiles/web

echo "== 3/6 安装/确认上游 @ssamurias/dsh-fish =="
if docker exec "$CID" test -f /home/node/.dsh/profiles/web/node_modules/@ssamurias/dsh-fish/package.json; then
  echo "   已经装了，跳过安装"
else
  docker exec "$CID" sh -c 'dsh plugin --profile web add @ssamurias/dsh-fish'
fi
VERSION="$(docker exec "$CID" sh -c "grep -m1 '\"version\"' /home/node/.dsh/profiles/web/node_modules/@ssamurias/dsh-fish/package.json" 2>/dev/null | sed 's/.*: *\"//; s/\".*//' || true)"
[ -n "$VERSION" ] || fail "上游插件没装进去"
echo "   版本：$VERSION"

echo "== 4/6 给 say.js 打 issue #51 补丁 =="
docker cp "$REPO/scripts/patch-dsh-fish-say.mjs" "$CID:/tmp/patch-dsh-fish-say.mjs"
docker exec "$CID" node /tmp/patch-dsh-fish-say.mjs /home/node/.dsh/profiles/web/node_modules/@ssamurias/dsh-fish/lib/say.js

echo "== 5/6 重建 dsh（应用 --trusted-host dsh 和新 profile） =="
compose up -d --force-recreate dsh
echo "等待 DSH 起来……"
UP=0
for _ in $(seq 1 90); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DSH_PORT}/" 2>/dev/null || true)"
  if [ "$CODE" = "401" ]; then UP=1; break; fi
  sleep 2
done
[ "$UP" = "1" ] || echo "警告：401 还没出现，继续试着取密钥。"
CID="$(compose ps -q dsh)"

echo "== 6/6 更新桥配置并重建桥 =="
docker cp "$REPO/scripts/read-dsh-secret.mjs" "$CID:/tmp/read-dsh-secret.mjs"
SECRET="$(docker exec "$CID" node /tmp/read-dsh-secret.mjs /home/node/.dsh/.credentials.yaml 2>/dev/null | tr -d '\r' || true)"
[ -n "$SECRET" ] || fail "没读到 browser-session 密钥；看 docker compose logs dsh"

set_env FISH_PROTOCOL dsh-fish "$DATA/bridge.env"
set_env FISH_SAY_URL http://dsh:3080/dsh-fish/say "$DATA/bridge.env"
set_env FISH_DSH_HOME /dsh-home "$DATA/bridge.env"
set_env FISH_DSH_REPLY session "$DATA/bridge.env"
set_env FISH_DSH_SECRET "$SECRET" "$DATA/bridge.env"
set_env FISH_OWNER_QQ "$QQ" "$DATA/bridge.env"
set_env FISH_SEND_ENABLED true "$DATA/bridge.env"
set_env FISH_GROUP_REQUIRE_AT true "$DATA/bridge.env"
chmod 600 "$DATA/bridge.env"
unset SETV SECRET

compose up -d --force-recreate bridge
sleep 2

echo
echo "========== 完成 =========="
compose ps
echo
echo "桥最近日志："
compose logs --tail 12 bridge
echo
echo "接下来：给机器人发一条私聊，桥日志应出现 协议：dsh-fish → 收到上报 → sent。"
echo "回滚：cp $BK/bridge.env $DATA/bridge.env；docker compose up -d --force-recreate bridge"
echo "      DSH 侧的回滚需要重新装 v3（不删 dsh-fish 的数据）。"
