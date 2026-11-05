/**
 * delivery.js —— 出站投递授权闸（默认拒绝）。
 *
 * 内容生成与投递授权分离（规格 §9）：模型可以生成，但能不能发由这里在**模型外**强制。
 * 强制项：启用开关、目标 allowlist、类别、冷却、每日上限、停止开关、审计记录。
 */
import { randomUUID } from 'node:crypto'

/**
 * @param {object} config { enabled, allowlist, categories, cooldownMs, dailyLimit }
 */
export function createDeliveryGate(config = {}) {
  const enabled = Boolean(config.enabled)
  const allowlist = new Set(config.allowlist ?? [])
  const categories = new Set(config.categories ?? ['reply'])
  const cooldownMs = Number(config.cooldownMs ?? 5000)
  const dailyLimit = Number(config.dailyLimit ?? 0) // 0 = 不限
  const state = { lastAt: new Map(), dayCount: 0, dayStart: Date.now(), stopped: false }
  const audit = []

  function deny(reason) {
    const r = { allowed: false, reason }
    audit.push({ ts: Date.now(), ...r })
    return r
  }

  return {
    /** record: { target, category } */
    authorize(record = {}) {
      if (state.stopped) return deny('stop-switch')
      if (!enabled) return deny('sending-disabled')
      if (!categories.has(String(record.category ?? 'reply'))) return deny(`category-not-allowed:${record.category}`)
      const target = String(record.target ?? '')
      if (allowlist.size && !allowlist.has(target)) return deny('target-not-allowed')

      const now = Date.now()
      if (now - state.dayStart > 86_400_000) { state.dayStart = now; state.dayCount = 0 }
      if (dailyLimit > 0 && state.dayCount >= dailyLimit) return deny('daily-limit')

      const last = state.lastAt.get(target) ?? 0
      if (now - last < cooldownMs) return deny('cooldown')

      state.lastAt.set(target, now)
      state.dayCount += 1
      const ok = { allowed: true, id: randomUUID(), target, category: String(record.category ?? 'reply') }
      audit.push({ ts: now, ...ok })
      return ok
    },

    stop() { state.stopped = true },
    resume() { state.stopped = false },
    isStopped() { return state.stopped },
    audit() { return [...audit] },
  }
}
