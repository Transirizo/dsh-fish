# STATUS

更新于 2026-11-06（Asia/Shanghai）。

## 阶段

- **P0 — 交付完成**（离线 + 真实 DSH 加载验收均达成）。
- P1（核心体验）、P2（高级能力）：未开始。

## 真实 DSH 加载验收（PASS，证据）

| 项 | 证据 |
|---|---|
| 安装 | `install_bundle` → `application: applied`，`dsh-fish-v3@3.2.0` |
| 生命周期 hook | `Tool.listTools` 显示 `fish_status`/`fish_recall`/`fish_remember` 已注册 |
| Config 发现 | `Config.listConfigs` 条目 `status: "schema"`（修复导出 bug 后） |
| 停用/启用 | `set_plugin` 停用→启用→停用，`application: applied`，dispose/apply 正常 |

最终状态：插件**已安装、已停用**（`web` 里与在跑旧版 fish 共存会「两条鱼」+ 污染工程会话；永久部署走独立 profile）。

## 环境修复（已记录，可回滚）

- `web/package.json` 两条悬空依赖已修复：`file:/bridge/...tgz`（缺失）与 `github:...` 改为
  `file:/home/node/.dsh/vendor/*.tgz`（从 node_modules 重建的 tarball）。原文件备份
  `web/package.json.bak-dshfishv3`。详见 `.agents/notes/2026-11-06-install-acceptance.md`。

## 已核实（证据）

- DSH `@deepseek-ai/dsh` 0.2.2-rc.1，Node v24.22.2，Cordis ~4.1.0。
- profile `web` 已在跑旧版 `dsh-fish` v0.8.8 + `dsh-astrbot-relay` v0.9.8（运行依赖，勿动）。
- 插件形态：Cordis bundle；分层 AGENTS.md 三层均生效。

## 已交付

- 工程骨架 + ADR + 计划（见 `docs/`、`docs/adr/0001`）。
- 插件 `packages/dsh-fish-v3` v0.1：身份段 `dafeyu:identity`、策略段 `dafeyu:policy`、Config、JSONL 记忆、
  guard、健康路由、工具 `fish_*`、消息契约层（ingest/delivery/loop）、备份/恢复 CLI、locale/icon。
- 离线闭环 `sim/offline.mjs` + 备份 CLI `sim/backup.mjs`。

## 验证证据（可复现）

| 项 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | **44/44 PASS** |
| 离线闭环 | `node packages/dsh-fish-v3/sim/offline.mjs` | **11/11 PASS** |
| 备份演练 | `sim/backup.mjs backup/verify/restore` | **PASS** |
| 打包 | `npm pack --dry-run` | 16 文件，无密钥/数据 |
| 真实加载 | `install_bundle` + `Tool.listTools` + `Config.listConfigs` | **PASS** |

## 未验证（不得宣称已支持）

- 完整消息闭环（经正常 ingress 注入事件 + 模型 + 投递）→ P1 桥接工作，当前仅离线桩验证。
- 真实 QQ 登录收发、真实模型 provider、真实 B 站账号、生产 cutover。
- 健康路由线上命中（`dsh.example.com` 占位域名，fetch 工具不可达）。
