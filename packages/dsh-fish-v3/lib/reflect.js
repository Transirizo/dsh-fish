/**
 * reflect.js —— 周期性自我整理（无模型、确定性 v1）。
 *
 * 读记忆产出：各类型计数、仍热 vs 已淡的兴趣、开放问题、最近日记。
 * 这是「内部整理」，不产生对外消息；后续可换成模型生成的反思（P2）。
 */
const DAY_MS = 86_400_000

export async function reflect(memory, { now = Date.now() } = {}) {
  const all = await memory.list()
  const interests = await memory.listByType('interest', { limit: 100 })
  const diaries = await memory.listByType('diary', { limit: 5 })
  const questions = all.filter((r) => r.type === 'question').map((r) => r.text).slice(-3)

  const levels = interests.map((r) => {
    const ageDays = Math.max(0, Math.round((now - Number(r.ts)) / DAY_MS))
    return { text: r.text, level: ageDays < 7 ? '热' : ageDays < 30 ? '温' : '淡', ageDays }
  })

  return {
    counts: {
      fact: all.filter((r) => r.type === 'fact').length,
      event: all.filter((r) => r.type === 'event').length,
      diary: all.filter((r) => r.type === 'diary').length,
      interest: interests.length,
    },
    hot: levels.filter((x) => x.level === '热').map((x) => x.text),
    faded: levels.filter((x) => x.level === '淡').map((x) => x.text),
    openQuestions: questions,
    recentDiary: diaries[0]?.text ?? '',
    generatedAt: now,
  }
}

export function formatReflection(r) {
  const c = r.counts
  const lines = [
    `[整理 ${new Date(r.generatedAt).toISOString()}]`,
    `事实 ${c.fact} 条 · 事件 ${c.event} 条 · 日记 ${c.diary} 篇 · 兴趣 ${c.interest} 个`,
  ]
  if (r.hot.length) lines.push(`还在上心的：${r.hot.join('、')}`)
  if (r.faded.length) lines.push(`已经淡去的：${r.faded.join('、')}`)
  if (r.openQuestions.length) lines.push(`还没想明白的：${r.openQuestions.join('、')}`)
  if (r.recentDiary) lines.push(`最近日记：${r.recentDiary.slice(0, 80)}`)
  return lines.join('\n')
}
