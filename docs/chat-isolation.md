# 聊天/工程隔离：当前分层

## 已实现（2026-11-06 源码）

- Host插件不再全局注入大肥鱼身份。工程会话的persona不因安装本插件而被覆盖。
- /say创建/恢复的每个聊天Agent在原生setup阶段局部覆盖deployment persona前后缀。
- 全局工具先通过restrict遮蔽；局部记忆工具注册后，guard仅允许五个fish记忆/状态工具，拒绝其他工具，包括新增工程工具、联网和调度。
- 记忆范围绑定在宿主WeakMap，scope取account+scene+channel，不来自模型参数。会话恢复重新绑定相同范围。
- /say仍限定simulation且delivered=false。未授权的真实平台请求直接拒绝。

## 验证

- 单元测试：Host apply无身份注册；chat setup局部persona、全局工具mask、工程工具guard、可信范围写入。
- 真实DSH隔离诊断进程：合成私聊使用fish_remember和fish_recall，记录“合成验证偏好：青色纸船”，返回正常；记录scope为fixture/private/scoped-memory-1。
- 另一合成群聊使用fish_recall查询同样词，返回“没有翻到任何相关记录”；隔离数据中仅存在原私聊scope记录。
- 这些验证不是主机权限隔离的充分证据；不得开放真实QQ。

## 未完成的隔离

- 原生preset还未独立声明：当前setup复用了默认preset后再收窄工具，不等于默认preset所有插件副作用都已去掉。
- 没有OS用户/容器/文件挂载/网络出口的独立隔离证明。
- 管理服务及文件接口除模型工具外的访问路径未全面测试。
- 当前GUI进程可能仍载入早期全局身份代码，需统一受控更新和复验。

因此“已实现局部身份+模型工具边界”不应写成“已完成工程/聊天强隔离”。
