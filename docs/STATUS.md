# STATUS

更新于 2026-11-06（Asia/Shanghai）。

## 阶段

- **P0（可靠基础）— 离线交付已完成**：环境发现、工程骨架、ADR、插件 v0.1、消息契约层、
  离线模拟闭环、备份/恢复工具与演练，均有可复现证据。
- **P0 严格验收（真实 DSH 加载/生命周期/消息闭环）— BLOCKED**：需审批 + 独立 profile，见「阻塞」。
- P1（核心体验）、P2（高级能力）：未开始。

## 已核实（证据）

- DSH `@deepseek-ai/dsh` 0.2.2-rc.1，Node v24.22.2，Cordis ~4.1.0。
- profile `web` 已在跑旧版 `dsh-fish` v0.8.8 + `dsh-astrbot-relay` v0.9.8（运行依赖，勿动）。
- 插件形态：Cordis bundle（`dsh.bundle.patch` + `apply(ctx, config)`）。
- 关键服务/事件/段顺序：见 `.agents/notes/2026-11-06-env-discovery.md`。
- 分层 AGENTS.md 加载：根 / `.agents` / `packages/dsh-fish-v3` 三层均生效。

## 已交付

- 工程骨架：根 `AGENTS.md`、`README.md`、`docs/INDEX.md`、`.gitignore`、`.agents/AGENTS.md`、
  `.agents/notes/2026-11-06-env-discovery.md`、`docs/adr/0001-*`、`docs/plans/p0-foundation.md`、
  及 architecture/development/security/testing/deployment/operations/migration/quickstart/portability/release。
- **插件 `packages/dsh-fish-v3` v0.1**：身份段 `dafeyu:identity`、策略段 `dafeyu:policy`、
  Config（schemastery，默认真实发送/主动关闭）、追加式 JSONL 记忆、`guard.js`、健康路由
  `GET /dsh-fish-v3/health`、工具 `fish_status`/`fish_recall`/`fish_remember`、locale/icon。
- **消息契约层**：`lib/ingest.js`、`lib/delivery.js`、`lib/loop.js`。
- **备份/恢复**：`lib/backup.js` + 可执行 CLI `sim/backup.mjs`（backup/restore/verify，隔离恢复、幂等）。
- **离线模拟闭环**：`sim/offline.mjs`（`fish test --offline` 语义）。

## 验证证据（可复现）

| 项 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | **44/44 PASS** |
| 离线闭环 | `node packages/dsh-fish-v3/sim/offline.mjs` | **11/11 PASS**（退出码 0） |
| 备份演练 | `sim/backup.mjs backup/verify/restore` | 备份→校验→隔离恢复→幂等，**PASS** |
| 打包 | `npm pack --dry-run` | 16 文件 9.8kB，无密钥/数据 |

Git：`bf38081 → d9a77fc → 0599f54 → 6a9e485 → 04618d6`（5 次提交，含证据与文档）。

## 阻塞（具体条件，未变化前不改判）

- **真实 DSH 加载/激活验收**：本会话审批已改为「不询问/自动拒绝」，`plugin_manager` 安装类动作
  fail-closed；且正确目标应是**独立 profile**（直接装进 `web` 会与在跑 v0.8.8「两条鱼」并污染本工程会话）。
  → 需审批 + 独立 profile 后，按 `docs/deployment.md`/`docs/quickstart.md` 执行 `install_bundle` 并验证
  `list_plugins` 无 `failed`、生命周期 hook 被调用、注入私聊/群聊事件走通消息闭环。

## 未验证（不得宣称已支持）

- 真实 DSH 加载/生命周期/消息闭环、真实 QQ 登录收发、真实模型 provider、真实 B 站账号、生产 cutover。
- storage-domain 与 schemastery 互认、`dsh-llm-replay` 在 profile `web` 可用性。
