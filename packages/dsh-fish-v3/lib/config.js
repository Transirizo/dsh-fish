/**
 * config.js —— 插件 Config（schemastery）。
 *
 * 只放「生长环境」参数，**不放人格设置**（红线：人格从事件/记忆长出）。
 * 所有键都有默认值；部署取值由用户覆盖。
 *
 * 关键：字段链 `.volatile()` 才会被 DSH 设置页自动生成可编辑表单（`volatileForm` 只挑
 * volatile 字段）；volatile 字段的值是「可变包装」，要用 read() 读。
 */
import z from '@deepseek-ai/schemastery'

export const GROUP_MODES = ['quiet', 'balanced', 'active']

export const Config = z.object({
  // 身份与目录
  name: z.string().default('大肥鱼').volatile(),
  dataDir: z.string().default('').description('运行数据目录；修改需要重载插件，不自动迁移数据。'),

  // 群内节奏
  groupMode: z.union(GROUP_MODES.map((m) => z.const(m))).default('balanced').volatile(),

  // 记忆
  memoryRetentionDays: z.const(0).default(0).description('自动保留清理尚未实现，仅允许0。'),
  memoryMaxRecords: z.const(10000).default(10000).description('预留字段；当前不执行自动淘汰。'),

  // 主动参与（默认关闭）
  proactiveEnabled: z.const(false).default(false).volatile().description('跨范围反思与调度尚未完成安全验收，禁止开启。'),
  proactiveHeartbeatMs: z.number().step(1).min(1000).max(86400000).default(300000).volatile(),
  proactiveMinIdleMs: z.number().step(1).min(0).max(86400000).default(7200000).volatile(),
  proactiveMaxPerDay: z.number().step(1).min(0).max(100).default(2).volatile(),

  // 发送（默认关闭）
  sendingEnabled: z.const(false).default(false).volatile().description('真实发送链尚未接通，禁止开启；配置不是授权。'),
  sendingAllowlist: z.array(z.string()).default([]).volatile(),
  sendingCategories: z.array(z.string()).default(['reply']).volatile(),
  sendingCooldownMs: z.number().step(1).min(0).max(86400000).default(5000).volatile(),
  sendingDailyLimit: z.number().step(1).min(0).max(10000).default(0).volatile(),
  quietHours: z.array(z.number()).default([]).volatile(),

  // 原生凭据引用，不接收明文token。旧字段只保留以便管理员受控迁移，不再用于鉴权。
  ingressCredentialRef: z.string().default('DSH_FISH_INGRESS_TOKEN').volatile(),
  ingressToken: z.string().default('').role('secret').description('已弃用且不参与鉴权，请通过DSH凭据存储迁移后移除。'),

  // 联网预算（规格 §5）
  netMaxQueriesPerHour: z.number().step(1).min(1).max(1000).default(30).volatile(),
  netMaxConcurrent: z.number().step(1).min(1).max(8).default(2).volatile(),
  netMaxBytes: z.number().step(1).min(1024).max(2097152).default(512000).volatile(),
  netTimeoutMs: z.number().step(1).min(1000).max(60000).default(15000).volatile(),

  // 平台（默认关闭）
  biliEnabled: z.const(false).default(false).volatile().description('平台适配尚未完成，禁止开启。'),

  // 日志
  logLevel: z.union([z.const('debug'), z.const('info'), z.const('warn'), z.const('error')]).default('info').volatile(),

  // 工具面
  toolsAllow: z.array(z.string()).default([]).description('预留；不作为聊天权限授权入口。'),
  toolsRestrict: z.const(true).default(true).description('禁止关闭工具安全边界。'),
})

/** 读一个可能是 volatile 包装的配置字段：有 .get() 就解包，否则原值/回退。 */
export function read(cfg, key, fallback) {
  const v = cfg?.[key]
  if (v !== null && typeof v === 'object' && typeof v.get === 'function') return v.get()
  return v === undefined || v === null ? fallback : v
}
