# STATUS

更新于 2026-11-06（Asia/Shanghai）。

## 阶段

- **P0（可靠基础）**：进行中。环境发现完成；工程骨架与 ADR 已建；插件 v0.1 待实现与验证。
- P1（核心体验）、P2（高级能力）：未开始。

## 已核实（证据）

- DSH `@deepseek-ai/dsh` 0.2.2-rc.1，Node v24.22.2，Cordis ~4.1.0。
- profile `web` 已在跑旧版 `dsh-fish` v0.8.8 + `dsh-astrbot-relay` v0.9.8（运行依赖，勿动）。
- 插件形态：Cordis bundle（`dsh.bundle.patch` + `apply(ctx, config)`）。
- 关键服务/事件/段顺序：见 `.agents/notes/2026-11-06-env-discovery.md`。

## 已交付

- 工程骨架：根 `AGENTS.md`、`README.md`、`docs/INDEX.md`、`.gitignore`、`.agents/AGENTS.md`、
  `.agents/notes/2026-11-06-env-discovery.md`。
- `docs/adr/0001-*`（原生 bundle 架构决策）、`docs/plans/p0-foundation.md`、本文件。

## 待办（下一步）

1. 实现 `packages/dsh-fish-v3` v0.1（身份/策略/记忆/guard/健康）。
2. 单测全绿；离线模拟闭环。
3. 尝试安装进 DSH 并记录审批/加载证据。
4. 备份/恢复工具与隔离演练；Git 首次提交。

## 阻塞

- `plugin_manager`（安装/列表）与真实 DSH 加载验收需审批；审批不可用则该项 BLOCKED，先做可离线验证的部分。

## 未验证（不得宣称已支持）

- 真实 QQ 登录/收发、真实模型 provider、真实 B 站账号、生产 cutover —— 全部未验证。
- storage-domain 与 schemastery 互认、`dsh-llm-replay` 在 profile `web` 可用性 —— 未验证。
