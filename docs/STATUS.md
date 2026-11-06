# STATUS

更新于 2026-11-06（Asia/Shanghai）。只记录有证据的事实。

## 生产

- `web` profile 已运行 **dsh-fish-v3 3.2.3**（发布快照 `data/releases/3.2.3/package`），热切换生效、未重启：
  健康 `version=3.2.3`、`/say` 未配置凭据时 401。见 [3.2.3 发布记录](production-update-3.2.3.md)。
- 旧版 dsh-fish 0.8.8 与星驿（astrbot-relay）已按用户授权移除。
- 「真实平台回复」开关（`sendingEnabled`）已从代码锁死改为设置项，默认关；群聊未点名沉默闸门已进入生产。
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

## 下一步：接真实 QQ（只差 NapCat 的连接信息）

用户已自行部署并登录 NapCat，群/私聊名单在 NapCat 侧控制，DSH 只做对话与成长。只差桥能连上 NapCat：

1. NapCat 的 **OneBot v11 HTTP 服务地址**（`NAPCAT_API`，host:port + 可能的 access token）与机器人 QQ 号（`FISH_SELF_ID`）。
2. NapCat 里加一条 **HTTP 上报**指向桥 `http://127.0.0.1:6199/`，secret 与 `FISH_INBOUND_SECRET` 一致。
3. DSH 原生凭据 `DSH_FISH_INGRESS_TOKEN`（桥的 `FISH_SAY_TOKEN` 同值）；设置页勾「真实平台回复」；桥 `FISH_SEND_ENABLED=true` 才真正外发。

## 相关文档

[桥 README](../bridge/onebot/README.md) · [聊天隔离](chat-isolation.md) · [入站恢复](ingress-recovery.md) · [凭据](credentials.md) · [配置矩阵](configuration.md) · [测试](testing.md) · [安全](security.md)
