# ADR-0002：原生受限聊天 preset 与局部身份

状态：Accepted；日期：2026-11-06。

## 背景

ADR-0001 的全局身份段会污染工程会话，且默认工程preset可能挂载文件、shell、子代理等插件。仅在模型输出中要求“不使用工程工具”不足以隔离。

## 决策

- bundle声明原生 fish-chat preset，仅挂载 @deepseek-ai/dsh-tool-executor-native。
- /say的原生Agent.setup通过agentPresets.mount选择fish-chat；session header记录该preset。
- 每个聊天Agent局部安装persona和绑定宿主scope的记忆工具；不在Host注入大肥鱼身份。
- 全局工具mask + 单调执行guard两层拒绝；仅五个记忆/状态工具允许，联网和发送不注册给聊天Agent。
- 继续保持simulation-only，不以preset等同OS隔离。

本ADR替代ADR-0001中“Host全局身份/策略段”的实现选择；其余原生bundle和桥接独立原则不变。

## 验证

真实DSH 0.2.2-rc.1隔离进程：合成回合200；记忆写入与召回正常。指定合成会话压缩日志解码后session header的agentPreset=fish-chat；request/header无任何非fish工具。

首次审计仍包含fish_browse schema（执行guard已拒绝）；随后修正注册层只呈现五个允许工具，并在单测断言完整清单。最终五工具清单仍需下一次真实进程审计。

## 代价与未完成

- 当前工程GUI还需统一受控加载新bundle声明，不能用set_plugin反复开关宣称新JS已加载。
- OS用户、文件挂载、外网、Remote管理服务隔离仍未完成验收，真实账号禁止。
