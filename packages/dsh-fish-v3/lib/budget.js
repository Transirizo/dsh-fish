/**
 * budget.js —— 联网/查询预算（规格 §5：在代码里强制 query/时间/并发/花费预算）。
 *
 * 纯逻辑，可离线测试；用完即降级（返回 reason，不抛异常）。
 */
export function createBudget(config = {}) {
  const limits = {
    maxQueriesPerWindow: Number(config.maxQueriesPerWindow ?? 0), // 0 = 不限
    windowMs: Number(config.windowMs ?? 3600000),
    maxConcurrent: Number(config.maxConcurrent ?? 1),
  }
  const state = { windowStart: Date.now(), count: 0, active: 0 }

  return {
    /** 尝试占用一个并发槽 + 一个查询额度。返回 { ok:true, release } | { ok:false, reason }。 */
    acquire() {
      const now = Date.now()
      if (now - state.windowStart > limits.windowMs) { state.windowStart = now; state.count = 0 }
      if (limits.maxConcurrent > 0 && state.active >= limits.maxConcurrent) return { ok: false, reason: 'concurrency' }
      if (limits.maxQueriesPerWindow > 0 && state.count >= limits.maxQueriesPerWindow) return { ok: false, reason: 'quota' }
      state.active += 1
      state.count += 1
      let released = false
      return {
        ok: true,
        release() { if (!released) { released = true; state.active = Math.max(0, state.active - 1) } },
      }
    },
    stats() { return { ...state, limits } },
  }
}
