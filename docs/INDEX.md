# 文档导航

## 入口

- [`README.md`](../README.md) — 项目总览与安全红线
- [`STATUS.md`](STATUS.md) — 当前进度与验证状态（**只看事实，不含规划细节**）

## 设计

- [`architecture.md`](architecture.md) — 架构与消息契约
- [`adr/`](adr/) — 架构决策记录（编号、不可改写）
- [`plans/`](plans/) — 任务计划

## 工程

- [`development.md`](development.md) — 开发与构建
- [`testing.md`](testing.md) — 验证与质量门
- [`security.md`](security.md) — 安全模型与威胁对策
- [`configuration.md`](configuration.md) — 配置实际支持矩阵与未实现字段限制
- [`credentials.md`](credentials.md) — 入站原生凭据引用、轮换与迁移限制

## 交付与运维

- [`quickstart.md`](quickstart.md) — 中文快速开始
- [`deployment.md`](deployment.md) — 部署
- [`production-preflight.md`](production-preflight.md) — 只读诊断及生产更新前验收边界
- [`production-qq-wiring.md`](production-qq-wiring.md) — 真实 QQ 接线拓扑与踩坑记录
- [`operations.md`](operations.md) — 运维与健康
- [`migration.md`](migration.md) — 跨服务器迁移与回滚
- [`backup-safety.md`](backup-safety.md) — 当前记忆快照安全边界（不是完整迁移）
- [`portability.md`](portability.md) — 可移植性与支持矩阵
- [`release.md`](release.md) — 发布与升级

## 约定

- 每份契约只有一个权威位置，其余文件链接过去。
- 文档标注内容状态：`已实现` / `计划中` / `实验性` / `未验证`。
- 研究证据进 `.agents/notes/`，定型结论升入正式文档，过时材料归档。
