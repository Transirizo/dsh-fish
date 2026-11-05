# 开发

## 环境

- Node ≥24（本环境 v24.22.2）；DSH `@deepseek-ai/dsh` 0.2.2-rc.1。
- 插件 bundle 在 `packages/dsh-fish-v3/`，宿主服务经 `inject`/`ctx.get` 获取。

## 命令

```bash
# 单元测试（Node 原生 test runner；目录形式参数会触发 Node 已知 MODULE_NOT_FOUND 坑，用 glob）
node --test packages/dsh-fish-v3/test/*.test.mjs

# 递归跑全部
node --test

# 沙箱受限环境
node --test --test-isolation=none
```

> 本地跑 `config.test.mjs` 需要解析 `@deepseek-ai/schemastery`（ESM 不认全局 NODE_PATH）。开发机已建
> `node_modules/@deepseek-ai/schemastery` → 宿主 checkout 副本的符号链接（被 `.gitignore` 忽略，不进 bundle）。
> 换环境先重建该链接，或对包执行 `npm install`。

## 布局约定

- 插件只依赖内置模块 + `@deepseek-ai/schemastery`（Config）；不引框架、不拖核心包（旧版踩过的坑见
  其 `AGENTS.md` §1）。
- 所有可调值进 `Config`（用户改 `cordis.patch.yml`，升级不丢）。
- 运行期数据默认 `<DSH_HOME>/dsh-fish-v3/`，开发测试可指向 `PROJECT_ROOT/data`。

## 改动流程

理解 → 计划 → 设计 → 实现 → 测试 → 同步文档 → 提交 → 交接。跨模块/改数据/高风险先写验收计划（`docs/plans/`）。
契约变更同步 `docs/architecture.md` 与相关 ADR。

## 提交

`feat(scope): …` / `fix(scope): …`；提交前 `git diff` 自检无密钥/私聊文本/运行日志/备份。
