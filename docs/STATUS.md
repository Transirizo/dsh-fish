# STATUS

更新于 2026-11-06（Asia/Shanghai）。只记录有证据的事实。

## 生产

- `web` profile 运行 **dsh-fish-v3 3.2.1**（发布快照 `data/releases/3.2.1/package`），重启后已验证：健康 version=3.2.1、Config 已发现、`/say` 未配置凭据时 401。见 [3.2.1 更新记录](production-update-3.2.1.md)。
- 旧版 dsh-fish 0.8.8 与星驿（astrbot-relay）已按用户授权移除。
- 生产尚未包含本轮的群聊沉默闸门（源码已改、未发布）。
- 真实 QQ、真实发送、主动发言、B 站：**全部关闭，未验证**。

## 阶段

| 阶段 | 状态 |
|---|---|
| P0 可靠基础 | 主体完成：原生加载、局部聊天身份（`fish-chat` preset，5 工具）、入站鉴权/去重/挂起/锁/卸载、记忆隔离、原生 DSH 模拟闭环。缺：完整实例迁移、两机演练、新用户文档安装测试。 |
| P1 核心体验 | 约一半：日记/兴趣/群聊节奏已接入；**OneBot 桥已完成并通过全链路模拟**；缺真实 QQ、真实发送授权链、受限抓取代理、模型路由、真实模型行为评测。 |
| P2 | 未开始。 |

## 验证证据

| 项 | 命令 | 结果 |
|---|---|---|
| 插件单测 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | 113/113 PASS |
| 桥单测 | `node --test bridge/onebot/test/*.test.mjs` | 8/8 PASS |
| 原生 DSH 验收 | `node packages/dsh-fish-v3/sim/native-dsh.mjs fish-v3 3083` | 10/10 PASS（含群聊未点名沉默、点名回复） |
| 全链路模拟 | `node bridge/onebot/sim/e2e.mjs fish-v3 3084` | 6/6 PASS：假 NapCat → 桥 → 真实 DSH 真实模型 → 假 NapCat；签名拒绝、私聊回复、群聊未@沉默、非名单群拒绝、群聊@回复、重投不二次发送 |
| 只读预检 | `node packages/dsh-fish-v3/sim/doctor.mjs` | PASS |

## 下一步：接真实 QQ（需要用户提供/授权）

1. NapCat 部署位置与 HTTP API 地址；机器人 QQ 号。
2. 首批允许名单（哪些群、哪些私聊）。
3. 授权范围：仅被动回复，还是也允许主动发言。
4. 届时改动：`/say` 放开 `mode: live`（DSH 侧也校验允许名单）、桥发送记录落盘、配置原生入站凭据、发布 3.2.2。

## 相关文档

[桥 README](../bridge/onebot/README.md) · [聊天隔离](chat-isolation.md) · [入站恢复](ingress-recovery.md) · [凭据](credentials.md) · [配置矩阵](configuration.md) · [测试](testing.md) · [安全](security.md)
