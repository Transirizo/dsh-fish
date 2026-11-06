# 上游 `@ssamurias/dsh-fish` 接入说明

状态：脚本与桥已实现（2026-11-06）；**真实 VPS 全新安装未完整实测**。

## 为什么换成上游

本仓库原来的 `packages/dsh-fish-v3` 是自研插件（身份/记忆/会话策略）。上游
`@ssamurias/dsh-fish` 提供更完整的事件流成长、日记、B 站等能力，并且自带 `/dsh-fish/say`
给外部桥接入。现在的分工是：

- 上游插件：人格、记忆、成长、`/dsh-fish/say`；
- 本仓库 `bridge/onebot/`：QQ（OneBot v11）↔ DSH；
- 本仓库 `deploy/` + `scripts/`：装、迁、回滚。

`packages/dsh-fish-v3` 保留作历史与回滚，不再部署。

## 版本与 #51 补丁

默认装 npm 上的 `@ssamurias/dsh-fish@0.9.1`。

0.9.1 的 `/dsh-fish/say` 只把 `growth_commit` 类事件放进 `herReply`；普通聊天正文
（`assistant/message`）不进事件流，外部桥会收到「她这次没说话」（上游
[issue #51](https://github.com/ssamurias/dsh-fish/issues/51)，2026-11-06 仍开着）。

`scripts/patch-dsh-fish-say.mjs` 做三件事，全部只改 `lib/say.js`：

1. 在 `beginTurnWait` 的本轮监听里收集最后一条 `assistant/message` 的 text 正文；
2. 回合结束后，`herReply = 本轮正文 || committed`——**正文优先**；
3. `note` 的判定同步改成「有 commit 或有正文都不算没说话」。

第 2 条的顺序很重要。第一版补丁写的是 `committed || 正文`，结果是：她只要在一轮里
顺手 `growth_commit` 一句（比如"推给我的四条我一条都没点进去"），`/say` 的 `herReply`
就只含那句私下记下的话，桥发给 QQ 的也是它——DSH 会话里那一整段回复在 QQ 上完全看不到。
2026-11-06 晚用户实测到这一条，补丁已改成正文优先；旧补丁会被脚本识出并就地升级。

脚本是幂等的（已打过就跳过）；如果上游文件与 0.9.1 原文对不上，它**不会硬改**，
非零退出并提示先看新版是否已修 #51。

升级上游后：

```bash
# 先看新版是否已修；没修再跑补丁（对不上会拒绝）
docker run --rm -v "$PWD/deploy/one-click/data/dsh:/dsh-home" \
  -v "$PWD/scripts:/scripts:ro" --entrypoint node \
  runzhliu/deepseek-harness:0.2.2-rc.1-r1 \
  /scripts/patch-dsh-fish-say.mjs /dsh-home/profiles/web/node_modules/@ssamurias/dsh-fish/lib/say.js
```

## 鉴权：桥怎么过 DSH 的信任栅栏

上游的 `/dsh-fish/*` 在 DSH `connection` 的信任栅栏后面。外部桥不能再用 v3 那种
`Authorization: Bearer <token>`；它要的是一个 **DSH 会话 cookie**：

- cookie 名 `dsh-auth-<sha256(authority)>`，值 `v1.<payload>.<hmac>`；
- 签名密钥是 DSH home 里 `.credentials.yaml` 的
  `records['client-connection/browser-session'].payload.secret`（32 字节 base64url）；
- 桥启动时读这个密钥（`FISH_DSH_SECRET`，或 `FISH_DSH_HOME` 下的凭据文件），
  按 DSH 源码同样的算法离线铸造 cookie；
- 请求的 `Host` 必须与 cookie 里的 `authority` 一致。

两条部署拓扑：

| 拓扑 | 桥访问 DSH | Host 信任 |
|---|---|---|
| 同一 compose 网络（one-click） | `http://dsh:3080` | DSH 启动必须带 `--trusted-host dsh` |
| 桥用 host 网络 / 同机（add-to-dsh） | `http://127.0.0.1:<端口>` | 回环地址天然受信，不用额外参数 |

## `--trusted-host` 安全吗

`--trusted-host dsh` 只做一件事：把 `dsh` 这个 authority 加进 `/api` 的 **Host 栅栏**
（`connection.requestRejection` → `isTrustedApiRequest`）。它本身**不认证、不放行任何请求**；
过了 Host 栅栏之后，仍然需要 `dsh-auth-…` cookie 或 `/connect` 用进程 token 换出来的 API cookie。
DSH 的 `--help` 原话是 “grants no trust”。

为什么必须加：桥在 fishnet 里用 `http://dsh:3080`，Host 是 `dsh:3080`；不加就被判成不受信，
返回 403 `say-forbidden`。

风险与前提：

- 它让 `Host: dsh` 的请求不再被 Host/Origin 检查挡下。`dsh` 是可预测的名字，所以**只要端口
  不暴露到公网，这个放宽就只对 compose 内网/本机有效**；
- compose 已把 DSH/NapCat 端口绑在 `127.0.0.1`；远程访问用 SSH 隧道或带认证的反代，
  不要把 `13080` / `16099` 发布到 `0.0.0.0`；
- 如果 `dsh:3080` 的浏览器 cookie 泄露，`--trusted-host dsh` 会扩大它的重放面；cookie 的
  `authority` 是 `dsh:3080`，没有这个白名单，外部带同样 Host 也会被栅栏拦下。所以
  `.credentials.yaml`（含签名密钥）和 `bridge.env` 必须 0600，桥只跑本机/同一宿主机；
- 不想用它的替代方案：桥改 `--network=host`，用 `127.0.0.1:13080`（回环天然受信，
  不需要 `--trusted-host`），但桥就得按宿主机网络找 NapCat（容器 IP/网关），配置更脆。

## 从 v3 迁移

`deploy/one-click/migrate-to-upstream.sh` 与 `deploy/add-to-dsh/setup.sh` 都会先做：

- 从 profile 的 `dependencies` / `dsh.profile.bundles` 里摘掉 `dsh-fish-v3`；
- 从 `cordis.patch.yml` 删掉 `- id: dsh-fish-v3` 覆盖行（`scripts/strip-v3-attrs.mjs`，
  改前备份 `.bak-<时间>`）；
- **不删** `~/.dsh/dsh-fish-v3`、`~/.dsh-fish` 的数据。

然后装上游、打 say 补丁、重启 DSH、取密钥、改 `bridge.env`、重建桥。

## 验证

```bash
# 桥单测（含 dsh-fish 协议、cookie 铸造、会话兜底、index 端到端）
node --test bridge/onebot/test/*.test.mjs

# 装完后（在 DSH 所在机器上，带 cookie 的完整验证由桥日志给出）
docker compose -f deploy/one-click/docker-compose.yml logs --tail 20 bridge
# 期望：协议：dsh-fish → 收到上报 → sent
```

`say-forbidden` = Host 没进信任栅栏；`say-unauthorized` = `FISH_DSH_SECRET` 不对；
`silent` = 补丁没打上且会话兜底也没读到。

## 回滚

- 桥：用迁移前的 `data/migration-backup-<时间>/bridge.env` 覆盖，重建桥；
- 插件：重新安装旧版 v3（`packages/dsh-fish-v3`），v3 的数据还在；
- 上游数据在 DSH 的 home 下（默认 `~/.dsh-fish`，本沙盒因 `HOME=/workspace` 落在
  `/workspace/.dsh-fish`），迁移不碰它。

## 安全边界

- `browser-session` 密钥等于「能以 owner 身份调用宿主」的凭据。桥必须只跑在本机/同一宿主机；
  `.credentials.yaml` 保持 0600；不要把密钥写进聊天、日志、镜像层。
- 真实发送仍由桥的 `FISH_SEND_ENABLED=true` 控制；上游没有全局「真实平台回复」开关。
- 群聊默认只回 @（`FISH_GROUP_REQUIRE_AT=true`）。
