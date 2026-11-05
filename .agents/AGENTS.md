# 工程 Agent 行为规则

给负责实现 DSH-FISH V3.2 的工程 Agent 看。父级 `AGENTS.md` 的边界在此更具体化，**不得放宽父级**。

## 会话恢复

新会话/换模型/压缩/中断后，先按顺序恢复上下文：
1. 确认 `pwd` 与 `PROJECT_ROOT`（`/workspace/create`）。
2. 读根 `AGENTS.md`、`README.md`、`docs/INDEX.md`、`docs/STATUS.md`。
3. 读相关 `docs/plans/`、`docs/adr/`、模块 `AGENTS.md` 与最近 `.agents/notes/`。
4. `git status` + 未提交改动 + 实际构建态 + 待办。

## 落地顺序

小步推进：先环境/授权核对 → 直接做可执行的 P0 工作 → 每条改动跑检查 → 修红 → 复测 → 里程碑同步
`docs/STATUS.md`。P0 → P1 → P2；权限受阻只暂停依赖它的那件事，不暂停其余独立工作。

## 提交纪律

- 提交前 `git diff` 自检：无密钥/token/私聊文本/运行日志/备份。
- 一次提交做一件事；测试全绿才提交；不提交他人在进行中的改动。

## 交接

中断前把已完成工作、证据、未提交改动、阻塞项、下一步写进 `docs/STATUS.md` 与对应 `docs/plans/`。
验证交接：一个没有上文的新工程会话，能否仅凭仓库文件定位代码、规则、最近证据与下一个可执行动作。
