# /say 重启后诊断验证（2026-11-06）

## 本次确证

环境：DSH 0.2.2-rc.1，使用现有 fish-v3 profile，叠加工作区私有覆盖层，在 127.0.0.1:3083 启动临时受管进程。未改当前 GUI 监听，不接 QQ，不对外投递。

- `POST /say`（合成私聊）=200，真实模型回复“合成测试通过。”，delivered=false。
- 相同事件再次请求=200，完整响应完全一致，使用持久去重账本。
- 合成群聊=200，模型回复“收到”，与私聊分配不同 sessionId。
- 私聊第二轮=200，resumeSessionId 与第一轮相同，模型回复“收到”。
- 单元测试80/80通过，包含鉴权、方法、解析、真实平台模式拒绝、秘密拒绝、去重和工具收窄接线。
- 测试配置、凭据、账本与输出仅放 gitignored data/say-runtime；不作为公开交付物。

## 修复

1. apply 注册由 ctx.effect 托管；原生 agents/defaultModel/sessions 通过 ctx.inject 生命周期提供，避免旧 handler 持有卸载上下文。
2. /say 动态读 token，限定 POST；要求 account/scene/channel/eventId/sender；按账号与会话派生映射；resume 失败不偷偷新建。
3. 仅允许 mode=simulation；诊断 Agent 禁止全部全局工具并加执行 guard；所有回复 delivered=false。
4. 增加体积、并发、回合超时、账本容量限制；未知结果挂起；错误响应不暴露栈和路径。

## 明确限制

- 这不是 QQ 真机收发验证，不能据此启用真实平台。
- 工具 guard 不是完整的主机/文件/网络隔离；还需要独立受控聊天 preset 与权限验证。
- 诊断 Agent 禁止全部工具，因此这次不是 fish 工具记忆联调，也不声称长期记忆 scope 已全面安全。
- 当前 GUI 进程仍可能持有重启时载入的旧 JS；隔离进程的成功不证明生产进程已换成新模块。不得通过反复开关/卸载声称 JS 已更新。
- 含入口 token 的旧配置属于待迁移秘密管理技术债；本次没有输出或重新抄录其值。
