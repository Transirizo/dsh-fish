#!/usr/bin/env bash
# 启动大肥鱼 OneBot 桥（生产）。配置在 .env.prod（gitignored，含秘密，勿提交）。
# 常驻建议：systemd 或 pm2；临时测试可 nohup ./start-prod.sh >> /tmp/dsh-fish-bridge.log 2>&1 &
set -euo pipefail
cd "$(dirname "$0")"
exec node --env-file=.env.prod index.mjs
