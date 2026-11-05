# 架构

> 权威契约以本文为准；各模块 README 与 ADR 链接到这里。

## 1. 总览

目标链路（规格 §2，结合已核实 DSH）：

```text
QQ ↔ NapCat ↔ AstrBot（桥接适配层）↔ DSH 0.2.2-rc.1（Cordis）↔ 大肥鱼插件 dsh-fish-v3
```

- **NapCat / AstrBot**：平台连接与事件规范化，属桥接适配层，**不在本插件内**。
- **DSH**：推理、身份、会话、工具、记忆、调度、权限。
- **`dsh-fish-v3`**：身份、会话策略、记忆、兴趣/日记（后续）、健康，以及对外投递收口。

## 2. 组件

```text
packages/dsh-fish-v3/
├── index.js             apply(ctx, config)：装配 + 清理
├── lib/config.js        schemastery Config（模式、记忆、主动、发送、工具白名单）
├── lib/identity.js      注册 systemPrompt 段 dafeyu:identity（order≈1）
├── lib/policy.js        注册 systemPrompt 段 dafeyu:policy（order≈10199）
├── lib/memory.js        追加式 JSONL 记忆（append / recall / count）
├── lib/guard.js         外来文本消毒 + 秘密外发拦截
├── lib/ingest.js        入站事件规范化 + 会话键派生 + 幂等去重（契约 §3）
├── lib/delivery.js      出站投递授权闸：默认拒绝 + allowlist/类别/冷却/日限/停止开关/审计
├── lib/loop.js          回合处理链：入站→记忆→模型→记忆写→投递授权（桥接可调用的收口）
├── lib/backup.js        备份 / 隔离恢复 / 校验（v0.1 数据 = memory.jsonl）
├── lib/net.js           SSRF 校验：URL 解析/凭据/私网/回环/链路本地/云元数据
├── lib/budget.js        联网预算：查询额度 + 并发槽
├── lib/browse.js        受限抓取编排：SSRF + 预算 + 体积 + 重定向逐跳复检 + provenance
├── lib/reflect.js       周期性自我整理（确定性，无模型）
├── lib/heartbeat.js     自主心跳定时器接线（默认关闭，内部整理不外发）
├── lib/tools.js         fish_status / fish_recall / fish_remember / fish_diary / fish_interest / fish_browse
├── lib/health.js        GET /dsh-fish-v3/health 路由
└── locale/ icon.svg
```

- 身份与策略是**独立 systemPrompt 段**，与工程配置分离（规格 §3）。
- 记忆 v0.1 用追加式 JSONL；`storage-domain` 是已记录的升级路径（ADR-0001）。

## 3. 入站事件契约（桥接 → 插件）

HTTP 投递入口（沿用旧版 `/say` 形制，桥接只发 HTTP、不自建 DSH 会话）：

```json
{ "text": "…", "image": "…", "channel": "qq-group:987654", "scene": "private|group", "speaker": "张三" }
```

- `channel`：同一名字 = 同一间房；`scene: private` 并入主会话；`scene: group` 按 channel 建/复用房间。
- 每条入站事件必带：平台账号、事件 ID（幂等键）、会话 scope、说话人、时间戳、内容类型。
- 会话键 = `account + scope` 派生（`lib/ingest.js` 的 `sessionKey`）；投递状态可追踪。
- 出站投递经 `lib/delivery.js` 的授权闸：内容生成与投递授权分离，模型外强制（§9）。

## 4. 出站投递契约

投递记录至少含：correlation ID、目标会话、内容类型、投递状态（queued/sent/failed/unknown）、重试计数。
不声称端到端 exactly-once（除非平台幂等已验证）；结果未知的投递对账或挂起。

## 5. 身份与策略（规格 §3）

- `dafeyu:identity`：稳定的自我定义——是 AI 陪伴者、不冒充人类、不编造真实经历，性格/兴趣从真实相处长出。
- `dafeyu:policy`：事实 vs 想象、记忆使用、隐私、自主行动边界、沉默权利、群内参与（提及/相关/节奏）。
- 二者都不含权限/审批/安全规则；模型变化、记忆更新、人格发展**不得**改变权限与管理员控制。

## 6. 隔离（规格 §10）

- 工程 Agent 与聊天 Agent 用不同 DSH profile、目录、凭据、工具面。
- 聊天 Agent 工具面经 `ctx.tools.restrict` 收窄为 `fish_*` 子集；无宿主 shell、工程写接口、部署控制、
  allowlist 修改、他人凭据。
- 管理/工具服务在模型外按 caller 身份 + 动作 + 资源 + scope 默认拒绝。

## 7. 状态

- 已实现：组件骨架（本目录）；**计划中**：兴趣/日记/主动/桥接收口全链路；**未验证**：真实平台/账号/provider。
