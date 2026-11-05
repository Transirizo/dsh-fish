# dsh-fish-v3

大肥鱼（Da Fei Yu）—— 原生 DSH（DeepSeek Harness）陪伴者插件。

- **身份**：`systemPrompt` 段 `dafeyu:identity`（稳定，不随机改写）。
- **会话策略**：`systemPrompt` 段 `dafeyu:policy`（事实/记忆/隐私/自主行动边界）。
- **记忆**：追加式 JSONL（`<dataDir>/memory.jsonl`），工具 `fish_recall` / `fish_remember`。
- **健康**：工具 `fish_status` + `GET /dsh-fish-v3/health`。

## 安装（DSh 原生）

```bash
# 在目标 profile 内用 plugin_manager 安装本目录：
#   install_bundle  target = <本目录绝对路径>
```

见根 `docs/deployment.md`、`docs/quickstart.md`。**默认真实发送/主动发送关闭。**

## 配置

见 `lib/config.js`（schemastery）。只放环境参数，不放人格设置。部署取值在用户自己 profile 的
`cordis.patch.yml` 里覆盖本行 config。

## 测试

```bash
node --test test/
```

## 约束

- 依赖只有 `@deepseek-ai/schemastery`（Config）；不引框架、不拖核心包。
- 不内置 IM 协议/登录（桥接独立成件）。
- 新输入口过 `lib/guard.js`；秘密外发一律拦。
