# 大肥鱼一键部署（首版）

一个脚本起好 DSH + NapCat + 桥三件套，全部走 docker 内部网络、不暴露公网。

> **状态：首版，未在全新主机实测。** 拓扑和配置来自 2026-11-06 真实接线的验证结果，但「全新主机一条命令跑通」这一步还没验过。先当参考，跑不通把报错贴回来改。

## 用法

```bash
git clone <本仓库>
cd dsh-fish/deploy/one-click
./setup.sh <机器人QQ号>
```

前置：宿主机有 docker + docker compose。

## 脚本做了什么

1. 生成三个密钥（桥↔DSH 凭据、NapCat 上报签名、NapCat HTTP 服务 token）；
2. 用 harness 镜像里的 npm 构建插件 tarball（宿主机不需要 node）；
3. 从 `web` 模板复制出 `fish` profile，装进插件；
4. 写三份配置：DSH 凭据、桥环境（`bridge.env`）、NapCat onebot 配置（`onebot11_<qq>.json`）；
5. `docker compose up -d`。

## 手动步骤（脚本化不了）

1. **扫码登录**：打开 `http://127.0.0.1:6099/webui`，用机器人 QQ 扫码。登录 token 脚本会尝试自动打印（在 NapCat 配置/日志里）；没读到就手动看：`docker compose logs napcat | grep -i token`。第三方协议登录有封号风险，自担。
2. **开回复开关**：DSH 设置页勾「真实平台回复」。
3. **开真发**：把 `data/bridge.env` 里 `FISH_SEND_ENABLED` 改成 `true`，`docker compose restart bridge`。

## 拓扑（与线上验证一致）

```
QQ → NapCat(httpClients → http://bridge:6199) → 桥 → DSH /say(http://dsh:3080，真实模型)
QQ ← NapCat(httpServers :3000) ← 桥（send_private_msg / send_group_msg）
```

三个服务在同一个 compose 网络 `fishnet`，靠容器名 `dsh` / `napcat` / `bridge` 互访；DSH 和 NapCat 的端口都只发布到宿主机 `127.0.0.1`，不暴露公网。

## 数据目录

- `data/dsh/` — DSH profile、凭据、运行数据
- `data/napcat/` — NapCat 配置 + QQ 登录态
- `data/bridge.env` — 桥环境（含密钥，gitignored）
- `data/bridge-state/` — 桥去重状态

## 与线上真实接线的差异

- 线上是「已有 DSH 不能动」的补丁式接线（桥用 `--network=host`、NapCat 走网关 IP）。这里全新部署改用**同一 compose 网络 + 容器名**，更干净，不需要 host 网络。
- 线上 NapCat 配置在 `/app/napcat/config/onebot11_<qq>.json`，本脚本按同样格式生成，但字段（`enableCors`/`enableWebsocket`/`secret` 等）建议真机核对一遍 NapCat 版本差异。

## NapCat 上报签名（重要）

NapCat 的 **HTTP Client（httpClients）字段名叫 `token`，不是 `secret`**。写错字段名时 NapCat 不签名，桥会报：

```
上报签名校验失败（secret 不匹配或未填）：收到 0 字节签名，期望 45 字节
```

本脚本已按 `token` 生成。若你用很旧的 NapCat（字段是 `secret`），手动改一下字段名即可。

（2026-11-06：新版 WebUI 的 HTTP Client 表单显示的就是「Token」；旧版配置里是 `secret`。）
