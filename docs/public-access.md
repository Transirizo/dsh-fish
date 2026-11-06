# 公网访问（内置 Caddy + basic auth）

状态：脚本已实现（2026-11-06），**未在真实公网 VPS 上跑过**。

> 如果你用宝塔面板做反代，请看 [`public-access-baota.md`](public-access-baota.md)，不要启用这里的 Caddy。

## 为什么不能直接把 13080 开出去

DSH 的 `/api` 和插件路由前面只有一道 **Host 栅栏**，它不是登录认证；DSH 自己的登录靠
URL 里的进程级 token 换 cookie。把 13080 直接发布到 `0.0.0.0` 等于把「Host 栅栏 + 一把
进程 token」暴露到公网：

- token 会出现在浏览器历史、日志、Referer 里；
- 没有 TLS，cookie 明文；
- `/dsh-fish/*` 也会一起暴露（桥的入站口不需要公网）。

## 架构

```text
Internet ──443/TLS──> Caddy（basic auth） ──fishnet──> dsh:3080
                     └─ /dsh-fish/* 一律 404
NapCat WebUI（16099）不暴露；扫码走 SSH 隧道
DSH 13080 仍然只绑 127.0.0.1
```

- Caddy 自动申请 Let's Encrypt 证书（需要 80/443 和正确 DNS）；
- basic auth 用户名固定 `fish`，密码哈希只进 `.env`（600），不落明文；
- Caddy 保留原始 `Host`，DSH 用 `--trusted-host <域名> --public-url https://<域名>/` 接住；
- `/dsh-fish/*` 与 `/dsh-fish-v3/*` 在公网直接 404，桥仍走内网 `dsh:3080`。

## 开启

前提：域名 A/AAAA 已指向 VPS；防火墙放行 80/443；栈已经 `setup.sh` 装好。

```bash
cd deploy/one-click
./enable-public.sh fish.example.com
```

它会：

1. 用 `caddy hash-password` 生成 bcrypt 哈希；
2. 写 `.env`（`PUBLIC_HOST` / `PUBLIC_URL` / `BASIC_AUTH_HASH`，600）；
3. `docker compose -f docker-compose.yml -f docker-compose.public.yml up -d`
   —— 重建 dsh（带公网 Host/URL），起 Caddy。

然后访问 `https://fish.example.com/`，用户名 `fish`，密码是你刚设的。
DSH 自己的登录 token/cookie 仍然生效（第一次用 `docker compose logs dsh | grep token=`
里的 URL 换 cookie；之后浏览器直接进）。

## 关闭

```bash
./disable-public.sh
```

停 Caddy、删 `.env`、把 dsh 重建回本机模式；证书缓存在 `data/caddy`，下次不用重签。

## 安全边界（务必看）

- **密码要强**：basic auth 没有限速，弱密码会被撞。建议 20 位以上随机串。
- **不要**把 `13080` 或 `16099` 发布到 `0.0.0.0`；compose 已绑 `127.0.0.1`，别改回去。
- **NapCat WebUI 不公网**：它有 QQ 登录态；扫码用
  `ssh -L 16099:127.0.0.1:16099 user@vps`。
- **`/dsh-fish/*` 不公网**：Caddy 已 404；桥只在内网。
- **凭据文件 600**：`data/dsh/.credentials.yaml`、`data/bridge.env`、`.env`。
- **DSH 的 token URL 别外传**：它是进程级 bearer；basic auth 是外层，token/cookie 是内层。
- **日志**：Caddy 会记访问日志（默认 stdout）；不要把带 token 的 URL 贴进公开地方。
- **cookie 不是 Secure**：TLS 在 Caddy 终止，DSH 看到的监听是 HTTP，所以它铸出的
  `dsh-auth-…` 没有 `Secure` 标记。Caddy 已加 HSTS 并强制 HTTPS；如果连 HTTP 首跳都担心，
  用 Tailscale / Cloudflare Access，或给 DSH 自己配 TLS（`--tls-cert/--tls-key`）。
- 如果前面再套 Cloudflare：ACME HTTP 挑战会被橙云挡住，需要改成 DNS 挑战或先灰云签发；
  Cloudflare Access 也可以直接替代 basic auth（更强）。

## 更省心的替代

- **Tailscale / WireGuard**：不开放任何公网端口，设备加入虚拟网后访问 `http://vps:13080`；
  安全性最高。
- **Cloudflare Tunnel + Access**：不需要公网 IP/端口，Access 做身份认证；配置比 Caddy 多一步。
- **SSH 隧道**：只给自己用，最省事。

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| Caddy 起不来/证书失败 | DNS 没指过来、80/443 没开、被 Cloudflare 橙云挡 | 查 `docker compose logs caddy`；先灰云或改 DNS 挑战 |
| 502 Bad Gateway | dsh 没起来 | `docker compose ps`、`docker compose logs dsh` |
| 403 `forbidden` | DSH 不认公网 Host | 确认 `.env` 有 `PUBLIC_HOST`，dsh 重建过（`./enable-public.sh` 会做） |
| basic auth 过了但 DSH 登录页循环 | token URL 没带/已过期 | 从 `docker compose logs dsh | grep token=` 取最新 URL |
| `/dsh-fish/*` 404 | 正常（公网禁用） | 桥走内网，不用管 |

## 相关

- `deploy/one-click/docker-compose.public.yml` — Caddy 服务
- `deploy/one-click/Caddyfile` — TLS + basic auth + 反代
- `deploy/one-click/enable-public.sh` / `disable-public.sh`
- [`docs/upstream-dsh-fish.md`](upstream-dsh-fish.md) — `--trusted-host` 的语义与风险
