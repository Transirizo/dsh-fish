# 3.2.3 发布记录

2026-11-06。本次发布把「真实平台回复」开关从代码锁死改为设置项，并让桥发 `mode:live`，为接真实 QQ 铺路。

## 改动

1. **`sendingEnabled` 解锁**：`z.const(false)` → `z.boolean().default(false)`。默认仍关；在设置页勾选后，
   `/say` 才接受 `mode:live` 的真实消息并回话。真正投递（调 NapCat 发送）由桥的 `FISH_SEND_ENABLED` 独立控制。
2. **`/say` 放行 live**：`mode` 只接受 `simulation`（诊断/测试）与 `live`（真实平台）；`live` 在开关关闭时返回 403，
   其余字段校验不变。返回体的 `mode` 回显请求值。
3. **桥发 live**：`normalize.js` 由 `simulation` 改为 `live`；`e2e` 全链路模拟改用 `sendingEnabled:true` 验证真实路径。
4. **桥允许名单改为可选**：不设 `FISH_ALLOWLIST`＝信任 NapCat 已过滤（全放行）；设了才做第二道过滤。
   默认监听仍 `127.0.0.1:6199` + `FISH_INBOUND_SECRET` 签名校验。
5. **设置页只留真字段**：移除 `proactiveEnabled`/`proactiveHeartbeatMs`/`proactiveMaxPerDay`/`memoryRetentionDays`/
   `biliEnabled` 这几个「锁死/预留、开了没效果」的假开关；`sendingEnabled` 改名「真实平台回复（默认关）」。
6. `proactiveEnabled`/`biliEnabled`/`memoryRetentionDays` 仍代码级锁死（主动向外发言尚未实现）。

## 证据

| 项 | 结果 |
|---|---|
| 插件单测 | 116/116 PASS（+3：live 门控、未知 mode 拒绝、开关默认关可开启） |
| 桥单测 | 8/8 PASS（允许名单空数组全拒 / null 信任） |
| 全链路模拟 `bridge/onebot/sim/e2e.mjs fish-v3 3084` | 6/6 PASS（live 模式） |
| 生产健康 | `version=3.2.3`，`sendingEnabled=false`；`/say` 无凭据 401 |

Tarball SHA256：`7b5d622c4ecb750eb56dabd5f94d96ba861f0708577af7b8540a5acbd9291767`。
快照 `data/releases/3.2.3/package` 与源码 `diff -r` 一致。热切换（remove → install）生效，未重启。

## 接真实 QQ 前还差什么

- NapCat 的 **OneBot v11 HTTP 服务地址**（`NAPCAT_API`，host:port，可能有 access token）与机器人 QQ 号（`FISH_SELF_ID`）。
- 在 NapCat 里加一条 **HTTP 上报**指向桥 `http://127.0.0.1:6199/`，secret 与 `FISH_INBOUND_SECRET` 一致。
- DSH 原生凭据 `DSH_FISH_INGRESS_TOKEN`（桥的 `FISH_SAY_TOKEN` 与之相同）。
- 设置页勾选「真实平台回复」；桥 `FISH_SEND_ENABLED=true` 才真正外发。

## 回滚

`plugin_manager` remove → install 切回 `data/releases/3.2.2/package`（或 3.2.1），运行数据未迁移未删除。
