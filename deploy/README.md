# 部署大肥鱼：两种方式

先看清你属于哪种情况：

## 你还没有 DSH → `one-click/`

新机器、什么都没装。一个脚本起好 DSH + NapCat + 桥整栈，三个容器在同一个 compose 网络。

```bash
cd deploy/one-click
./setup.sh <机器人QQ号>
```

详见 [one-click/README.md](one-click/README.md)。

## 你已经有 DSH → `add-to-dsh/`

DSH 已经在跑，只想补上「大肥鱼插件 + 桥 + NapCat 配置」，不想再起一套 DSH。

```bash
cd deploy/add-to-dsh
./setup.sh <机器人QQ号>
```

它会：装插件进你的 DSH、配 `/say` 凭据、起 host 网络的桥、生成 NapCat 配置（不直接改你的 NapCat，交给你确认）。

详见 [add-to-dsh/README.md](add-to-dsh/README.md)。

## 两者的共同点

- 插件本体是标准 DSH 插件，装在 DSH 的 profile 里；
- 桥是独立进程（不持有模型/记忆），负责协议转换与发送；
- NapCat 管 QQ 登录，DSH 只管对话与成长；
- 状态：两个脚本都是**首版，未在全新机器完整实测**，真机踩坑请对照 README 调整。
