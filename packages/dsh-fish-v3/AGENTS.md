# dsh-fish-v3 模块规则

给改这个包的代码（或 AI）看。父级 `AGENTS.md` 的红线在此具体化，**不得放宽父级**。

## 可编辑范围

- `index.js`、`lib/*.js`、`cordis.patch.yml`、`package.json`、`locale/`、`icon.svg`、`test/`。
- 运行期数据目录（`dataDir`）**不可**由本包硬编码到任意主机路径。

## 硬约束

1. **零依赖（除 schemastery）**：`dependencies` 只保留 `@deepseek-ai/schemastery`；不引框架、不拖
   宿主核心包（旧版踩过「装包拖崩宿主」的坑）。
2. **不新增人格设置入口**：`Config` 只放环境参数；身份/策略文本固定在 `lib/identity.js` / `lib/policy.js`。
3. **身份走 systemPrompt 段**，不进对话历史、不进工作区指令。
4. **新输入口过 `guard.js`**：任何外部文本（含记忆、将来桥接来的消息）写记忆/外发前必须 `sanitizeForeign`
   + `looksSecret`。
5. **默认真实发送关闭**：`sendingEnabled` / `proactiveEnabled` 默认 `false`。

## 契约

- 工具参数用标准 JSON Schema（宿主把 `parameters` 原样交给 provider，不做 DSL 编译）。
- 工具 `output.schema` 与 `execute` 返回值严格对齐（宿主校验 schema）。

## 测试

```bash
node --test test/
```

改 `guard.js`、`memory.js`、`config.js` 后必跑；全绿才提交。
