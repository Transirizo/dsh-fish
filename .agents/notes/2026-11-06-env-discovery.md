# Note: 环境与扩展点发现（2026-11-06）

- ID: note-2026-11-06-env
- 模块: 全局 / 架构
- 状态: active（结论将升入 `docs/architecture.md` 与 `docs/adr/0001-*`）

## 问题

规格设想 `QQ ↔ NapCat ↔ AstrBot ↔ DSH`。真实环境里的 DSH 是什么？扩展点在哪？有没有已部署的旧版？

## 事实（已核实，非假设）

### 宿主 DSH

- `@deepseek-ai/dsh` **0.2.2-rc.1**，`type: module`，bin `dsh`（`/usr/local/bin/dsh`）。
- Node **v24.22.2**，`engines.node >=24.9.0`。依赖 Cordis `~4.1.0`。
- checkout：`/usr/local/lib/node_modules/@deepseek-ai/dsh/`（只有 `lib/`+`node_modules`，非源码树；源码在
  github `deepseek-ai/deepseek-harness`）。
- `DSH_HOME=/home/node/.dsh`，`DSH_PROFILE=web`，`DSH_PROFILE_DIR=/home/node/.dsh/profiles/web`。
- 规格 §12 的 `/chc/dsh-fish` **不存在**（本沙盒无 `/chc`）。HOME 是 `/workspace`，但 `.dsh` 在 `/home/node/.dsh`。

### 已部署实例（在跑，勿动）

- profile `web` 的 bundles：`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-fish`、`dsh-astrbot-relay`。
- `dsh-fish` **v0.8.8**（`ssamurias/dsh-fish`，MIT）：事件溯源（`~/.dsh-fish/events.jsonl` 追加），身份走
  `agent.ctx.systemPrompt.section()`，工具面 `ctx.tools.restrict` 收窄，自带调度器/backup/bili 等 120+ 模块。
- `dsh-astrbot-relay` **v0.9.8**（`@runzhliu`，AGPL-3.0）：HTTP+SSE 桥，`BRIDGE_VERSION=7`，路由
  `/message /events /approval /health /where /conversations /workspaces /session/{rebind,fork,adopt} /answer /proactive /rpc`。
- relay 状态 `state.json` 已有一条 QQ 好友会话映射：`qq-main:FriendMessage:530502867 → session-bd655709…`，
  `policy: one-to-one`，`cwd=/workspace/.dsh-fish/home`。
- profile `web/cordis.patch.yml` 里配置了 relay 的 token（**密钥，勿抄录/勿入库**）、cwd=/workspace、
  `pathPrefix=/astrbot-relay`、`approvalEnabled:true`、proactive 心跳 5min / 空闲 2h / 每天上限 2 次。

### 原生插件形态（Cordis bundle）

- 包在 `package.json` 声明 `dsh.bundle.patch` → `cordis.patch.yml`（Loader YAML：`insert` 行）。
- Host 插件 `index.js` 导出 `apply(ctx, config)` + 可选 `inject`/`Config`（schemastery）/默认导出的 Service 类。
- 资源在 `apply` 内用 `ctx.effect`/`ctx.on` 注册并返回清理；声明 `Config` 则在激活时校验行配置。
- 元数据：`locale/en.json`+`locale/zh.json`（`meta.title/description`）+ `icon.svg|png|jpeg|webp`（≤256KiB）。
- 装 bundle：`plugin_manager` `install_bundle`（target=绝对包目录）。每次 plugin_manager 动作都需审批（本会话无 Full）。

### 关键服务（`cordis_inspect_query` Service 目录，已抽样）

`systemPrompt`（`section()` 加身份/策略段）、`tools`（`register/restrict/guard`）、`storage`+`storageDomain`
（`open(defineDomain(...))` 耐久域）、`schedule`（定时/提醒）、`web`（search/fetch provider）、`webServer`
（`register` 路由）、`agents`/`agentLoop`（会话/agent 生命周期）、`credentials`（密钥）、`configEditor`、
`agentPresets`、`approval`、`authorization`、`sessionProjections`、`userQuestions`、`timer`、`workingDirectory`。

### 关键事件（`cordis_inspect_query` Event 目录）

`agent/created|disposed|pre-step|assistant-stream|turn-stopping|error`、`session/event|created|flush`、
`system-prompt/assemble`、`tools/execute|pre-execute|post-execute|result`、`schedule/changed`、`domain/changed`。

### systemPrompt 段顺序（`dsh-system-prompt/lib/types` 的 SECTION_ORDERS）

`HARNESS_IDENTITY=-1000`、`DEPLOYMENT_PERSONA_PREFIX=0`、…、`HARNESS_SOURCE=10000`、`WEB_SURFACE=10100`、
`DEPLOYMENT_PERSONA_SUFFIX=10200`。段形参：`{ name, order, text }`，`order` 为数字（可用 `getSectionOrder(name)`）。

### 记忆存储候选

- `@deepseek-ai/dsh-storage-domain` **0.2.2-rc.1** 在宿主可用；`schemastery` 3.19.0 可用；**`zod` 顶层缺失**。
- `domainTable()` 参考实现（`dsh-session-projection-cache`）用的是 **zod** 的 `z.object`（非 schemastery）——
  与 schemastery 的 schema 是否互认**未验证**，故 V3.2 v0.1 暂用追加式 JSONL（零依赖，等同 dsh-fish 已验证做法）。

## 假设（待验证）

- `systemPrompt.section({name, order, text})` 用自定义 name/order 不与 persona 前缀冲突（已读 persona 源码，待实跑）。
- `install_bundle` 在本会话需要审批；审批不可用时能否落到 DSH 待验证。
- storage-domain 的 `domainTable` 是否接受 schemastery schema —— 未验证，暂绕过。

## 结论（将升入 ADR）

1. V3.2 = 原生 Cordis bundle（`packages/dsh-fish-v3`），复用 DSH 的 session/agent/llm/systemPrompt/tools/schedule。
2. 身份/策略走 `systemPrompt.section()`；记忆 v0.1 走追加 JSONL；桥接独立（沿用/兼容 `dsh-astrbot-relay` 契约 v7）。
3. 工程/聊天 Agent 隔离用 DSH profile + 工具收窄 + 权限，而非另建应用。

## 剩余问题

- 离线确定性模型桩：`dsh-llm-replay` 在 dsh 的 devDependencies 里，profile `web` 是否可加载未验证。
- 单次安装/启用的验收闭环（真实 DSH load + 生命周期 + 注入事件）需要审批或独立 profile。
