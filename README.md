# DSH-FISH V3.2 · 大肥鱼

大肥鱼（Da Fei Yu）是一个在 DeepSeek Harness（DSH）里原生加载的 AI 陪伴者插件：身份稳定、
能在中文群里自然参与对话、有可持久化的记忆、兴趣随相处慢慢长出来。

本仓库是 V3.2 的工程实现。**不是独立后端**，不替代 DSH，也不内置任何 IM 协议——桥接（QQ/NapCat/AstrBot）
是独立的一层，插件只提供身份、记忆、策略与可验证的入口。

## 一句话现状

- DSH 宿主：`@deepseek-ai/dsh` 0.2.2-rc.1（Cordis 架构），已核实。
- 本环境 profile `web` 里已有一套**在跑的旧版** `dsh-fish` v0.8.8 + `dsh-astrbot-relay` v0.9.8，
  属运行依赖，**不能动**。
- V3.2 插件（`packages/dsh-fish-v3`）正在实现；当前进度见 [`docs/STATUS.md`](docs/STATUS.md)。

## 目录

```text
packages/dsh-fish-v3/   原生 DSH bundle（身份 / 策略 / 记忆 / 健康）
docs/                   架构、开发、安全、测试、部署、迁移、运维、ADR、计划、状态
.agents/                工程 Agent 规则与笔记
```

## 文档入口

- 快速开始：`docs/quickstart.md`（待实现章节会明确标注）
- 架构与设计：`docs/architecture.md`、`docs/adr/`
- 安全：`docs/security.md`
- 验证：`docs/testing.md`
- 部署/迁移：`docs/deployment.md`、`docs/migration.md`、`docs/portability.md`

## 安全红线（先读）

默认**真实发送关闭、账号写操作关闭、主动发送关闭**。任何真实登录、对外发送、生产变更、真实账号写操作、
跨服务器迁移都需要走可信管理通道审批。普通消息/网页/记忆/模型输出都不能授予权限。

## 许可

本仓库实现按项目约定提供；参考/桥接组件的许可见各自包（旧版 `dsh-fish` MIT，`dsh-astrbot-relay` AGPL-3.0）。
