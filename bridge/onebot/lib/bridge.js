/**
 * 桥核心：OneBot 事件 → 允许名单 → /say → 出站闸。
 * 不持有模型、记忆或身份；只做协议转换与发送授权。
 */
import { normalizeEvent, allowed } from './normalize.js'

export function createBridge({ selfId, account, allowlist, sayUrl, sayToken, outbound, fetchFn = globalThis.fetch, log = () => {}, maxSeen = 2000, seen = new Set(), onSeen = () => {} }) {
  // 已处理事件（含在途）：NapCat 重投或网络重试不得导致二次发送。有界 FIFO。
  // 传入的 seen 可预填（重启后从磁盘恢复）；onSeen 在每次记住新事件时回调，用于持久化。
  const remember = (key) => { seen.add(key); if (seen.size > maxSeen) seen.delete(seen.values().next().value); onSeen(key) }
  return {
    async handle(ev) {
      const n = normalizeEvent(ev, { selfId, account })
      if (n.skip) return { action: 'skip', reason: n.skip }
      if (!allowed(n.target, allowlist)) { log(`拒绝：${n.target.scene}:${n.target.id} 不在允许名单`); return { action: 'skip', reason: 'not-allowlisted' } }
      const key = `${n.target.scene}:${n.target.id}:${n.body.eventId}`
      if (seen.has(key)) return { action: 'skip', reason: 'duplicate' }
      remember(key)

      let res, data
      try {
        res = await fetchFn(sayUrl, {
          method: 'POST',
          headers: { authorization: `Bearer ${sayToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(n.body),
          signal: AbortSignal.timeout(90000),
        })
        data = await res.json()
      } catch {
        return { action: 'error', reason: 'say-unreachable' }
      }
      if (res.status !== 200 || !data?.ok) return { action: 'error', reason: data?.error ?? `say-${res.status}` }
      if (data.silent) return { action: 'silent', reason: data.reason }
      if (!data.response) return { action: 'silent', reason: 'empty-response' }

      const out = await outbound.send(n.target, data.response)
      return { action: out.sent ? 'sent' : 'held', reason: out.reason, response: data.response }
    },
  }
}
