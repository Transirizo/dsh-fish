# 已有 DSH 接入大肥鱼（方案 B）

适用于：**你的 DSH 已经在跑了**，只想补上「大肥鱼插件 + 桥 + NapCat 配置」，不想再起一套 DSH。

> 状态：首版，未在全新机器实测。命令与字段来自 2026-11-06 生产手动接线的验证结果。

## 与「一键部署」的区别

| | `deploy/one-click/`（方案 A） | `deploy/add-to-dsh/`（方案 B，本目录） |
|---|---|---|
| 前提 | 什么都没有 | DSH 已在跑 |
| 起几个 DSH | 1 个新的 | 0 个（复用你的） |
| 桥的网络 | compose 内网，靠容器名 | **host 网络**（才够得到 DSH 回环 + NapCat 容器 IP） |
| 适合 | 新用户 | 你这种「已有 DSH」 |

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
  --dsh-url http://127.0.0.1:3080/dsh-fish-v3/say \
  --napcat-ip 192.168.176.3
```

## 脚本做了什么

1. **自动找 DSH 容器**（名字含 `deepseek-harness`/`dsh`）和它发布到宿主机的 3080 端口，推出 `/say` 地址；
2. **自动找 NapCat 容器 IP 和它的 docker 网关**；
3. 生成三个密钥；
4. `tar` 打包插件 → `docker cp` 进 DSH → `docker exec dsh plugin add` 安装，并把 `dsh-fish-v3` 补进 profile 的 `bundles`；
5. 把 `/say` 凭据 `DSH_FISH_INGRESS_TOKEN` 写入 DSH 凭据文件（**保留原有其它 refs**）；
6. 起桥容器（`--network=host`，监听 `0.0.0.0:6199`），`FISH_SEND_ENABLED=auto`；
7. 生成 NapCat 的 OneBot 配置到 `data/napcat-onebot11_<qq>.json`。

## 脚本没做（需要你手动确认）

因为动别人的 NapCat 有风险，**脚本只生成配置、不直接改你的 NapCat**：

1. 把 `data/napcat-onebot11_<qq>.json` 替换进 NapCat 容器（路径按你的版本，常见 `/app/napcat/config/onebot11_<qq>.json`）；
2. `docker restart <napcat容器>`；
3. `docker restart <DSH容器>` 让插件生效；
4. 打开 DSH 设置页勾「真实平台回复」——桥 `auto` 会跟随。

## 已知限制

- 桥用 `--network=host`，默认假设 DSH 和 NapCat 都在这台宿主机上；跨机部署需要自己改 `FISH_SAY_URL` / `NAPCAT_API`。
- 装插件后会**重启一次 DSH**（这是让新插件加载的必要动作），期间 GUI 会断几秒。
- NapCat 的 OneBot 配置字段有版本差异（`enableCors`/`enableWebsocket`/`secret` 等），真机若不通，对照你 NapCat 现成配置改一两个字段。

## 数据目录

- `data/bridge.env` — 桥环境（含密钥，gitignored）
- `data/bridge-state/` — 桥去重状态
- `data/napcat-onebot11_<qq>.json` — 待你替换进 NapCat 的配置
