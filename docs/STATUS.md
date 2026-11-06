# STATUS

更新于 2026-11-06（Asia/Shanghai）。

## 阶段

- **P0 — 尚未完整验收**：真实加载与局部测试已通过，但真实平台入口、工程/聊天强隔离、完整迁移恢复仍有缺口；之前“完整交付”的表述过度。
- **P1 — 部分实现**：生产 GUI 已加载 V3.2；这不等于 QQ 链路或全部设置功能已验证。旧版与星驿已按用户后续授权移除。
- P2：未开始。

## 真实 DSH 加载验收（PASS，证据）

| 项 | 证据 |
|---|---|
| 安装 | `install_bundle` → `application: applied`，`dsh-fish-v3@3.2.0` |
| 生命周期 hook | `Tool.listTools` 显示 `fish_*` 工具已注册 |
| Config 发现 | `Config.listConfigs` 条目 `status: "schema"` |
| 停用/启用 | `set_plugin` 停用→启用→停用均 `applied` |

当前生产 GUI：V3.2 已安装启用，用户已确认设置中出现“大肥鱼”；旧版与星驿已移除。工程/聊天身份尚未严格分离。最新 /say 源码仅在隔离诊断进程验证，当前 GUI 进程是否载入最新模块尚未证明。

## 环境修复（已记录，可回滚）

- `web/package.json` 两条悬空依赖已修复为本地 `file:`（`/home/node/.dsh/vendor/*.tgz`），原文件备份
  `web/package.json.bak-dshfishv3`。详见 `.agents/notes/2026-11-06-install-acceptance.md`。

## 已交付

- 工程骨架 + ADR + 计划（`docs/`、`docs/adr/0001`）。
- 插件 `packages/dsh-fish-v3` v0.1：
  - 身份段 `dafeyu:identity`、策略段 `dafeyu:policy`、Config、JSONL 记忆、guard、健康路由。
  - 工具 6 个：`fish_status` / `fish_recall` / `fish_remember` / `fish_diary` / `fish_interest`（带衰减）/ `fish_browse`（受限抓取）。
  - 消息契约层：ingest（幂等去重）/ delivery（授权闸默认拒绝）/ loop（含参与节奏、记忆范围隔离）。
  - 联网安全：net.js（SSRF）/ budget.js（预算）/ browse.js（体积+重定向复检+provenance）。
  - 自主心跳：reflect.js（确定性整理）/ heartbeat.js（定时器，默认关闭、内部不外发）。
  - 群内参与：participation.js（点名/提问/相关/冷落 + 三模式）。
  - 统一配置：Config 全字段（发送/联网预算/主动/记忆/节奏/日志/平台开关）。
  - 记忆范围隔离：recall/listByType 按 scope 过滤（global/shared 共享，private/group 隔离）。
  - 行为评测基建：eval/scenarios.json + RUBRIC.md（规格 §17）。
  - 备份/恢复 CLI `sim/backup.mjs`、离线闭环 `sim/offline.mjs`。

## 验证证据（可复现）

| 项 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | **109/109 PASS**（新增卸载等待在途创建、锁持有与重启未知结果回归） |
| 原生 DSH /say 合成回合 | 私聊、群聊、重复事件、私聊第二轮恢复 | **PASS**；delivered=false，见 [验证报告](say-verification.md) |
| 可复现原生验收脚本 | `node packages/dsh-fish-v3/sim/native-dsh.mjs fish-v3 3083` | **9/9 PASS**；独立实例身份、鉴权、真实模式拒绝、真实模型、去重、冲突、群聊及账本验证；自动停进程 |
| 离线闭环 | `node packages/dsh-fish-v3/sim/offline.mjs` | **11/11 PASS** |
| 备份演练 | `sim/backup.mjs backup/verify/restore` | **PASS** |
| 打包 | `npm pack --dry-run` | 25 文件 19kB，无密钥/数据 |
| 真实加载 | `install_bundle` + `Tool.listTools` + `Config.listConfigs` | **PASS** |
| 真实模型联调 | 子 agent 用 deepseek-v4-pro 调用 fish_* 6 工具 + 记忆读写 | **PASS**（status/remember/recall/diary/interest 全通） |
| 独立 profile 部署 | `fish-v3` profile 启动 + 健康路由 + 配置覆盖生效 | **PASS**（见 `.agents/notes/2026-11-06-profile-deployment.md`） |
| 生产切换 | `web` 停用旧版 dsh-fish、启用 V3.2；健康路由上线、fish_* 在列、her_*/bili_* 消失 | **PASS**（见 `.agents/notes/2026-11-06-cutover.md`） |

## 未验证（不得宣称已支持）

- 真实 QQ 登录收发、真实 B 站账号、生产 cutover、主动发送启用（真实对外投递）。
- 健康路由线上命中（占位域名不可达）。
- 抓取代理/DNS 二次校验（browse.js 为纯逻辑，真实部署需受限代理）。
- fish_browse 的真实外网抓取（联调时未实调，避免无谓请求）。

## 最新隔离验证

Host源码不再全局注入聊天身份。真实DSH隔离进程中，合成私聊用工具写入并召回记忆；另一合成群聊未召回该私聊记录。见[聊天隔离报告](chat-isolation.md)。该结果不等于OS/网络/管理面强隔离完成，生产GUI新代码载入仍未验证。

## 下一步

先完成 [安全边界整改](plans/security-boundaries.md)：独立聊天身份、凭据服务和受限网络；之后才进入真实平台授权验证。配置已补服务端校验与[实际支持矩阵](configuration.md)，动态预算不重置消费计数。90个单测通过，未声称生产进程已加载本轮代码。
