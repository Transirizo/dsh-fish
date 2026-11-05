# STATUS

更新于 2026-11-06（Asia/Shanghai）。

## 阶段

- **P0 — 交付完成**（离线 + 真实 DSH 加载验收均达成）。
- **P1 — 进行中**：日记/兴趣、受控联网、自主心跳、群内参与节奏、行为评测基建已落地；桥接、真实模型评测、provider 路由待做。
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
  - 消息契约层：ingest（幂等去重）/ delivery（授权闸默认拒绝）/ loop。
  - 联网安全：net.js（SSRF）/ budget.js（预算）/ browse.js（体积+重定向复检+provenance）。
  - 自主心跳：reflect.js（确定性整理）/ heartbeat.js（定时器，默认关闭、内部不外发）。
  - 备份/恢复 CLI `sim/backup.mjs`、离线闭环 `sim/offline.mjs`。

## 验证证据（可复现）

| 项 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | **65/65 PASS** |
| 离线闭环 | `node packages/dsh-fish-v3/sim/offline.mjs` | **11/11 PASS** |
| 备份演练 | `sim/backup.mjs backup/verify/restore` | **PASS** |
| 打包 | `npm pack --dry-run` | 25 文件 19kB，无密钥/数据 |
| 真实加载 | `install_bundle` + `Tool.listTools` + `Config.listConfigs` | **PASS** |

## 未验证（不得宣称已支持）

- 完整「注入事件→模型→投递」消息闭环（需桥接 + 真实模型，当前仅离线桩验证）。
- 真实 QQ 登录收发、真实模型 provider、真实 B 站账号、生产 cutover。
- 健康路由线上命中（占位域名不可达）。
- 抓取代理/DNS 二次校验（browse.js 为纯逻辑，真实部署需受限代理）。

## 下一步（P1 继续）

1. HTTP 桥接收口（`POST /dsh-fish-v3/say` + token 鉴权）与 `astrbot-relay` 契约对齐。
2. 行为评测：多轮中文群聊场景 + 评分量表（规格 §17）。
3. 模型/信息 provider 的独立配置与路由/failover。
