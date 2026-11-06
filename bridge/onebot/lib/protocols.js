/**
 * protocols.js —— 桥到 DSH 的两种 /say 协议。
 *
 * v3（现状，默认）
 *   POST /dsh-fish-v3/say，`Authorization: Bearer <ingress token>`，
 *   body { mode, account, scene, channel, eventId, sender, text, mentioned }，
 *   同步返回 { ok, response, silent }。
 *
 * dsh-fish（上游 @ssamurias/dsh-fish 0.9.x）
 *   POST /dsh-fish/say，鉴权靠 DSH 会话 cookie（见 dsh-auth.js），
 *   body { text, channel, scene, speaker, room, guest, title }，
 *   返回 { ok, said, herReply, note, sessionId }。
 *   注意：上游 0.9.1 的 herReply 只含她 commit 下来的事件，正常聊天正文不在里面
 *   （issue #51）；此时可选用会话落盘兜底（见 session-read.js）。
 *
 * 桥只做协议转换；两种协议都不持有模型、记忆或身份。
 */

/** 一次回合最多等多久（上游 /say 自己等 75s，这里留足余量）。 */
const SAY_TIMEOUT_MS = 150_000

/** URL 已经能说明是哪种协议时直接认，不必探测。 */
export function protocolFromUrl(sayUrl) {
  let pathname = ''
  try { pathname = new URL(String(sayUrl)).pathname } catch { return '' }
  if (pathname.includes('/dsh-fish-v3/')) return 'v3'
  if (pathname.includes('/dsh-fish/')) return 'dsh-fish'
  return ''
}

/**
 * 探测协议：先看 URL，再问两个健康/身份入口。
 * - `/dsh-fish-v3/health` 不鉴权，200 = v3；
 * - `/dsh-fish/whoami` 走 connection 栅栏，带 cookie 200 = dsh-fish。
 * 都问不出来就按 v3（保持老部署行为）。
 */
export async function detectProtocol({ sayUrl, authHeader = '', fetchFn = globalThis.fetch, timeoutMs = 3000 }) {
  const fromUrl = protocolFromUrl(sayUrl)
  if (fromUrl) return fromUrl
  let base = ''
  try {
    const u = new URL(String(sayUrl))
    base = `${u.protocol}//${u.host}`
  } catch {
    return 'v3'
  }
  try {
    const res = await fetchFn(`${base}/dsh-fish-v3/health`, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) return 'v3'
  } catch { /* 继续探下一个 */ }
  try {
    const headers = authHeader ? { cookie: authHeader } : {}
    const res = await fetchFn(`${base}/dsh-fish/whoami`, { headers, signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) return 'dsh-fish'
  } catch { /* 落到默认 */ }
  return 'v3'
}

/** v3 适配器：与改动前的行为逐字段一致。 */
export function createV3Protocol({ sayUrl, token, fetchFn = globalThis.fetch, timeoutMs = SAY_TIMEOUT_MS }) {
  return {
    name: 'v3',
    async say(n) {
      let res
      let data
      try {
        res = await fetchFn(sayUrl, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(n.body),
          signal: AbortSignal.timeout(timeoutMs),
        })
        data = await res.json()
      } catch {
        return { ok: false, error: 'say-unreachable' }
      }
      if (res.status !== 200 || !data?.ok) return { ok: false, error: data?.error ?? `say-${res.status}` }
      if (data.silent) return { ok: true, silent: true, reason: data.reason ?? 'silent' }
      if (!data.response) return { ok: true, silent: true, reason: 'empty-response' }
      return { ok: true, reply: String(data.response) }
    },
  }
}

/**
 * 上游 dsh-fish 适配器。
 *
 * @param {object} o
 * @param {string} o.sayUrl      http://<dsh>/dsh-fish/say
 * @param {object} o.auth        createDshAuth 的返回值
 * @param {string} [o.ownerId]   主人 QQ；不填＝所有私聊都按主人处理（保持旧行为）
 * @param {string} [o.channelPrefix] 默认 'qq' → qq-group:<群号> / qq:dm:<QQ号>
 * @param {object} [o.sessionReader] 可选，见 session-read.js
 * @param {Function} [o.fetchFn]
 */
export function createDshFishProtocol({
  sayUrl,
  auth,
  ownerId = '',
  channelPrefix = 'qq',
  sessionReader = null,
  fetchFn = globalThis.fetch,
  timeoutMs = SAY_TIMEOUT_MS,
  log = () => {},
}) {
  const prefix = String(channelPrefix || 'qq').replace(/[:：]+$/, '')
  const owner = String(ownerId ?? '').trim()

  /** 上游 /say 的入参；群聊仍按 group 记场次，私聊默认并进书房。 */
  function buildBody(n) {
    const isGroup = n.target.scene === 'group'
    const isGuest = !isGroup && Boolean(owner) && String(n.userId ?? '') !== owner
    const channel = isGroup
      ? `${prefix}-group:${n.target.id}`
      : isGuest
        ? `${prefix}:dm:${n.target.id}`
        : `${prefix}:${n.target.id}`
    return {
      text: n.text,
      scene: isGroup ? 'group' : 'private',
      channel,
      speaker: n.sender,
      room: isGroup || isGuest ? 'channel' : 'house',
      ...(isGuest ? { guest: true } : {}),
      ...(n.groupName ? { title: n.groupName } : {}),
    }
  }

  return {
    name: 'dsh-fish',
    async say(n) {
      const cookie = typeof auth?.header === 'function' ? auth.header() : ''
      if (!cookie) {
        return { ok: false, error: `say-unauthorized: ${auth?.describe?.() ?? '没有 DSH 会话凭据'}` }
      }
      const started = Date.now()
      let res
      let data = {}
      try {
        res = await fetchFn(sayUrl, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(buildBody(n)),
          signal: AbortSignal.timeout(timeoutMs),
        })
        data = await res.json().catch(() => ({}))
      } catch {
        return { ok: false, error: 'say-unreachable' }
      }
      if (res.status === 401) return { ok: false, error: 'say-unauthorized' }
      if (res.status === 403) return { ok: false, error: 'say-forbidden（Host 不在 DSH 信任名单；用 --trusted-host 或走 127.0.0.1）' }
      if (res.status === 429) return { ok: false, error: 'say-busy' }
      if (res.status !== 200) return { ok: false, error: data?.error ?? `say-${res.status}` }
      if (data?.ok === false) return { ok: false, error: data?.error ?? 'say-error' }

      let reply = String(data?.herReply ?? '').trim()
      if (!reply && Array.isArray(data?.said)) {
        reply = data.said.map((s) => String(s?.text ?? '')).filter(Boolean).join('\n\n').trim()
      }
      if (!reply && sessionReader?.enabled && data?.sessionId) {
        // 上游 0.9.1 的已知缺口：普通聊天正文不进 said，只能读会话落盘。
        reply = String(await sessionReader.waitForReply({ sessionId: data.sessionId, since: started })).trim()
      }
      if (!reply) {
        log(`上游 /say 没有回话${data?.note ? `（${data.note}）` : ''}`)
        return { ok: true, silent: true, reason: 'empty-response', note: data?.note ?? '' }
      }
      return { ok: true, reply }
    },
  }
}
