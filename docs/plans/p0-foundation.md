# P0 计划：可靠基础

- 状态: TESTING（离线交付完成；真实 DSH 加载验收 BLOCKED）
- 目标: 让真实 DSH 0.2.2-rc.1 原生加载 `dsh-fish-v3`，跑通离线模拟消息闭环与备份/恢复，产出可复现证据。

## 范围与验收

- [x] 插件 bundle 从干净 checkout 可构建（`npm pack` 通过）、单测可复现。
- [x] 离线模拟闭环：注入允许的私聊 + 群聊事件，验证事件身份/scope、会话映射、模型（桩）调用、
      记忆读写、经同一授权链投递到模拟接收方。→ `sim/offline.mjs` 11/11
- [x] 同一事件重复注入不重复投递（幂等去重）。→ `lib/ingest.js` + `test/loop.test.mjs`
- [x] 未授权事件、恶意工具请求被拒。→ 入站白名单 + `guard.js` 秘密拦截（单测覆盖）
- [x] 备份恢复进隔离目标、对比一致、重复恢复不重复。→ `lib/backup.js` + `sim/backup.mjs` 演练
- [ ] DSH 加载证据（`list_plugins` 无 `failed` / 生命周期 hook / 注入事件走通闭环）→ **BLOCKED**
- [ ] 重启后会话与身份记忆连续 → 待 DSH 加载后验证

## 步骤

1. 环境与扩展点发现 —— **完成**。
2. 工程文件骨架 + ADR + 计划 + STATUS —— **完成**。
3. 插件 v0.1（身份/策略/Config/记忆/guard/健康/工具）—— **完成**。
4. 单元测试全绿 —— **完成**（44/44）。
5. 离线模拟闭环 —— **完成**（loop + sim/offline 11/11）。
6. 备份/恢复工具与隔离恢复演练 —— **完成**（backup.js + CLI e2e）。
7. 安装进 DSH 并记录证据 —— **BLOCKED**（审批禁用 + 共用 profile 风险）。

## 阻塞（具体条件）

- 安装/激活需 `plugin_manager` 审批；本会话审批已改「不询问/自动拒绝」。正确目标是独立 profile，
  避免与在跑 v0.8.8 共用 `web`。条件未变化前该项无法推进；其余离线项不受影响。

## 下一步（P1 起，另行计划）

- HTTP 桥接收口（`POST /dsh-fish-v3/say` + token 鉴权）与桥接契约对齐 `astrbot-relay` v7。
- 兴趣/日记/主动参与、抓取与预算、provider 路由与 failover、真实平台授权。
