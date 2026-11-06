# 大肥鱼 OneBot 桥（NapCat）

独立进程，**不在 DSH 插件里**。只做协议转换与发送授权，不持有模型、记忆或身份。

```text
NapCat（HTTP 上报）→ 桥（签名校验、允许名单、去重）→ DSH /dsh-fish-v3/say（真实模型）
                                                      ↓
NapCat（HTTP API send_*_msg）← 桥（发送闸：开关、冷却、日上限）
```

## 状态

| 项 | 状态 |
|---|---|
| OneBot v11 消息事件解析（私聊/群、@识别、过滤自身） | 已实现，单测 |
| 允许名单（空=全拒）、上报 HMAC-SHA1 签名校验 | 已实现，单测 + e2e |
| 事件去重（NapCat 重投不二次发送） | 已实现，单测 + e2e |
| 群聊未@沉默（不调模型） | 插件侧实现，单测 + 原生 DSH 验收 |
| 发送闸：默认 dry-run；冷却 3s；日上限 50；结果未知不重发 | 已实现，单测 |
| 全链路：假 NapCat ⇄ 桥 ⇄ 真实 DSH 真实模型 | **6/6 PASS**（`sim/e2e.mjs`） |
| 真实 NapCat / 真实 QQ 账号 | **未验证**，需用户授权与 NapCat 部署信息 |

## 运行（等授权后）

所有配置走环境变量，不要放在命令行参数里：

| 变量 | 说明 |
|---|---|
| `FISH_SELF_ID` | 机器人 QQ 号 |
| `FISH_ALLOWLIST` | `private:QQ号,group:群号`，逗号分隔；空 = 全部拒绝 |
| `FISH_SAY_TOKEN` | 与 DSH 凭据 `DSH_FISH_INGRESS_TOKEN` 相同（≥32 字节） |
| `FISH_SAY_URL` | 默认 `http://127.0.0.1:3080/dsh-fish-v3/say` |
| `FISH_LISTEN` | 默认 `127.0.0.1:6199`，填到 NapCat 的 HTTP 上报地址 |
| `FISH_INBOUND_SECRET` | 与 NapCat 上报 secret 一致（强烈建议） |
| `NAPCAT_API` / `NAPCAT_TOKEN` | NapCat HTTP API 地址与 access token |
| `FISH_SEND_ENABLED` | 只有 `true` 才真实发送，否则只记录 |

```bash
node bridge/onebot/index.mjs
```

## 已知限制

- **`/say` 目前只接受 `mode: simulation`**：桥发出的请求也带这个标记。插件侧的“真实平台模式”尚未放开，等授权时一起改；届时 `mode` 会改为 `live`，并要求 DSH 侧也配置允许名单。
- 去重表在桥内存里，桥重启后靠 `/say` 账本兜底：`/say` 对同一事件返回同一结果，但桥会再发一次。真机前需要把发送记录落盘。
- 只处理文本段与 @；图片、表情、回复引用被丢弃。
- 不支持 NapCat 反向 WebSocket，只支持 HTTP 上报 + HTTP API。
- 单进程串行；`/say` 本身同一时间只处理一个回合，群里消息多时会返回 busy（429），当前直接丢弃不排队。

## 测试

```bash
node --test bridge/onebot/test/*.test.mjs
node bridge/onebot/sim/e2e.mjs fish-v3 3084   # 需要诊断 profile；会消耗少量模型额度
```
