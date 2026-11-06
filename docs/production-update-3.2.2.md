# 3.2.2 发布快照

2026-11-06。本次发布只包含**已在源码中改完并通过验证**的两件事：

1. 群聊未点名沉默闸门（`lib/say.js` 的 `shouldReply` 判定，命中时不调模型、直接返回 `silent`）。
2. OneBot/NapCat 桥（`bridge/onebot/`，独立件，**不随插件一起发布**，也不在生产运行）。

**没有**放开真实发送：`/say` 仍只接受 `mode: 'simulation'`，`live` 一律 `403 live-ingress-not-authorized`；
`sendingEnabled` / `proactiveEnabled` / `biliEnabled` 仍是代码级 `false`。

## 证据

| 项 | 命令 | 结果 |
|---|---|---|
| 插件单测 | `node --test packages/dsh-fish-v3/test/*.test.mjs` | 113/113 PASS |
| 桥单测 | `node --test bridge/onebot/test/*.test.mjs` | 8/8 PASS |
| 原生 DSH 验收 | `node packages/dsh-fish-v3/sim/native-dsh.mjs fish-v3 3083` | 10/10 PASS（含群聊未点名沉默、点名回复、账本持久完成） |
| 全链路模拟 | `node bridge/onebot/sim/e2e.mjs fish-v3 3084` | 6/6 PASS（假 NapCat ⇄ 桥 ⇄ 真实 DSH 真实模型） |
| 只读预检 | `node packages/dsh-fish-v3/sim/doctor.mjs` | PASS，1 条 WARN（入站凭据未配置，入口默认拒绝） |
| 快照一致性 | `diff -r` 源码 ↔ `data/releases/3.2.2/package` | 完全一致 |

Tarball SHA256：`f5c8482c60b69f7e3957546174a185d7013852584229cdd42a175bee54bf6764`。

## 与 3.2.1 的差异（对生产可见的行为）

- 群消息未点名时不再调用模型（省钱、不抢话）。
- 其余配置项、数据目录、记忆格式、`/say` 鉴权规则不变。

## 安装与生效

快照位于 `data/releases/3.2.2/package`（绝对路径，避免 `link:` 模块缓存问题）。安装后用原生
`plugin_manager` 的顺序：`remove_bundle` 旧的 → `install_bundle` 这个绝对路径。

**3.2.1 的经验**：当时装完包没有立刻生效——进程里旧的 `/dsh-fish-v3/health` handler 仍是旧代码，
启用报 `duplicate exact route`，必须重启一次。

## 实际执行结果（2026-11-06，未重启即生效）

- `remove_bundle dsh-fish-v3` → 旧 3.2.1 实例的 `dispose` 正常跑完，路由被真正注销。
- `install_bundle /workspace/create/data/releases/3.2.2/package` → `application: applied`，无 duplicate route。
- 原因：3.2.1 起路由注册走生命周期（`ctx.effect`），卸载能清干净；3.2.2 在另一个目录，不命中旧模块缓存。
- 自检：`GET /dsh-fish-v3/health` → `{"ok":true,"version":"3.2.2",...}`；`POST /dsh-fish-v3/say` → `401`。
- **本次不需要重启**。以后换版本按「先 remove 再 install」的顺序，先 remove 是清路由的关键。

## 重启后自检（备用）

```bash
curl -s http://127.0.0.1:3080/dsh-fish-v3/health   # 期望 version=3.2.2，ok=true
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3080/dsh-fish-v3/say \
  -H 'content-type: application/json' -d '{}'       # 期望 401（原生入站凭据未配置）
```

再看设置页是否仍有 dsh-fish-v3 表单、`fish-chat` preset 是否还在。

## 回滚

`plugin_manager` 切回 `data/releases/3.2.1/package`（同样按 remove → install 的顺序，实测无需重启）。
运行数据（`/home/node/.dsh/dsh-fish-v3`）未迁移、未删除，两个版本读写同一份数据格式。
