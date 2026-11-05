/**
 * config.js —— 插件 Config（schemastery）。
 *
 * 只放「生长环境」参数，**不放人格设置**（红线：人格从事件/记忆长出）。
 * 所有键都有默认值；部署取值由用户在自己 profile 的 cordis.patch.yml 里覆盖。
 */
import z from '@deepseek-ai/schemastery'

export const GROUP_MODES = ['quiet', 'balanced', 'active']

export const Config = z.object({
  // 名字只用于日志/报告，不进系统提示词（身份文本在 lib/identity.js，固定）
  name: z.string().default('大肥鱼'),

  // 运行期数据目录：空 = <DSH_HOME>/dsh-fish-v3
  dataDir: z.string().default(''),

  // 群内参与节奏：quiet 只在点名/明确相关时回；balanced 平衡；active 更积极
  groupMode: z.union(GROUP_MODES.map((m) => z.const(m))).default('balanced'),

  // 记忆
  memoryRetentionDays: z.number().default(0),      // 0 = 不自动清理
  memoryMaxRecords: z.number().default(10000),

  // 主动参与（默认关闭）
  proactiveEnabled: z.boolean().default(false),
  proactiveHeartbeatMs: z.number().default(300000),
  proactiveMinIdleMs: z.number().default(7200000),
  proactiveMaxPerDay: z.number().default(2),

  // 真实发送（默认关闭）
  sendingEnabled: z.boolean().default(false),

  // 工具面
  toolsAllow: z.array(z.string()).default([]),    // 额外放行工具名（只做加法）
  toolsRestrict: z.boolean().default(true),       // 是否收窄聊天 Agent 工具面
})
