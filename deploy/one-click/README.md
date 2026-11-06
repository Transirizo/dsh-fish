# 大肥鱼一键部署（上游 `@ssamurias/dsh-fish`）

一个脚本起好 **DSH + NapCat + 桥** 三件套，全部走 compose 内网、不暴露公网。
插件从 npm 装上游 `@ssamurias/dsh-fish`（默认 0.9.1），不再是本仓库的 v3。

> **状态：首版，未在全新主机完整实测。** 拓扑来自 2026-11-06 的真实接线；跑不通把报错贴回来改。

## 用法

```bash
git clone <本仓库>
cd dsh-fish/deploy/one-click
./setup.sh <机器人QQ号>
```

前置：宿主机有 docker + docker compose，能访问 npm registry。

## 脚本做了什么

1. 生成两个密钥：NapCat 上报签名（`FISH_INBOUND_SECRET`）、NapCat HTTP 服务 token；
2. 建 `data/dsh/profiles/web`（`dsh-base` + `dsh-web-app`），用 harness 镜像里的 `dsh`
   装 `@ssamurias/dsh-fish`；
3. 给上游 `lib/say.js` 打 issue #51 补丁（普通聊天正文也作为 `herReply` 返回）；
4. 先起 DSH + NapCat；等 DSH 第一次启动写出 `client-connection/browser-session` 密钥；
5. 用 `scripts/read-dsh-secret.mjs` 取这个密钥，写进 `bridge.env` 的 `FISH_DSH_SECRET`；
6. 起桥（`FISH_PROTOCOL=dsh-fish`、`FISH_SAY_URL=http://dsh:3080/dsh-fish/say`）；
7. 生成 NapCat 的 `onebot11_<qq>.json`。

顺序很重要：**先 DSH 后桥**。上游的 `/dsh-fish/*` 在 DSH 的 connection 信任栅栏后面，
桥要拿 DSH home 里的签名密钥自签 `dsh-auth-…` cookie；这个密钥是 DSH 首次启动才写出来的。

## 手动步骤（脚本化不了）

1. **扫码登录**：打开 `http://127.0.0.1:16099/webui`，用机器人 QQ 扫码。
   登录 token 脚本会尝试从 NapCat 配置/日志里打印；没读到就手动看
   `docker compose logs napcat | grep -i token`。
2. **发一条私聊**：桥日志应出现 `协议：dsh-fish` → `收到上报` → `sent`。
3. 不需要再去 DSH 设置页打开什么「真实平台回复」——上游没有这个全局开关；发送由桥的
   `FISH_SEND_ENABLED=true` 控制。

## 拓扑

```text
QQ → NapCat(httpClients → http://bridge:6199) → 桥 → DSH /dsh-fish/say(http://dsh:3080，真实模型)
QQ ← NapCat(httpServers :3000) ← 桥（send_private_msg / send_group_msg）
```

三个服务在 `fishnet` 网络里，靠容器名互访；DSH 与 NapCat 的端口只发布到宿主机回环
（`127.0.0.1:13080` / `127.0.0.1:16099`）。远程访问走 SSH 隧道：

```bash
ssh -L 13080:127.0.0.1:13080 -L 16099:127.0.0.1:16099 user@vps
```

DSH 的启动命令带 **`--trusted-host dsh`**：桥用 `http://dsh:3080` 访问 `/dsh-fish/*`，这个 Host
必须写进信任栅栏，否则返回 403 `say-forbidden`。compose 里已经写好，不要删。

**它安全吗**：`--trusted-host` 只放宽 Host 栅栏，不认证、不放行；过了栅栏仍要 `dsh-auth-…`
cookie。风险在于 `dsh` 是可预测的名字，所以前提是**端口不暴露公网**（本 compose 已绑回环）。
详见 [`docs/upstream-dsh-fish.md`](../../docs/upstream-dsh-fish.md)。

## 数据目录

- `data/dsh/` — DSH profile、凭据、运行数据（**持久卷，迁移时保留**）
- `data/workspace/` — DSH 的 `/workspace`（她的 `/workspace/.dsh-fish` 家在这里，**持久卷**）
- `data/napcat/` — NapCat 配置 + QQ 登录态
- `data/bridge.env` — 桥环境（含 `FISH_DSH_SECRET`，权限 600，gitignored）
- `data/bridge-state/` — 桥去重状态

