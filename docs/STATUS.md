# STATUS

更新于 2026-11-06（Asia/Shanghai）。

## 阶段

- **P0 — 交付完成**（离线 + 真实 DSH 加载验收均达成）。
- **P1 — 进行中**：核心能力落地；**独立 profile 部署 + 配置生效已验证**。剩余：真实 QQ 桥接、行为评测（需真实模型会话）。
- P2：未开始。

## 真实 DSH 加载验收（PASS，证据）

| 项 | 证据 |
|---|---|
| 安装 | `install_bundle` → `application: applied`，`dsh-fish-v3@3.2.0` |
| 生命周期 hook | `Tool.listTools` 显示 `fish_*` 工具已注册 |
| Config 发现 | `Config.listConfigs` 条目 `status: "schema"` |
| 停用/启用 | `set_plugin` 停用→启用→停用均 `applied` |

最终状态：插件**已安装、已停用**（`web` 里与在跑旧版 fish 共存会「两条鱼」+ 污染工程会话；永久部署走独立 profile）。

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
| 单元测试 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | **77/77 PASS** |
| 离线闭环 | `node packages/dsh-fish-v3/sim/offline.mjs` | **11/11 PASS** |
| 备份演练 | `sim/backup.mjs backup/verify/restore` | **PASS** |
| 打包 | `npm pack --dry-run` | 25 文件 19kB，无密钥/数据 |
| 真实加载 | `install_bundle` + `Tool.listTools` + `Config.listConfigs` | **PASS** |
| 真实模型联调 | 子 agent 用 deepseek-v4-pro 调用 fish_* 6 工具 + 记忆读写 | **PASS**（status/remember/recall/diary/interest 全通） |
| 独立 profile 部署 | `fish-v3` profile 启动 + 健康路由 + 配置覆盖生效 | **PASS**（见 `.agents/notes/2026-11-06-profile-deployment.md`） |

## 未验证（不得宣称已支持）

- 真实 QQ 登录收发、真实 B 站账号、生产 cutover、主动发送启用（真实对外投递）。
- 健康路由线上命中（占位域名不可达）。
- 抓取代理/DNS 二次校验（browse.js 为纯逻辑，真实部署需受限代理）。
- fish_browse 的真实外网抓取（联调时未实调，避免无谓请求）。

## 下一步

1. 真实平台授权后：QQ 桥接真机、B 站账号、主动发送启用。
2. 独立 profile 正式部署（把插件从「已安装已停用」转为正式启用）。
3. 真实模型上的行为评测（用 eval/scenarios.json 跑多轮，需驱动会话）。
