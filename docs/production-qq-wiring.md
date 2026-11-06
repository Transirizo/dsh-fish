# 真实 QQ 接线记录（2026-11-06）

生产 VPS（`ns552112`）上已把大肥鱼接入真实 QQ，私聊真发验证通过。本文记录实际拓扑与接线，**不含任何密钥/token**。

## 拓扑

三个部件都在**宿主机**上，靠 docker 网络 + 宿主机回环互通：

| 部件 | 形态 | 关键端口 |
|---|---|---|
| DSH | docker 容器 `dsh-fish-deepseek-harness-1` | 发布 `127.0.0.1:3080->3080`（`/dsh-fish-v3/say`、`/health`） |
| NapCat | docker 容器 `napcat`（`mlikiowa/napcat-docker`） | 发布 `127.0.0.1:6099->6099`（WebUI）；OneBot HTTP 服务在容器内 `0.0.0.0:3000` |
| 桥 | docker 容器 `dsh-fish-bridge`，**`--network=host`** | 监听 `0.0.0.0:6199`（NapCat HTTP 上报目标） |

关键点：DSH 和 NapCat 的端口都只发布到宿主机回环 `127.0.0.1`，所以**只有宿主机能同时摸到两边**。桥用 `--network=host` 共享宿主机网络栈，于是能 `127.0.0.1:3080` 连 DSH、`192.168.176.3:3000` 连 NapCat。

## 数据流

```
QQ 消息 → NapCat(httpClients 上报 192.168.176.1:6199) → 桥 → DSH /say(127.0.0.1:3080, 真实模型)
                                                                       ↓
QQ 回复 ← NapCat(httpServers 3000, send_private_msg) ← 桥 ← 桥 dry-run/真发闸
```

- NapCat `httpClients`（HTTP 上报）：`url = http://192.168.176.1:6199`（`192.168.176.1` 是宿主机在 NapCat 网络的网关地址）。
- NapCat `httpServers`（HTTP 服务）：`host=0.0.0.0, port=3000`，供桥调 `/send_private_msg`、`/send_group_msg`。
- 桥的 `FISH_SAY_URL=http://127.0.0.1:3080/dsh-fish-v3/say`，`NAPCAT_API=http://192.168.176.3:3000`（`192.168.176.3` 是 NapCat 容器 IP）。

## 桥的运行方式

```bash
docker run -d --restart=unless-stopped --name dsh-fish-bridge \
  --network=host \
  --user 0:0 \
  -v /chc/dsh-fish/bridge-onebot:/app:z \
  -w /app \
  --env-file /chc/dsh-fish/bridge-onebot/.env.prod \
  --entrypoint node \
  runzhliu/deepseek-harness:0.2.2-rc.1-r1 \
  index.mjs
```

踩坑记录：

- `docker restart` **不会**重读 `--env-file`，改环境变量必须 `docker rm -f` 后重建。
- 代码文件原为 `600`（属主 node），跨容器挂载报 `EACCES`；用 `--user 0:0` + 挂载 `:z`（SELinux）解决。
- 桥监听 `0.0.0.0:6199` 是为了让 NapCat 容器经宿主机网关 `192.168.176.1` 够到它；宿主机回环 `127.0.0.1:6199` 从容器里够不到。

## 已验证

- 私聊消息 → 真实模型回话 → 真发回 QQ：桥日志 `sent sent`，DSH `/say` 账本 completed 递增。
- 群聊未点名沉默、点名回复：模拟通过；**真机未实测**。

## 已知限制

- 桥的**事件去重表在内存**：桥重启后，NapCat 若重投同一 `message_id`，DSH 会返回同一结果、但桥会再发一次。需把「已发送 eventId」落盘（待做）。
- NapCat `httpClients` 的 `reportSelfMessage: true` 会把机器人自己发的消息也上报回来；桥按 `post_type != message` 正确跳过，但日志有噪音。可改成 `false`。
- 只支持文本 + @；图片/表情/回复引用丢弃。
- 只支持 NapCat HTTP 上报 + HTTP API；不支持反向 WebSocket。
- 单进程串行；`/say` 同时只处理一个回合，群里消息多时返回 busy(429) 丢弃，不排队。

## 安全边界（现状）

- DSH `/say` 需要 `Bearer` 原生凭据（`DSH_FISH_INGRESS_TOKEN`），未配置时 401。
- 桥到 DSH 用 `FISH_SAY_TOKEN`（与上述凭据同值）；NapCat 上报带 `x-signature` HMAC-SHA1（`FISH_INBOUND_SECRET`）。
- NapCat OneBot HTTP 服务（3000）绑 `0.0.0.0`，仅 docker 网段可达，靠 `token` 认证。
- 真实发送有两道闸：DSH 设置「真实平台回复」开关 + 桥 `FISH_SEND_ENABLED`。
