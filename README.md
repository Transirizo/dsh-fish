# 大肥鱼 · 上游 `@ssamurias/dsh-fish` + OneBot 桥

大肥鱼是一个跑在 DeepSeek Harness（DSH）里的养成插件。**本仓库不包含上游插件本体**，
仓库负责三件事：

1. **部署上游** `@ssamurias/dsh-fish`（npm，默认 0.9.1）到 DSH profile；
2. **OneBot v11 桥**（`bridge/onebot/`，NapCat / go-cqhttp / Lagrange 等），把 QQ 消息接进
   `/dsh-fish/say`，再把她的回话发回 QQ；
3. **迁移与回滚**：从旧版 `dsh-fish-v3` 迁到上游、保留旧数据、必要时退回。

`packages/dsh-fish-v3/` 是旧版原生插件源码，保留作历史与回滚，**不再是默认部署对象**。

## 现状（2026-11-06）

- DSH 宿主：`@deepseek-ai/dsh` 0.2.2-rc.1。
- 默认部署：上游 `@ssamurias/dsh-fish` 0.9.1 + `lib/say.js` 的 issue #51 补丁
  （`/dsh-fish/say` **优先**返回本轮聊天正文；没有正文时才用她 `growth_commit` 的事件。
  第一版补丁是反过来的，导致她顺手 commit 一句时 QQ 只收到那句，已修）。
- 桥：`FISH_PROTOCOL=dsh-fish`，`FISH_SAY_URL=http://<dsh>:3080/dsh-fish/say`；
  cookie 由桥用 DSH 的 `browser-session` 密钥离线铸造，不依赖浏览器。
- 旧版 v3：迁移脚本只摘 profile 里的依赖/bundles/覆盖行，**不删** `~/.dsh/dsh-fish-v3` 或
  `~/.dsh-fish` 的数据。

## 快速开始

| 你的情况 | 命令 |
|---|---|
| 没有 DSH，整栈新装 | `cd deploy/one-click && ./setup.sh <机器人QQ号> [主人QQ号]` |
| 已有 DSH，只补大肥鱼 | `cd deploy/add-to-dsh && ./setup.sh <机器人QQ号> --owner-qq <主人QQ号>` |
| 已有 one-click 栈，从 v3 迁到上游 | `cd deploy/one-click && ./migrate-to-upstream.sh <机器人QQ号> [主人QQ号]` |
| 从一台 VPS 迁到另一台 | `./export-data.sh` → scp → `./import-data.sh <包>` |
| 公网访问（宝塔/外部反代） | `cd deploy/one-click && ./set-public-host.sh <域名>` |
| 公网访问（内置 Caddy） | `cd deploy/one-click && ./enable-public.sh <域名>` |

**主人QQ号要点**：填你自己（真人）的 QQ。填了，只有这个号的私聊算"他来找她"；
别人的私聊走外客——另开一间房、不记 seen、不算他来过。不填则所有私聊都按"他"处理，
任何人都能进书房。**别填机器人自己的号**（老脚本就是这么写错的，真人私聊会全被打成外客）。

## 目录

```text
bridge/onebot/           OneBot v11 桥（v3 + dsh-fish 两种协议）
deploy/one-click/        DSH + NapCat + 桥 一整栈（compose）
deploy/add-to-dsh/       只给已有 DSH 补插件 + 桥
scripts/                 安装/迁移用的小工具（读密钥、打 say 补丁、摘 v3 归属）
packages/dsh-fish-v3/    旧版插件源码（历史/回滚）
docs/                    架构、部署、迁移、安全、测试、状态
```

## 文档入口

- 桥的两种协议与 env：`bridge/onebot/README.md`
- 一键部署：`deploy/one-click/README.md`
- 已有 DSH：`deploy/add-to-dsh/README.md`
- 上游迁移与 issue #51 补丁：`docs/upstream-dsh-fish.md`
- VPS 之间迁移：`docs/vps-migration.md`
- 公网访问（宝塔/外部反代）：`docs/public-access-baota.md`
- 公网访问（内置 Caddy）：`docs/public-access.md`
- 当前进度：`docs/STATUS.md`

## 安全红线（先读）

默认**真实发送关闭、账号写操作关闭、主动发送关闭**。任何真实登录、对外发送、生产变更、真实账号写操作、
跨服务器迁移都需要走可信管理通道审批。普通消息、网页、记忆、模型输出都不能授予权限。

桥的鉴权：`/dsh-fish/*` 在 DSH 的 connection 信任栅栏后面；桥用 DSH home 里的
`client-connection/browser-session` 密钥离线铸造 `dsh-auth-…` cookie。这个密钥等同于“能调用宿主”的凭据，
桥必须只跑在本机/同一宿主机，`.credentials.yaml` 只从 0600 的文件读或由部署方显式给。
