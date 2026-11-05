/**
 * ingest.js —— 入站事件规范化 + 会话键派生 + 幂等去重。
 *
 * 契约见 docs/architecture.md §3。桥接把平台消息投进来，这里做三件事：
 *   1. 校验必填字段；2. 派生会话键（account + scope）；3. 幂等去重（eventId）。
 * 本模块由（后续）HTTP 入站路由调用；现在独立可单测。
 */

export const REQUIRED_FIELDS = ['account', 'eventId', 'scope', 'sender', 'ts', 'contentType']
export const CONTENT_TYPES = ['text', 'image', 'mixed']

/** 会话键 = 平台账号 + 会话范围（private | group:<id> | desk）。 */
export function sessionKey(account, scope) {
  const s = String(scope ?? 'private').trim()
  return `${String(account)}:${s}`
}

/** 规范化并校验。返回 { ok:true, event } | { ok:false, error }。 */
export function normalizeEvent(raw) {
  const e = raw ?? {}
  for (const f of REQUIRED_FIELDS) {
    if (e[f] === undefined || e[f] === null || e[f] === '') return { ok: false, error: `missing field: ${f}` }
  }
  const contentType = String(e.contentType)
  if (!CONTENT_TYPES.includes(contentType)) return { ok: false, error: `unsupported contentType: ${contentType}` }
  return {
    ok: true,
    event: {
      account: String(e.account),
      eventId: String(e.eventId),
      scope: String(e.scope),
      sender: String(e.sender),
      ts: Number(e.ts),
      contentType,
      channel: e.channel ? String(e.channel) : '',
      text: e.text ? String(e.text) : '',
    },
  }
}

/**
 * @param {object} opts { ttlMs, max }
 * @returns {{ accept(raw): {ok:true,event,sessionKey}|{ok:false,error,dup?} }}
 */
export function createIngest(opts = {}) {
  const ttlMs = Number(opts.ttlMs ?? 600000)
  const max = Math.max(1, Number(opts.max ?? 512))
  const seen = new Map() // eventId -> ts

  function prune(now) {
    for (const [k, ts] of seen) if (now - ts > ttlMs) seen.delete(k)
  }

  return {
    accept(raw) {
      const r = normalizeEvent(raw)
      if (!r.ok) return r
      const now = Date.now()
      prune(now)
      if (seen.has(r.event.eventId)) return { ok: false, error: 'duplicate eventId', dup: true }
      // 容量控制：超出先逐出最旧一条，避免无界增长
      if (seen.size >= max) {
        let oldestK = null
        let oldestT = Infinity
        for (const [k, ts] of seen) if (ts < oldestT) { oldestT = ts; oldestK = k }
        if (oldestK) seen.delete(oldestK)
      }
      seen.set(r.event.eventId, now)
      return { ok: true, event: r.event, sessionKey: sessionKey(r.event.account, r.event.scope) }
    },
    has(eventId) { return seen.has(String(eventId)) },
  }
}
