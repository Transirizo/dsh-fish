# STATUS

更新于 2026-11-06（Asia/Shanghai）。

## 阶段

- **P0（可靠基础）**：进行中。环境发现 + 工程骨架 + ADR + 插件 v0.1 已完成；安装/激活与离线闭环待做。
- P1（核心体验）、P2（高级能力）：未开始。

## 已核实（证据）

- DSH `@deepseek-ai/dsh` 0.2.2-rc.1，Node v24.22.2，Cordis ~4.1.0。
- profile `web` 已在跑旧版 `dsh-fish` v0.8.8 + `dsh-astrbot-relay` v0.9.8（运行依赖，勿动）。
- 插件形态：Cordis bundle（`dsh.bundle.patch` + `apply(ctx, config)`）。
- 关键服务/事件/段顺序：见 `.agents/notes/2026-11-06-env-discovery.md`。
- 分层 AGENTS.md 加载：根 / `.agents` / `packages/dsh-fish-v3` 三层均已生效（会话上下文回显）。

## 已交付

- 工程骨架：根 `AGENTS.md`、`README.md`、`docs/INDEX.md`、`.gitignore`、`.agents/AGENTS.md`、
  `.agents/notes/2026-11-06-env-discovery.md`。
- `docs/adr/0001-*`（原生 bundle 架构决策）、`docs/plans/p0-foundation.md`、`docs/architecture|development|security|testing|deployment|operations|migration|quickstart|portability|release.md`。
- **插件 `packages/dsh-fish-v3` v0.1**：身份段 `dafeyu:identity`、策略段 `dafeyu:policy`、Config
  （schemastery，默认真实发送/主动关闭）、追加式 JSONL 记忆、`guard.js`（消毒+秘密拦截）、健康路由
  `GET /dsh-fish-v3/health`、工具 `fish_status`/`fish_recall`/`fish_remember`、locale/icon。
- **消息契约层**：`lib/ingest.js`（入站规范化+会话键+幂等去重）、`lib/delivery.js`（出站授权闸默认拒绝）、
  `lib/loop.js`（回合处理链）、`lib/backup.js`（备份/隔离恢复/校验）。
- **测试 44/44 全绿**；**离线模拟闭环 `node sim/offline.mjs` 11/11 通过**（私聊/群聊注入、会话映射、
  去重、未授权拒绝、密钥拦截、投递授权链、记忆落库）。
- `npm pack --dry-run`：16 文件、9.8kB，无密钥/数据；测试留在仓库、不进 bundle。
- Git：`bf38081`（骨架+插件）→ `d9a77fc`（refactor）→ `0599f54`（契约层）→ 后续 loop/backup/sim 提交。

## 待办（下一步）

1. 把 `loop` 接到 HTTP 入站路由（`POST /dsh-fish-v3/say` + token 鉴权），形成真正的桥接收口。
2. 备份/恢复的「隔离恢复演练」脚本（`fish backup/restore` 操作语义的 runnable 入口）。
3. 安装/激活验收（真实 DSH load + 生命周期 + 消息闭环）—— 仍受审批阻塞。

## 阻塞

- **安装/激活验收**：本会话审批已改为「不询问/自动拒绝」，`plugin_manager` 安装类动作 fail-closed；
  且 `web` profile 与在跑 v0.8.8 共用，直接激活会「两条鱼」并污染本工程会话的系统提示。正确路径是
  **独立 profile**（或 headless 实例）安装启用，属需要审批的部署动作。→ 记录为 BLOCKED，先做可离线验证部分。

## 未验证（不得宣称已支持）

- 真实 DSH 加载/生命周期/消息闭环、真实 QQ 登录收发、真实模型 provider、真实 B 站账号、生产 cutover。
- storage-domain 与 schemastery 互认、`dsh-llm-replay` 在 profile `web` 可用性。
