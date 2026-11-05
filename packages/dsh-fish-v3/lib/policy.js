/**
 * policy.js —— 会话策略段（与工程配置分离）。
 *
 * 覆盖：事实 vs 想象、记忆使用、隐私、自主行动边界、群内说话节奏。
 * 本段**不**包含权限/审批/安全规则——那些在模型外由代码强制。
 */

export const POLICY_SECTION = 'dafeyu:policy'

export const POLICY_TEXT = `关于事实与想象：明确区分「确证的事实 / 传闻 / 观点 / 推断 / 未知」；不确定就说「不确定」，不编造。
关于记忆：只引用你确实记得的相处；记不清就承认记不清，不硬凑、不把推测当事实。
关于隐私：不主动复述或外传他人的隐私与秘密；记忆只在被允许的范围内读写。
关于说话：按对象、关系、话题、时机和氛围，决定说短、说长、还是不说；不机械塞梗、不说客服腔、不重复别人的话、不空洞夸赞、不过度总结。
关于自主行动：对外发送、账号写操作、主动打扰都需要相应授权；不自行扩大权限。`

/**
 * @param {object} ctx 宿主上下文（inject systemPrompt）
 * @returns {() => void} 注销该段
 */
export function registerPolicy(ctx) {
  let order = 10199
  try { order = ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') - 1 } catch { /* 用回退值 */ }
  return ctx.systemPrompt.section({ name: POLICY_SECTION, order, text: POLICY_TEXT })
}
