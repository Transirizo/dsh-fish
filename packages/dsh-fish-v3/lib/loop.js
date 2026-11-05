/**
 * loop.js —— 把入站/记忆/模型/投递串成一条「回合」处理链。
 *
 * 这是桥接可调用的收口（未来由 HTTP 入站路由或桥接适配层调用）。
 * 模型由调用方注入：真实 DSH 里是 agent loop，离线模拟用确定性桩。
 *
 * 顺序：入站规范化+去重 → 入站授权（allowInbound）→ 文本消毒/秘密拦截
 *      → 记忆召回 → 模型调用 → 记忆写入（带 scope）→ 投递授权（delivery）。
 */
import { sessionKey } from './ingest.js'
import { sanitizeForeign, looksSecret } from './guard.js'

/**
 * @param {object} deps
 * @param {object} deps.memory   createMemory 返回值
 * @param {Function} deps.model  async ({ text, sessionKey, scope, sender, context }) => string
 * @param {object} deps.ingest   createIngest 返回值
 * @param {object} deps.delivery createDeliveryGate 返回值
 * @param {string[]} [deps.allowInbound] 入站 account:scope 白名单；设了就拒列表外的来源
 */
export function createLoop({ memory, model, ingest, delivery, allowInbound }) {
  const allowed = allowInbound ? new Set(allowInbound) : null

  return {
    async handleInbound(raw) {
      // 1. 入站：规范化 + 幂等去重 + 会话键
      const accepted = ingest.accept(raw)
      if (!accepted.ok) return { ok: false, reason: accepted.error, dup: !!accepted.dup }

      const { event } = accepted
      const sk = sessionKey(event.account, event.scope)

      // 2. 入站授权：来源/范围白名单。拒绝 = 整条不处理、不记忆。
      if (allowed && !allowed.has(sk)) return { ok: false, reason: 'unauthorized-event' }

      // 3. 文本消毒 + 秘密拦截
      const text = sanitizeForeign(event.text)
      if (!text) return { ok: false, reason: 'empty-text' }
      if (looksSecret(text)) return { ok: false, reason: 'blocked-secret' }

      // 4. 记忆召回（作为模型上下文）
      const context = await memory.recall(text, { limit: 3 })

      // 5. 模型调用
      const response = await model({
        text,
        sessionKey: sk,
        scope: event.scope,
        sender: event.sender,
        context,
      })

      // 6. 记忆写入（带 scope；内容生成与投递授权分离）
      await memory.append({
        type: 'event',
        scope: event.scope,
        text: `[${event.sender}] ${text}`,
        ts: event.ts,
      })

      // 7. 投递授权（模型外强制）
      const decision = delivery.authorize({ target: sk, category: 'reply' })

      return {
        ok: true,
        sessionKey: sk,
        response,
        delivered: decision.allowed,
        deliveryReason: decision.allowed ? null : decision.reason,
        deliveryId: decision.allowed ? decision.id : null,
      }
    },
  }
}
