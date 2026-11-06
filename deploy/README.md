# 部署大肥鱼：两种方式

本仓库部署的是上游 **`@ssamurias/dsh-fish`**（npm，默认 0.9.1），不是 `packages/dsh-fish-v3`。
旧版 v3 只保留作历史与回滚。

## 你还没有 DSH → `one-click/`

新机器、什么都没装。一个脚本起好 DSH + NapCat + 桥整栈，三个容器在同一个 compose 网络。

```bash
cd deploy/one-click
./setup.sh <机器人QQ号>
```

详见 [one-click/README.md](one-click/README.md)。

## 你已经有 DSH → `add-to-dsh/`

DSH 已经在跑，只想补上「上游插件 + 桥 + NapCat 配置」。

```bash
cd deploy/add-to-dsh
./setup.sh <机器人QQ号>
```

它会：摘掉旧版 v3 的 profile 归属 → 装上游 → 打 issue #51 的 say 补丁 → 重启 DSH →
取 DSH 的 `browser-session` 密钥 → 起 host 网络的桥 → 生成 NapCat 配置。

详见 [add-to-dsh/README.md](add-to-dsh/README.md)。

## 已有 one-click 栈，从 v3 迁到上游

```bash
cd deploy/one-click
./migrate-to-upstream.sh <机器人QQ号>
```

保留 `data/dsh` 里的数据与登录态；只动 profile 归属、插件包、say 补丁、`bridge.env` 和两个容器。

## VPS 之间迁移数据

```bash
cd deploy/one-click
./export-data.sh                 # 旧机：导出 data/（含她的家、DSH 会话、QQ 登录态、桥状态）
./import-data.sh <包.tar.gz>      # 新机：导入并启动
```

详见 [docs/vps-migration.md](../docs/vps-migration.md)。

## 三者的共同点

- 插件是标准 DSH 插件，装在 DSH 的 profile 里；桥是独立进程，不持有模型/记忆/身份；
- `/dsh-fish/*` 在 DSH 的 connection 信任栅栏后面：桥必须有 DSH home 里的
  `client-connection/browser-session` 密钥（由 `scripts/read-dsh-secret.mjs` 读出，
  或以 `FISH_DSH_SECRET` 提供）；容器之间走容器名时，DSH 还要带 `--trusted-host <名字>`；
- NapCat 管 QQ 登录，DSH 只管对话与成长；
- 两个安装脚本都还是**首版，未在全新机器完整实测**，跑不通把报错贴回来改。
