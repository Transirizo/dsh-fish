# 配置支持矩阵（2026-11-06）

配置能保存、界面有字段、功能已实现是三件不同的事。当前生产进程可能仍加载旧代码；本矩阵针对最新已测试源码。

| 字段 | 实际语义 | 生效 |
|---|---|---|
| groupMode | 状态显示及独立参与决策模块参数；/say模拟路径不代表真实群节奏已接通 | 状态读取实时；平台行为未接通 |
| dataDir | 存储根，改变不迁移旧数据 | 非volatile，需插件重载 |
| ingressCredentialRef | 原生DSH凭据引用，限定DSH_FISH_命名空间 | 每次请求重新resolve |
| ingressToken | 已弃用旧字段，仅为兼容保留，不参与鉴权 | 管理员受控迁移后移除 |
| sendingEnabled | 真实发送执行链未完成 | 仅允许false，配置不是授权 |
| proactiveEnabled | 旧反思会跨scope汇总，尚未安全验收 | 仅允许false |
| biliEnabled | 无已验证平台适配 | 仅允许false |
| toolsRestrict | 不允许关闭安全边界 | 仅允许true |
| memoryRetentionDays | 自动清理未实现 | 仅允许0 |
| memoryMaxRecords | 预留字段，不自动删除 | 固定10000，不宣称已强制容量 |
| netMaxQueriesPerHour/netMaxConcurrent | 经宿主注入受限代理才可使用；每次获取预算读取最新限额 | volatile，保留已消费额度 |
| netMaxBytes/netTimeoutMs | 经宿主注入代理的抓取参数 | 每次调用读取 |
| sendingAllowlist/categories/cooldown/dailyLimit/quietHours | 预留，未接真实发送链 | 不可据此声称发送授权已生效 |
| logLevel/toolsAllow/心跳间隔与每日限额 | 部分预留，尚无完整执行链 | 不作为能力验收证据 |

## 失败行为

- schema拒绝未支持高风险开关、负数、超限与非整数网络预算。
- 无受限抓取代理返回关闭，不回退globalThis.fetch。
- 缺少模型工具调用者身份拒绝记忆读写。

## 后续

设置UI需要按此矩阵区分“已实现/预留/关闭”，不能仅展示可点的布尔开关。生产更新前必须验证有效配置是否与新schema兼容，不能用版本豁免或删配置强行启动。