## 从旧版 v3 迁移（已在跑 one-click 栈）

```bash
cd deploy/one-click
./migrate-to-upstream.sh <机器人QQ号>
```

它会：备份 → 摘掉 profile 里 `dsh-fish-v3` 的依赖/bundles/覆盖行（不删数据）→ 装上游 →
打 say 补丁 → 重建 DSH（应用 `--trusted-host dsh`）→ 取新密钥 → 改 `bridge.env` →
重建桥。旧版数据目录 `~/.dsh/dsh-fish-v3` / `~/.dsh-fish` 不动。

回滚只看 `bridge.env` 备份（`data/migration-backup-<时间>/`）；DSH 侧回滚要重新装 v3。

## 从一台 VPS 迁到另一台

```bash
# 旧机
cd deploy/one-click && ./export-data.sh          # 生成 dsh-fish-data-<时间>.tar.gz
# 传到新机（scp，别进 git），新机 clone 仓库后：
cd deploy/one-click && ./import-data.sh dsh-fish-data-<时间>.tar.gz
```

包里有 DSH 凭据、`FISH_DSH_SECRET`、NapCat token 和 QQ 登录态；详见 [VPS 迁移](../../docs/vps-migration.md)。

## 公网访问

默认所有端口只绑 `127.0.0.1`。公网有两种接法：

### 宝塔 / 外部 Nginx 反代（推荐，已有面板时）

```bash
cd deploy/one-click
./set-public-host.sh fish.example.com
```

它只写 `.env`（`PUBLIC_HOST` / `PUBLIC_URL`）并重建 dsh，让 DSH 带
`--trusted-host fish.example.com --public-url https://fish.example.com/`；
TLS 和密码由宝塔负责。站点配置片段：[`baota-reverse-proxy.conf`](baota-reverse-proxy.conf)，
步骤见 [`docs/public-access-baota.md`](../../docs/public-access-baota.md)。

**关键**：宝塔反代必须 `proxy_set_header Host $host;`，否则 DSH 铸的 cookie 是
`127.0.0.1:13080` 的，公网域名下登录会循环。

### 内置 Caddy（没有面板时）

```bash
./enable-public.sh fish.example.com
```

起 Caddy：自动 TLS + basic auth（用户名 `fish`），反代到 `dsh:3080`；关闭 `./disable-public.sh`。
细节：[`docs/public-access.md`](../../docs/public-access.md)。

两种方式都保持：`13080` 只绑回环、`/dsh-fish/*` 公网 404。

**NapCat WebUI 默认不暴露**；如果一定要公网，用第二个子域名（如 `napcat.example.com`）反代到
`127.0.0.1:16099`，并且至少加独立强密码 + IP 白名单 + WebSocket；片段见
[`baota-napcat-reverse-proxy.conf`](baota-napcat-reverse-proxy.conf)。更稳的是只给 SSH/Tailscale。

## 排错

| 桥日志 | 原因 | 处理 |
|---|---|---|
| `say-forbidden` | DSH 不认 `dsh:3080` 这个 Host | 确认 `docker-compose.yml` 的 dsh `command` 有 `--trusted-host dsh`，重建 dsh |
| `say-unauthorized` | `FISH_DSH_SECRET` 不对/为空 | 重跑 setup，或从 `data/dsh/.credentials.yaml` 重新取 |
| `say-unreachable` | 桥到不了 `dsh:3080` | 确认三个容器都在 `fishnet`；`docker compose ps` |
| `silent` / `empty-response` | say 补丁没打上（上游 0.9.1 的 #51） | 重跑 `scripts/patch-dsh-fish-say.mjs`，或把 `FISH_DSH_REPLY=session` 并确认 `./data/dsh:/dsh-home:ro` 挂载 |
| `not-mentioned` | 群聊没 @ 机器人 | 正常；要每条都回设 `FISH_GROUP_REQUIRE_AT=false` |

## 已知限制

- 上游 0.9.1 的 `/say` 回话依赖 issue #51 补丁；上游升级后先看新版是否已修复，再决定是否保留补丁。
- NapCat 的 OneBot 配置字段有版本差异（`token` vs `secret`）；本脚本按新版 `token` 生成。
- 桥单进程串行；群里消息多时 `429 busy` 会丢弃，不排队。
