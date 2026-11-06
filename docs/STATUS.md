# STATUS

更新于 2026-11-06（Asia/Shanghai）。只记录有证据的事实。

## 生产

- `web` profile 已运行 **dsh-fish-v3 3.2.3**（发布快照 `data/releases/3.2.3/package`），热切换生效、未重启：
  健康 `version=3.2.3`、`/say` 未配置凭据时 401。见 [3.2.3 发布记录](production-update-3.2.3.md)。
- 旧版 dsh-fish 0.8.8 与星驿（astrbot-relay）已按用户授权移除。
- 「真实平台回复」开关（`sendingEnabled`）已从代码锁死改为设置项，默认关；群聊未点名沉默闸门已进入生产。
- **真实 QQ 已接通并验证真实发送**：私聊消息 → NapCat（容器）→ 桥（宿主机 host 网络）→ DSH 真实模型 → 桥 → NapCat → QQ 回复，全链路 `sent`。见 [真实 QQ 接线](production-qq-wiring.md)。
- 主动发言、B 站：**仍关闭，未实现/未验证**。群聊 @ 点名回复：代码就绪，真机未实测。

## 阶段

| 阶段 | 状态 |
|---|---|
| P0 可靠基础 | 主体完成：原生加载、局部聊天身份（`fish-chat` preset，5 工具）、入站鉴权/去重/挂起/锁/卸载、记忆隔离、原生 DSH 模拟闭环。缺：完整实例迁移、两机演练、新用户文档安装测试。 |
| P1 核心体验 | 约一半：日记/兴趣/群聊节奏已接入；**OneBot 桥已完成并通过全链路模拟 + 真实 QQ 私聊真发验证**；缺真实群聊@实测、受限抓取代理、模型路由、真实模型行为评测。 |
| P2 | 未开始。 |

## 验证证据

| 项 | 命令 | 结果 |
|---|---|---|
| 插件单测 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | 116/116 PASS |
| 桥单测 | `node --test bridge/onebot/test/*.test.mjs` | 8/8 PASS |
| 原生 DSH 验收 | `node packages/dsh-fish-v3/sim/native-dsh.mjs fish-v3 3083` | 10/10 PASS（含群聊未点名沉默、点名回复） |
| 全链路模拟 | `node bridge/onebot/sim/e2e.mjs fish-v3 3084` | 6/6 PASS：假 NapCat → 桥 → 真实 DSH 真实模型 → 假 NapCat |
| 只读预检 | `node packages/dsh-fish-v3/sim/doctor.mjs` | PASS |
| **真实 QQ 私聊真发** | 桥日志 `sent sent` + DSH 账本 completed 递增 | **通过**（2026-11-06，真实账号 3836840356，私聊回真发） |

## 下一步（按优先级）

1. **停 astrbot**：`docker ps` 里 astrbot 容器仍在跑（`127.0.0.1:6185`），可能抢话造成重复回复。
2. **群聊 @ 点名真机实测**：代码就绪（群聊未点名沉默、点名回复），只在模拟通过，真机没验。
3. **桥发送记录落盘**：现在桥的去重表在内存里，桥重启后 NapCat 若重投同一条消息，桥会再发一次（DSH 侧返回同结果，但桥会重复发送）。需把「已发送 eventId」持久化。
4. **一键部署**：把真实链路固化成 `docker-compose.yml + setup.sh`（新用户一键安装，规格 §33）；QQ 扫码登录与选群名单脚本化不了，留交互。
5. 其余：受限抓取代理（SSRF 防御）、模型路由/故障转移、真实模型行为评测、完整实例迁移（§30）。

## 相关文档

[真实 QQ 接线](production-qq-wiring.md) · [桥 README](../bridge/onebot/README.md) · [聊天隔离](chat-isolation.md) · [入站恢复](ingress-recovery.md) · [凭据](credentials.md) · [配置矩阵](configuration.md) · [测试](testing.md) · [安全](security.md)
