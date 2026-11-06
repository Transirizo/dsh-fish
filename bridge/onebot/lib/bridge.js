/**
 * 桥核心：OneBot 事件 → 允许名单 → /say → 出站闸。
 * 不持有模型、记忆或身份；只做协议转换与发送授权。
 *
 * 协议由 `protocol` 注入（v3 / 上游 dsh-fish）；不传时退回 v3，行为与改动前一致。
 */
import { normalizeEvent, allowed } from './normalize.js'
import { createV3Protocol } from './protocols.js'

export function createBridge({
  selfId,
  account,
  allowlist,
  sayUrl,
  sayToken,
  outbound,
  protocol = null,
  // 上游 dsh-fish 没有「未点名是否回」的插件侧闸门；群聊默认由桥过滤（AGENTS §7：
  // 「只有 @ 她才进」）。v3 保持 false，仍交给插件的 groupMode 判。
  groupRequireAt = false,
  fetchFn = globalThis.fetch,
  log = () => {},
  maxSeen = 2000,
  seen = new Set(),
  onSeen = () => {},
}) {
  const say = protocol ?? createV3Protocol({ sayUrl, token: sayToken, fetchFn })
  // 已处理事件（含在途）：NapCat 重投或网络重试不得导致二次发送。有界 FIFO。
  // 传入的 seen 可预填（重启后从磁盘恢复）；onSeen 在每次记住新事件时回调，用于持久化。
  const remember = (key) => { seen.add(key); if (seen.size > maxSeen) seen.delete(seen.values().next().value); onSeen(key) }
  return {
    async handle(ev) {
      const n = normalizeEvent(ev, { selfId, account })
      if (n.skip) return { action: 'skip', reason: n.skip }
      if (!allowed(n.target, allowlist)) { log(`拒绝：${n.target.scene}:${n.target.id} 不在允许名单`); return { action: 'skip', reason: 'not-allowlisted' } }
      // 上游 dsh-fish 的 /say 不看 mentioned：群聊没 @ 她也照回。这里在桥侧挡住。
      if (groupRequireAt && n.target.scene === 'group' && !n.mentioned) return { action: 'skip', reason: 'not-mentioned' }
      const key = `${n.target.scene}:${n.target.id}:${n.eventId}`
      if (seen.has(key)) return { action: 'skip', reason: 'duplicate' }
      remember(key)

      const r = await say.say(n)
      if (!r.ok) return { action: 'error', reason: r.error }
      if (r.silent) return { action: 'silent', reason: r.reason }

      const out = await outbound.send(n.target, r.reply)
      return { action: out.sent ? 'sent' : 'held', reason: out.reason, response: r.reply }
    },
  }
}
