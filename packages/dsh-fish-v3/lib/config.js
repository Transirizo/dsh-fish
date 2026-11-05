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
  dataDir: z.string().default('').volatile(),

  // 群内节奏
  groupMode: z.union(GROUP_MODES.map((m) => z.const(m))).default('balanced').volatile(),

  // 记忆
  memoryRetentionDays: z.number().default(0).volatile(),
  memoryMaxRecords: z.number().default(10000).volatile(),

  // 主动参与（默认关闭）
  proactiveEnabled: z.boolean().default(false).volatile(),
  proactiveHeartbeatMs: z.number().default(300000).volatile(),
  proactiveMinIdleMs: z.number().default(7200000).volatile(),
  proactiveMaxPerDay: z.number().default(2).volatile(),

  // 发送（默认关闭）
  sendingEnabled: z.boolean().default(false).volatile(),
  sendingAllowlist: z.array(z.string()).default([]).volatile(),
  sendingCategories: z.array(z.string()).default(['reply']).volatile(),
  sendingCooldownMs: z.number().default(5000).volatile(),
  sendingDailyLimit: z.number().default(0).volatile(),
  quietHours: z.array(z.number()).default([]).volatile(),

  // 入站桥接收口（token 为空 = 关闭 /say 路由）
  ingressToken: z.string().default('').volatile(),

  // 联网预算（规格 §5）
  netMaxQueriesPerHour: z.number().default(30).volatile(),
  netMaxConcurrent: z.number().default(2).volatile(),
  netMaxBytes: z.number().default(512000).volatile(),
  netTimeoutMs: z.number().default(15000).volatile(),

  // 平台（默认关闭）
  biliEnabled: z.boolean().default(false).volatile(),

  // 日志
  logLevel: z.union([z.const('debug'), z.const('info'), z.const('warn'), z.const('error')]).default('info').volatile(),

  // 工具面
  toolsAllow: z.array(z.string()).default([]).volatile(),
  toolsRestrict: z.boolean().default(true).volatile(),
})

/** 读一个可能是 volatile 包装的配置字段：有 .get() 就解包，否则原值/回退。 */
export function read(cfg, key, fallback) {
  const v = cfg?.[key]
  if (v !== null && typeof v === 'object' && typeof v.get === 'function') return v.get()
  return v === undefined || v === null ? fallback : v
}
