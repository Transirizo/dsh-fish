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
| `FISH_ALLOWLIST` | `private:QQ号,group:群号`，逗号分隔；**不设置＝信任 NapCat 已过滤（全放行）**；设了才过滤 |
| `FISH_SAY_TOKEN` | 与 DSH 凭据 `DSH_FISH_INGRESS_TOKEN` 相同（≥32 字节） |
| `FISH_SAY_URL` | 默认 `http://127.0.0.1:3080/dsh-fish-v3/say` |
| `FISH_LISTEN` | 默认 `127.0.0.1:6199`，填到 NapCat 的 HTTP 上报地址 |
| `FISH_INBOUND_SECRET` | 与 NapCat 上报 secret 一致（强烈建议） |
| `NAPCAT_API` / `NAPCAT_TOKEN` | NapCat HTTP API 地址与 access token |
| `FISH_SEND_ENABLED` | `true`/`false` 显式；不设或 `auto` 时跟随 DSH 设置页的「真实平台回复」开关（`sendingEnabled`） |
| `FISH_STATE_FILE` | 去重状态文件，默认 `/app/bridge-state.jsonl`；重启后恢复已处理事件，避免重发 |

```bash
node bridge/onebot/index.mjs
```

## 已知限制

- **`/say` 的 `mode:live` 需要 DSH 设置里「真实平台回复」开关打开**，否则返回 403。桥发的就是 `mode:live`；诊断/离线测试仍可用 `mode:simulation`。
- 去重状态已落盘（`FISH_STATE_FILE`），桥重启后恢复；NapCat 重投已处理事件不会再发送。
- 只处理文本段与 @；图片、表情、回复引用被丢弃。
- 不支持 NapCat 反向 WebSocket，只支持 HTTP 上报 + HTTP API。
- 单进程串行；`/say` 本身同一时间只处理一个回合，群里消息多时会返回 busy（429），当前直接丢弃不排队。

## 测试

```bash
node --test bridge/onebot/test/*.test.mjs
node bridge/onebot/sim/e2e.mjs fish-v3 3084   # 需要诊断 profile；会消耗少量模型额度
```
