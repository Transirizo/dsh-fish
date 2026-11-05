/**
 * config.js —— 插件 Config（schemastery）。
 *
 * 只放「生长环境」参数，**不放人格设置**（红线：人格从事件/记忆长出）。
 * 所有键都有默认值；部署取值由用户在自己 profile 的 cordis.patch.yml 里覆盖。
 * 这是规格 §11 的统一管理员配置入口（模型/信息 provider 的接入由宿主 DSH 的 llm 体系负责，
 * 这里只管发送/联网/主动/记忆/节奏/日志/功能开关等陪伴者自身策略）。
 */
import z from '@deepseek-ai/schemastery'

export const GROUP_MODES = ['quiet', 'balanced', 'active']

export const Config = z.object({
  // 身份与目录
  name: z.string().default('大肥鱼'),
  dataDir: z.string().default(''),

  // 群内节奏
  groupMode: z.union(GROUP_MODES.map((m) => z.const(m))).default('balanced'),

  // 记忆
  memoryRetentionDays: z.number().default(0),      // 0 = 不自动清理
  memoryMaxRecords: z.number().default(10000),

  // 主动参与（默认关闭）
  proactiveEnabled: z.boolean().default(false),
  proactiveHeartbeatMs: z.number().default(300000),
  proactiveMinIdleMs: z.number().default(7200000),
  proactiveMaxPerDay: z.number().default(2),

  // 发送（默认关闭）
  sendingEnabled: z.boolean().default(false),
  sendingAllowlist: z.array(z.string()).default([]),   // 目标 scope 白名单
  sendingCategories: z.array(z.string()).default(['reply']),
  sendingCooldownMs: z.number().default(5000),
  sendingDailyLimit: z.number().default(0),            // 0 = 不限
  quietHours: z.array(z.number()).default([]),         // [start, end] 小时，如 [23, 7]

  // 联网预算（规格 §5）
  netMaxQueriesPerHour: z.number().default(30),
  netMaxConcurrent: z.number().default(2),
  netMaxBytes: z.number().default(512000),
  netTimeoutMs: z.number().default(15000),

  // 平台（默认关闭）
  biliEnabled: z.boolean().default(false),

  // 日志
  logLevel: z.union([z.const('debug'), z.const('info'), z.const('warn'), z.const('error')]).default('info'),

  // 工具面
  toolsAllow: z.array(z.string()).default([]),    // 额外放行工具名（只做加法）
  toolsRestrict: z.boolean().default(true),       // 是否收窄聊天 Agent 工具面
})
