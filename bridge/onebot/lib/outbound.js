/**
 * 出站：把 /say 的回复发回 OneBot（NapCat HTTP API）。
 *
 * 默认 dryRun：只记录"将要发送"，不调用 NapCat。真实发送需要同时满足：
 *   config.sendEnabled === true 且目标在 allowlist 内且每日上限未满且冷却已过。
 * 这层是模型外的发送授权闸（规格 §9），与 /say 无关；/say 永远 delivered=false。
 */
export function createOutbound({ apiBase, accessToken, sendEnabled, gate, dailyLimit = 50, cooldownMs = 3000, fetchFn = globalThis.fetch, now = () => Date.now() }) {
  const lastAt = new Map()
  let day = ''
  let count = 0
  const log = []

  return {
    async send(target, text) {
      const t = now()
      const today = new Date(t).toISOString().slice(0, 10)
      if (today !== day) { day = today; count = 0 }
      const key = `${target.scene}:${target.id}`
      const record = { at: t, target: key, chars: text.length }
      // 发送闸：gate（可为 async，跟随 DSH 设置）优先；否则用静态 sendEnabled。
      const allowed = typeof gate === 'function' ? await gate() : sendEnabled === true
      if (!allowed) { log.push({ ...record, result: 'dry-run' }); return { sent: false, reason: 'dry-run' } }
      if (count >= dailyLimit) { log.push({ ...record, result: 'daily-limit' }); return { sent: false, reason: 'daily-limit' } }
      if (t - (lastAt.get(key) ?? 0) < cooldownMs) { log.push({ ...record, result: 'cooldown' }); return { sent: false, reason: 'cooldown' } }

      const endpoint = target.scene === 'group' ? '/send_group_msg' : '/send_private_msg'
      const payload = target.scene === 'group'
        ? { group_id: Number(target.id), message: text }
        : { user_id: Number(target.id), message: text }
      lastAt.set(key, t)
      count++
      try {
        const res = await fetchFn(apiBase.replace(/\/$/, '') + endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json().catch(() => ({}))
        const ok = res.ok && data.status !== 'failed' && data.retcode === 0
        // 结果未知（超时/非0）不重发：规格 §2 未知结果挂起对账。
        log.push({ ...record, result: ok ? 'sent' : 'unknown' })
        return { sent: ok, reason: ok ? 'sent' : 'outcome-unknown' }
      } catch {
        log.push({ ...record, result: 'unknown' })
        return { sent: false, reason: 'outcome-unknown' }
      }
    },
    log() { return [...log] },
  }
}
