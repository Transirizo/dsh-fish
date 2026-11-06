# STATUS

更新于 2026-11-06（Asia/Shanghai）。只记录有证据的事实。

## 生产

- 已按用户授权把 DSH profile 从 `dsh-fish-v3` 切到上游 **`@ssamurias/dsh-fish` 0.9.1**：
  v3 的依赖/bundles/覆盖行已摘掉，`~/.dsh/dsh-fish-v3` / `~/.dsh-fish` 的数据保留。
- 部署脚本（`deploy/one-click`、`deploy/add-to-dsh`）默认装上游；已有 one-click 栈用
  `deploy/one-click/migrate-to-upstream.sh` 迁移。
- 桥同时支持 v3 与 dsh-fish 两种 `/say`；默认部署用 `FISH_PROTOCOL=dsh-fish`。
- 上游 0.9.1 的 issue #51 由 `scripts/patch-dsh-fish-say.mjs` 补上（普通聊天正文也作为 `herReply`）。
- **真实 QQ**：v3 链路曾验证私聊真发；上游链路在 macOS one-click 上私聊收到回复（2026-11-06），
  **VPS 全新安装尚未完整实测**。

## 阶段

| 阶段 | 状态 |
|---|---|
| P0 可靠基础 | 主体完成：原生加载、局部聊天身份（`fish-chat` preset，5 工具）、入站鉴权/去重/挂起/锁/卸载、记忆隔离、原生 DSH 模拟闭环。缺：完整实例迁移、两机演练、新用户文档安装测试。 |
| P1 核心体验 | 上游 `@ssamurias/dsh-fish` 0.9.1 + #51 say 补丁；**OneBot 桥支持 v3/dsh-fish 两种协议**，dsh-fish 链路在 macOS one-click 上 QQ 私聊收到回复；缺 VPS 全新安装实测、真实群聊@实测、受限抓取代理、模型路由、真实模型行为评测。 |
| P2 | 未开始。 |

## 验证证据

| 项 | 命令 | 结果 |
|---|---|---|
| 插件单测 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | 116/116 PASS |
| 桥单测 | `node --test bridge/onebot/test/*.test.mjs` | 24/24 PASS（含上游 dsh-fish 协议映射、cookie 铸造、会话回话兜底、index 端到端接线） |
| 原生 DSH 验收 | `node packages/dsh-fish-v3/sim/native-dsh.mjs fish-v3 3083` | 10/10 PASS（含群聊未点名沉默、点名回复） |
| 全链路模拟 | `node bridge/onebot/sim/e2e.mjs fish-v3 3084` | 6/6 PASS：假 NapCat → 桥 → 真实 DSH 真实模型 → 假 NapCat |
| 只读预检 | `node packages/dsh-fish-v3/sim/doctor.mjs` | PASS |
| **真实 QQ 私聊真发** | 桥日志 `sent sent` + DSH 账本 completed 递增 | **通过**（2026-11-06，真实账号 3836840356，私聊回真发） |
| **add-to-dsh 上游链路** | 已有 DSH + `deploy/add-to-dsh/setup.sh` | 脚本已改写（摘 v3 → 装上游 → say 补丁 → 重启 → 取密钥 → 桥 dsh-fish）；**未在全新机器完整实测** |
| **one-click 上游真机** | macOS + 已有 one-click 栈迁移/重建 | **通过**（2026-11-06）：上游 0.9.1 + say 补丁、桥 `协议：dsh-fish`，QQ 私聊收到回复；全新机安装脚本未实测 |

## 下一步（按优先级）

已完成：停 astrbot、群聊 @ 点名真机实测、桥去重状态落盘、一键部署首版、**add-to-dsh 真机验证**。

1. **VPS 全新机 one-click 实测**：上游 0.9.1 安装、`--trusted-host dsh`、桥 dsh-fish 全链路。
2. **NapCat 字段版本差异**：新版 httpClients 字段是 `token`（旧版 `secret`），模板已按新版；兼容旧版需手动改字段名。
3. **受限抓取代理**（SSRF 防御）：`fish_browse` 目前拒绝回退系统 fetch，缺注入受限代理；联网预算字段尚未真正生效。
4. **模型路由/故障转移**：单一模型，无 fallback。
5. **真实模型行为评测**：`eval/scenarios.json` 有框架，未用真实模型跑。
6. **完整实例迁移（§30）**：备份恢复只做了单机快照边界，跨机迁移未做。

## 相关文档

[真实 QQ 接线](production-qq-wiring.md) · [一键部署](../deploy/one-click/README.md) · [桥 README](../bridge/onebot/README.md) · [聊天隔离](chat-isolation.md) · [入站恢复](ingress-recovery.md) · [凭据](credentials.md) · [配置矩阵](configuration.md) · [测试](testing.md) · [安全](security.md)
