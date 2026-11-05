/**
 * memory.js —— 追加式 JSONL 记忆。
 *
 * v0.1 用追加式 JSONL（零依赖、不可变追加，等同旧版 events.jsonl 已验证做法）。
 * 升级路径：@deepseek-ai/dsh-storage-domain（见 docs/adr/0001）。
 *
 * 记录形状：{ id, type, scope, text, ts, createdAt }
 *   type: fact | event | opinion | interest | diary | question | …
 *   scope: global | private:<x> | group:<x> | shared
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, appendFile } from 'node:fs/promises'
import path from 'node:path'

const DAY_MS = 86_400_000

export const MEMORY_TYPES = ['fact', 'event', 'opinion', 'interest', 'diary', 'question']
export const MEMORY_SCOPES = ['global', 'private', 'group', 'shared']

/** 查询切词：中文按二字切片补匹配（同旧版 tokensOf 思路）。 */
export function tokensOf(query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return []
  const out = new Set()
  for (const part of q.split(/[\s,，。、;；:：!！?？"'“”‘’()（）\[\]【】]+/)) {
    const p = part.trim()
    if (!p) continue
    out.add(p)
    if (p.length >= 3 && /[\u4e00-\u9fa5]/.test(p)) {
      for (let i = 0; i + 2 <= p.length; i++) out.add(p.slice(i, i + 2))
    }
  }
  return [...out]
}

export function createMemory(dataDir) {
  const file = path.join(dataDir, 'memory.jsonl')
  let ready = null
  const ensure = () => (ready ??= mkdir(dataDir, { recursive: true }))

  async function readAll() {
    await ensure()
    let raw
    try { raw = await readFile(file, 'utf8') } catch (e) { if (e?.code === 'ENOENT') return []; throw e }
    const rows = []
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try { rows.push(JSON.parse(t)) } catch { /* 跳过损坏行 */ }
    }
    return rows
  }

  return {
    file,

    async append(record) {
      await ensure()
      const rec = {
        id: record.id ?? randomUUID(),
        type: String(record.type ?? 'fact'),
        scope: String(record.scope ?? 'global'),
        text: String(record.text ?? '').trim(),
        ts: Number(record.ts ?? Date.now()),
        createdAt: Date.now(),
      }
      if (!rec.text) throw new Error('记忆记录必须有 text')
      await appendFile(file, JSON.stringify(rec) + '\n', 'utf8')
      return rec
    },

    async recall(query, opts = {}) {
      const rows = await readAll()
      const tokens = tokensOf(query)
      const limit = Math.max(1, Number(opts.limit ?? 8) || 8)
      const days = Number(opts.days ?? 0) || 0
      const now = Date.now()
      const scored = []
      for (const r of rows) {
        if (days > 0 && now - Number(r.ts ?? 0) > days * DAY_MS) continue
        const s = score(r, tokens, now)
        if (s > 0) scored.push({ r, s })
      }
      scored.sort((a, b) => b.s - a.s || (Number(b.r.ts) - Number(a.r.ts)))
      return scored.slice(0, limit).map((x) => x.r)
    },

    async count() { return (await readAll()).length },
    async list() { return readAll() },

    /** 按类型列出（新→旧），limit 截断。 */
    async listByType(type, opts = {}) {
      const rows = await readAll()
      const limit = Math.max(1, Number(opts.limit ?? 50) || 50)
      return rows
        .filter((r) => r.type === type)
        .sort((a, b) => Number(b.ts) - Number(a.ts))
        .slice(0, limit)
    },
  }
}

function score(rec, tokens, now) {
  const text = String(rec.text ?? '').toLowerCase()
  if (!tokens.length) {
    // 无查询时按最近优先（不给高分，避免“再翻一次”诱惑）
    return 0.5
  }
  let s = 0
  for (const t of tokens) {
    if (text.includes(t)) s += t.length >= 3 ? 2 : 1
  }
  // 没命中就不给分（时间加权只作用于命中的记录，否则非匹配记录也会混进来）
  if (s === 0) return 0
  const ageDays = (now - Number(rec.ts ?? now)) / DAY_MS
  s += Math.max(0, 0.5 - ageDays / 365)
  return s
}
