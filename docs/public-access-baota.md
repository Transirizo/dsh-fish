# 宝塔面板反代 DSH（公网访问）

状态：脚本与配置片段已提供（2026-11-06），**未在真实宝塔环境跑过**。

不走内置 Caddy；TLS 和密码交给宝塔的 Nginx。DSH 仍然只绑 `127.0.0.1:13080`，
宝塔在同机反代过去。

## 架构

```text
Internet ──443/TLS──> 宝塔 Nginx（站点 + basic auth）
                         ├─ /dsh-fish/*   → 404（桥只走内网）
                         └─ /               → http://127.0.0.1:13080（DSH）
DSH 13080 只绑 127.0.0.1；NapCat 16099 不暴露
```

## 步骤

### 1) 让 DSH 认识公网域名

```bash
cd /path/to/dsh-fish/deploy/one-click
./set-public-host.sh fish.example.com
```

它写 `.env`（`PUBLIC_HOST` / `PUBLIC_URL`）并重建 dsh，让启动参数变成：

```
--trusted-host dsh --trusted-host fish.example.com --public-url https://fish.example.com/
```

`--trusted-host` 必须带域名：宝塔转发时 `Host` 是公网域名，DSH 的 Host 栅栏不认它就 403。

### 2) 宝塔建站 + 反代

1. 宝塔 → 网站 → 添加站点：域名 `fish.example.com`；
2. SSL → Let's Encrypt 申请证书，打开「强制 HTTPS」；
3. 反向代理 → 目标 URL：`http://127.0.0.1:13080`；
4. 打开站点「配置文件」，把面板生成的 `location / { ... }` **替换**成
   [`baota-reverse-proxy.conf`](../deploy/one-click/baota-reverse-proxy.conf) 里的内容
   （含 `/dsh-fish/` 404、`Host $host`、WebSocket、关 buffering）；
5. 保存，宝塔会 `nginx -t` 并 reload。

**最容易错的一行是 `proxy_set_header Host $host;`。** 少了它，Nginx 默认把 Host 改成
`127.0.0.1:13080`，DSH 铸出的 cookie 是给 `127.0.0.1:13080` 的，浏览器在公网域名下不会带，
表现就是「basic auth 过了但 DSH 一直登录循环」。

### 3) 宝塔加密码

宝塔 → 网站 → 设置 → **访问限制**（或「密码访问」），启用 basic auth，用户名密码自定。
这一层是公网的主要门；DSH 自己的 token/cookie 是第二层。

### 4) 验证

- 浏览器打开 `https://fish.example.com/`，先过 basic auth，再用
  `docker compose logs dsh | grep token=` 里的 token URL 换 cookie（之后直接进）；
- 发一条 QQ 私聊，桥日志仍是 `协议：dsh-fish → 收到上报 → sent`（桥走内网，和公网入口无关）。

## 两个 WebUI 都公开（NapCat 不建议）

DSH 和 NapCat 用**两个子域名**，不要塞进同一个域名的不同路径（两者的前端都按根路径写死）：

| 域名 | 反代到 | 片段 |
|---|---|---|
| `fish.example.com` | `http://127.0.0.1:13080` | `baota-reverse-proxy.conf` |
| `napcat.example.com` | `http://127.0.0.1:16099` | `baota-napcat-reverse-proxy.conf` |

> **⚠️ NapCat WebUI 是 QQ 账号的控制台。** 公开暴露意味着：弱密码、token 泄露、面板漏洞，
> 任何一个都可能让号被登走。能用 Tailscale / SSH 隧道就不要给它公网域名。

如果一定要公开，至少四层：

1. 独立子域名 + Let's Encrypt；
2. 宝塔「访问限制」：**和 DSH 不同的**强密码；
3. 站点配置里加 **IP 白名单**（`allow 你的出口IP; deny all;`）；
4. NapCat 自己的 WebUI token（`docker compose logs napcat | grep -i token`）照旧保留。

其余：

- 两个站点的 WebSocket 都要开（片段里已带 `Upgrade`/`Connection`）；
- NapCat 的 OneBot HTTP API `3000` **绝不要**发布或反代（桥走内网 `napcat:3000`）；
- `13080` / `16099` 仍然只绑 `127.0.0.1`，公网只开宝塔的 80/443；
- 不用 NapCat 面板时，宝塔里把站点停掉，减少暴露面。

## 安全边界

- **13080 / 16099 不公网**：compose 已绑 `127.0.0.1`；只让宝塔的 80/443 对外。
- **NapCat 不反代**：它有 QQ 登录态；扫码用
  `ssh -L 16099:127.0.0.1:16099 user@vps`。
- **`/dsh-fish/*` 公网 404**：桥的入站口只给 compose 内网；不要为了「方便」把它反代出去。
- **密码要强**：basic auth 没有限速；用 20 位以上随机串，宝塔面板本身也别用弱密码。
- **cookie 不是 Secure**：TLS 在宝塔终止，DSH 看到的是 HTTP，`dsh-auth-…` 没有 `Secure`
  标记。宝塔已强制 HTTPS；要更高保证用 Tailscale / Cloudflare Access。
- **别同时开内置 Caddy**：`set-public-host.sh` 会移除 caddy 容器；两套入口会抢 80/443。
- **日志**：宝塔访问日志会记路径；DSH 的 token URL 别贴公开地方。

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 403 `forbidden` | DSH 不认公网 Host | `.env` 有 `PUBLIC_HOST` 吗？dsh 重建过吗？（`./set-public-host.sh` 会做） |
| basic auth 后登录循环 | Nginx 没保留 `Host $host` | 按片段加 `proxy_set_header Host $host;`，reload |
| 502 | 13080 没起/没绑回环 | `docker compose ps`、`curl -I http://127.0.0.1:13080/`（应 401） |
| 页面能开但消息不动 | WebSocket 被缓冲/未升级 | 确认 `Upgrade`/`Connection`/`proxy_buffering off` |
| `/dsh-fish/*` 404 | 正常（公网禁用） | 桥走内网，不用管 |
| 证书申请失败 | 80/443 被占/DNS 未指 | 宝塔 SSL 页看错误；先放行 80/443 |

## 与内置 Caddy 的关系

`enable-public.sh` 是「没有宝塔/不想装面板」时的可选方案；你用宝塔就只跑
`set-public-host.sh`，别跑 `enable-public.sh`。两者都靠同一套 `--trusted-host/--public-url`
让 DSH 接受外部反代，区别只是 TLS/basic auth 由谁做。
