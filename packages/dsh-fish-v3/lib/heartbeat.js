/**
 * heartbeat.js —— 自主心跳的定时器接线。
 *
 * 周期性跑一次 reflect()，把整理结果作为 `reflection` 记录追加进记忆（内部整理，不外发）。
 * 默认关闭（enabled=false 返回 noop）；重活用 running 标志避免重入，不阻塞普通聊天。
 */
import { reflect, formatReflection } from './reflect.js'

export function startHeartbeat(ctx, { memory, intervalMs, enabled, log }) {
  if (!enabled) return () => {}
  const ms = Math.max(1000, Number(intervalMs) || 300000)
  const timer = ctx.get?.('timer') ?? {
    interval(cb, d) { const id = setInterval(cb, d); id.unref?.(); return () => clearInterval(id) },
  }
  let running = false
  return timer.interval(async () => {
    if (running) return
    running = true
    try {
      const r = await reflect(memory)
      await memory.append({ type: 'reflection', scope: 'global', text: formatReflection(r), ts: Date.now() })
      log?.(`[dsh-fish-v3] 心跳整理：事实${r.counts.fact} 事件${r.counts.event} 兴趣${r.counts.interest}`)
    } catch (err) {
      log?.(`[dsh-fish-v3] 心跳整理失败：${String(err?.message ?? err).slice(0, 120)}`)
    } finally {
      running = false
    }
  }, ms)
}
