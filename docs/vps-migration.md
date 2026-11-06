# 从一台 VPS 迁到另一台 VPS

状态：脚本已实现（2026-11-06），**未在两台真实 VPS 上跑过**。

适用：你已经在一台 VPS 上用 `deploy/one-click/setup.sh` 跑起大肥鱼（上游 dsh-fish），
现在要整体搬到另一台 VPS，**保留她的记忆、日记、DSH 会话、QQ 登录态和桥的去重状态**。

## 数据在哪

一套 one-click 栈的全部可迁移数据都在 `deploy/one-click/data/`：

| 路径 | 内容 | 迁不迁 |
|---|---|---|
| `data/dsh/` | DSH home：profile、插件、凭据、`sessions/`、`storages/` | 迁（不迁 `chrome-profile`） |
| `data/workspace/` | DSH 的 `/workspace`，她的家 `/workspace/.dsh-fish`（事件流、日记、立场、`home.json`） | **必须迁** |
| `data/napcat/config/` | OneBot 配置 | 迁 |
| `data/napcat/qq/` | QQ 登录态 | 迁（换机可能仍要重新扫码） |
| `data/bridge-state/` | 桥去重状态 | 迁（避免旧消息重发） |
| `data/bridge.env` | 桥环境（含 `FISH_DSH_SECRET`、NapCat token） | 迁（**含密钥**） |
| `data/dsh/chrome-profile/` | 浏览器缓存，体积大、与迁移无关 | 不迁 |
| `data/workspace/.dsh-fish/instance.json`、`*.lock` | 旧机器的租约/锁 | 不迁（导入时清掉） |

## 旧 VPS：导出

```bash
cd ~/dsh-fish/deploy/one-click
./export-data.sh
# 默认生成 dsh-fish-data-<时间>.tar.gz，权限 600
```

导出期间会 `docker compose stop`，结束后自动 `start`；QQ/DSH 断几十秒。
包里含凭据、`browser-session` 密钥、NapCat token、QQ 登录态——**用 scp 走加密通道**，别进 git。

## 新 VPS：导入

前置：docker + docker compose；clone 本仓库；**不要先跑 `setup.sh`**（导入包自带 profile、插件、
凭据、桥环境；先跑 setup 会生成一套新密钥再被覆盖，容易对不上）。

```bash
git clone <你的仓库> ~/dsh-fish
cd ~/dsh-fish/deploy/one-click

scp old-vps:~/dsh-fish/deploy/one-click/dsh-fish-data-XXXX.tar.gz .
./import-data.sh dsh-fish-data-XXXX.tar.gz
```

`import-data.sh` 会：

1. 停掉目标机现有栈（如果有）；
2. 把现有 `data/` 改名为 `data.before-import-<时间>`（不删）；
3. 解包；
4. 删掉旧机器的 `instance.json` / `.talk-session.lock` / `session.lock`（租约与锁不能跨机）；
5. `chown -R 1000:1000 data`，`bridge.env` 和 `.credentials.yaml` 保持 600；
6. `docker compose up -d`，等 DSH 的 401。

成功后发一条 QQ 私聊，桥日志应是 `协议：dsh-fish → 收到上报 → sent`。

## 必须知道的点

- **镜像/架构要一致**：`data/dsh/profiles/web/node_modules` 是随包拷的；目标机如果换了架构
  （amd64 ↔ arm64）或换了 DSH 镜像，先按下面的「换镜像/换架构」重装插件，再恢复数据。
- **NapCat 换机可能要重新扫码**：`data/napcat/qq` 是登录态，但设备指纹/IP 变化可能掉线；
  WebUI 在 `http://<新机>:16099/webui`。
- **DSH 的 GUI token 不迁移**：它是进程级随机数，新机从 `docker compose logs dsh` 里取新的。
- **`bridge.env` 里的 secret 必须和 `data/dsh/.credentials.yaml` 里的一致**：两个都从旧机整体
  拷过来就自然一致；只拷一个会 `say-unauthorized`。
- **端口冲突**：新机 `DSH_PORT`（默认 13080）和 `NAPCAT_WEB_PORT`（默认 16099）被占用时，
  在 `docker compose` 的环境里改，或改 `bridge.env` 里对应的地址。
- **旧机保留**：确认新机跑通再关旧机；旧机的 `data/` 不要删，至少留一个版本。

## 换镜像/换架构（不支持热拷 node_modules 时）

1. 新机先正常跑一次 `./setup.sh <QQ>`（它会把 upstream 和依赖按新架构装好）；
2. `docker compose stop`；
3. 只把旧机的这些覆盖过来：
   - `data/workspace/`（她的家）
   - `data/dsh/sessions/`、`data/dsh/storages/`（DSH 会话与工作区登记）
   - `data/napcat/config/`、`data/napcat/qq/`
   - `data/bridge-state/`
   - 旧 `data/dsh/.credentials.yaml`（让 `FISH_DSH_SECRET` 与 `bridge.env` 对得上；
     若新机 setup 生成了新的 `bridge.env`，用旧机的 `FISH_DSH_SECRET` 覆盖它）
4. 清 `instance.json` / `*.lock`，`chown -R 1000:1000 data`；
5. `docker compose up -d`。

## 回滚

新机导入前的数据在 `data.before-import-<时间>/`；停栈后把它改回 `data` 即可。
旧机没有被修改，随时可以切回去。

## 不做的事

- 不迁移 `chrome-profile`（浏览器缓存，跟她的记忆无关）；
- 不迁移 DSH GUI token（进程级）；
- 不迁移 `instance.json`（旧机租约，跨机会让新机误判“家里有人”而只读）。
