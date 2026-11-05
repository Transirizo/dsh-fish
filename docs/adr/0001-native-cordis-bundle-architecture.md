# ADR-0001: V3.2 采用原生 Cordis bundle，桥接独立成件

- 状态: **Accepted**
- 日期: 2026-11-06
- 关联: `docs/architecture.md`、`docs/plans/p0-foundation.md`、`.agents/notes/2026-11-06-env-discovery.md`

## 上下文

规格设想消息链路 `QQ ↔ NapCat ↔ 自定义 AstrBot 插件 ↔ DSH 大肥鱼 Agent`。实际核实的 DSH 是
`@deepseek-ai/dsh` **0.2.2-rc.1**（Cordis 架构），不是一个有固定 AstrBot 适配层的框架；扩展方式是
**Cordis bundle**（`dsh.bundle.patch` + `apply(ctx, config)`），身份/记忆/工具/调度都通过宿主服务接入。
本环境 profile `web` 已有一套在跑的旧版 `dsh-fish` v0.8.8 + `dsh-astrbot-relay` v0.9.8（运行依赖，勿动）。

## 约束

- 交付物必须是「DSH 原生加载、生命周期可被 DSH 驱动」的插件，不能是独立框架/后端。
- 复用 DSH 的 session / agent / LLM / systemPrompt / tools / schedule / storage 优先。
- 身份、行为、兴趣、记忆属于插件本体；桥接只是必要的事件/投递适配层。
- 工程 Agent 与聊天 Agent 隔离用 DSH 现有 profile + 工具收窄 + 权限，不另建应用。

## 决策

1. **V3.2 = 单一原生 bundle `dsh-fish-v3`**（`packages/dsh-fish-v3/`），Cordis patch 只插一行插件。
2. **身份/会话策略走 `ctx.systemPrompt.section()`**：注册 `dafeyu:identity`（order≈1，紧邻 persona 前缀后）与
   `dafeyu:policy`（order≈10199，紧邻 persona 后缀前）。身份文本稳定，由记忆/反思演化，不每日随机改写。
3. **记忆 v0.1 走追加式 JSONL**（`<dataDir>/memory.jsonl`），零依赖、与旧版 `events.jsonl` 做法一致；
   `@deepseek-ai/dsh-storage-domain`（`defineDomain`+`domainTable`）作为 P0→P1 升级路径，待验证其
   `domainTable` 是否接受 schemastery schema（当前观察到参考实现用 zod，宿主顶层 zod 缺失）。
4. **桥接独立成件**：V3.2 插件不内置 IM 协议/登录；对外提供（a）HTTP 投递入口（沿用旧版 `/say` 形制的
   收口，`channel/scene/speaker`），（b）模型面工具收窄白名单，兼容已核实的 `dsh-astrbot-relay` 契约 v7。
5. **工程/聊天隔离**：用不同 DSH profile + `ctx.tools.restrict` 收窄聊天 Agent 工具面 + 权限，聊天 Agent 无
   宿主 shell / 工程写接口 / 部署控制。默认真实发送关闭、账号写关闭、主动发送关闭。

## 代价与风险

- 不复用旧版 120+ 模块，重写会增加短期工作量；但换来规格要求的隔离、可测试性、可迁移性。
- 追加式 JSONL 无索引，大规模召回需后续换 storage-domain / 向量，属于已知 P1 工作。
- 与旧版 `dsh-fish` 同 profile 并存会「两条鱼」抢身份，故 V3.2 用独立 profile/独立数据目录部署，
  迁移时再替换。

## 备选（已拒绝）

- **独立后端/框架**：违反「原生 DSH 插件」硬约束。
- **直接把 IM 协议塞进插件**：违反隔离与红线，且平台登录/收发属独立授权面。
- **立即用 storage-domain**：`domainTable` 与 schemastery 互认未验证，首版求稳先 JSONL。

## 验证

- 单测：身份/策略段注册、记忆追加/召回、guard、健康路由（`node --test`）。
- 集成（待审批）：真实 DSH load bundle、生命周期 hook、注入一条私聊+一条群聊事件、验证去重/会话映射/记忆读写/投递。

## 实现链接

- 插件：`packages/dsh-fish-v3/`；契约：`docs/architecture.md`。
