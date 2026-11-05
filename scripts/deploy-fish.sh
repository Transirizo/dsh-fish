#!/usr/bin/env bash
# dsh-fish-v3 部署脚本 —— 在兼容的 DeepSeek Harness 上创建独立 profile 并安装插件
# 用法：
#   ./deploy-fish.sh                          # 默认 profile=fish-v3，自动找 dsh-fish-v3-*.tgz
#   ./deploy-fish.sh myfish ./xxx.tgz         # 指定 profile 名与 tarball 路径
set -euo pipefail

PROFILE="${1:-fish-v3}"
TGZ="${2:-}"

if [ -z "$TGZ" ]; then
  TGZ="$(ls -1t dsh-fish-v3-*.tgz 2>/dev/null | head -1 || true)"
  [ -z "$TGZ" ] && TGZ="$(ls -1t packages/dsh-fish-v3/dsh-fish-v3-*.tgz 2>/dev/null | head -1 || true)"
fi

echo "== 1/5 检查 dsh =="
command -v dsh >/dev/null 2>&1 || { echo "错误：找不到 dsh 命令，请先安装 DeepSeek Harness（@deepseek-ai/dsh，>=0.2.0-rc.1 <0.3.0）"; exit 1; }
echo "dsh $(dsh --version)"

echo "== 2/5 检查插件 tarball =="
[ -n "$TGZ" ] && [ -f "$TGZ" ] || { echo "错误：找不到 dsh-fish-v3 tarball，请指定路径"; exit 1; }
echo "tarball: $TGZ"

echo "== 3/5 创建 profile =="
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PDIR="$DSH_HOME/profiles/$PROFILE"
if [ -d "$PDIR" ] && [ -n "$(ls -A "$PDIR" 2>/dev/null)" ]; then
  echo "profile $PROFILE 已存在且非空（$PDIR），跳过创建；如需全新请先备份/删除后重跑"
else
  mkdir -p "$PDIR"
  cat > "$PDIR/package.json" <<EOF
{
  "name": "dsh-profile-$PROFILE",
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
  cat > "$PDIR/cordis.patch.yml" <<EOF
# 大肥鱼配置走设置页（DSH 从 Config schema 自动生成表单）；这里只选默认模型。
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
EOF
  cat > "$PDIR/pnpm-workspace.yaml" <<EOF
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
EOF
  echo "已创建 profile $PROFILE"
fi

echo "== 4/5 安装插件与依赖 =="
dsh plugin --profile "$PROFILE" add "file:$TGZ" >/dev/null 2>&1 || dsh plugin --profile "$PROFILE" install

echo "== 5/5 验证组合 =="
dsh --profile "$PROFILE" --dump-config >/dev/null && echo "组合验证通过"

echo ""
echo "部署完成。启动："
echo "  dsh --profile $PROFILE --port 3081 --no-open"
echo ""
echo "启动日志第一行会打印访问 URL（含本次临时 token），形如："
echo "  dsh web: http://127.0.0.1:3081/?token=..."
echo "浏览器打开该 URL → Settings → Plugins → dsh-fish-v3 配置。"
echo "健康检查：curl http://127.0.0.1:3081/dsh-fish-v3/health"
