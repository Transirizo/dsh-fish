# 已有 DSH 接入大肥鱼（上游 `@ssamurias/dsh-fish`）

适用于：**DSH 已经在跑**，只想补上「上游插件 + 桥（+ 可选 OneBot 配置）」，不想再起一套 DSH。

> 桥说的是 **OneBot v11**，NapCat 只是默认例子；go-cqhttp / Lagrange 等同样可用。
> 状态：脚本已按 2026-11-06 的迁移流程改写，**未在全新机器完整实测**。

## 与一键部署的区别

| | `deploy/one-click/`（方案 A） | `deploy/add-to-dsh/`（本目录，方案 B） |
|---|---|---|
| 前提 | 什么都没有 | DSH 已在跑 |
| 起几个 DSH | 1 个新的 | 0 个（复用你的） |
| 桥的网络 | compose 内网，靠容器名 | **host 网络**（够得到 DSH 回环 + NapCat 容器 IP） |
| 插件来源 | npm 装上游 | 同样 npm 装上游 |

## 用法

```bash
cd deploy/add-to-dsh
./setup.sh <机器人QQ号>
```

可选项（一般自动探测就够）：

```bash
./setup.sh 3836840356 \
  --dsh-container dsh-fish-deepseek-harness-1 \
  --napcat-container napcat \
  --profile web \
  --napcat-ip 192.168.176.3
```

`--dsh-url` 只在探测不到端口时用，默认已经是 `http://127.0.0.1:<端口>/dsh-fish/say`。

### 在同一台机器上「试跑」而不碰生产

```bash
./setup.sh 3836840356 \
  --dsh-container dsh-clean \
  --bridge-name dsh-fish-bridge-test \
  --bridge-port 16199
```

## 脚本做了什么

1. 自动找 DSH 容器、它发布到宿主机的 3080 端口、NapCat 容器 IP 与网关；
2. 生成 NapCat 上报签名（`FISH_INBOUND_SECRET`）和 NapCat HTTP 服务 token；
3. **摘掉旧版**：把 `dsh-fish-v3` 从 profile 的 `dependencies` / `bundles` / `cordis.patch.yml`
   覆盖行里摘掉（不删 `node_modules`、不删数据；改前留 `.bak-<时间>`）；
4. **装上游**：`dsh plugin --profile <profile> add @ssamurias/dsh-fish`（已有则跳过）；
5. **打补丁**：`scripts/patch-dsh-fish-say.mjs` 给上游 `lib/say.js` 打 issue #51 补丁；
6. **重启 DSH**，等它写出 `client-connection/browser-session` 密钥；
7. 用 `scripts/read-dsh-secret.mjs` 取这个密钥；
8. 写桥的 `data/bridge.env`（`FISH_PROTOCOL=dsh-fish`、`FISH_SAY_URL=http://127.0.0.1:<端口>/dsh-fish/say`、
   `FISH_DSH_SECRET=…`、`FISH_SEND_ENABLED=true`），起 host 网络的桥；
9. 生成 NapCat 的 OneBot 配置到 `data/napcat-onebot11_<qq>.json`。

> 第 3 步很关键：旧版 v3 的依赖是 `file:/pkg.tgz`，那个包在镜像里已经不存在；
> 不先摘掉，`dsh plugin add` 的 pnpm 会直接报 `ENOENT /pkg.tgz`。

## 脚本没做（需要你手动确认）

1. 把 `data/napcat-onebot11_<qq>.json` 替换进 NapCat 容器（路径按你的版本，常见
   `/app/napcat/config/onebot11_<qq>.json`），然后 `docker restart <napcat容器>`；
2. 打开 DSH 设置页确认插件在（`设置 → 大肥鱼`）；
3. 给机器人发一条私聊，桥日志应出现 `协议：dsh-fish → 收到上报 → sent`。

## 已知限制

- 桥用 `--network=host`，默认假设 DSH 和 NapCat 都在这台宿主机上；跨机要自己改
  `FISH_SAY_URL` / `NAPCAT_API`。
- 安装/迁移会**重启一次 DSH**，GUI 断几秒。
- 上游 0.9.1 的 `/say` 回话依赖 issue #51 补丁；升级上游后先看新版是否已修复。
- 如果 DSH 的 home 是**命名卷**（不是宿主机目录），脚本读不到 `sessions/`，会退化到
  `FISH_DSH_REPLY=api`（有 say 补丁时没问题）；能拿到 host 路径时会挂 `:/dsh-home:ro`
  并启用 `session` 兜底。
- **持久化**：上游默认把她的家放在 DSH 容器的 `$HOME/.dsh-fish`。很多镜像 `HOME=/workspace`，
  而 `/workspace` 如果没有挂卷，容器重建就会丢。请把 `/workspace`（或 `$HOME`）挂成卷，
  或者在 profile 的 `cordis.patch.yml` 给 `dsh-fish` 配一个在卷上的 `root`。

## 数据目录

- `data/bridge.env` — 桥环境（含 `FISH_DSH_SECRET`，权限 600）
- `data/bridge-state/` — 桥去重状态
- `data/napcat-onebot11_<qq>.json` — 待你替换进 NapCat 的配置
- `data/migration-backup-*`（迁移时）— profile 与 bridge.env 的备份
