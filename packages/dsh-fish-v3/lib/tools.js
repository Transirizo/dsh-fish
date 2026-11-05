/**
 * tools.js —— 聊天 Agent 的工具面。
 *
 * v0.1 三个工具：fish_status（自检）、fish_recall（回忆）、fish_remember（记一条）。
 * 参数用标准 JSON Schema（宿主把 parameters 原样交给 provider，不做 DSL 编译）。
 */
import { VERSION } from './version.js'
import { sanitizeForeign, looksSecret } from './guard.js'
import { browse } from './browse.js'
import { createBudget } from './budget.js'

const textOutput = (schema) => ({
  schema: { type: 'object', properties: schema, required: Object.keys(schema), additionalProperties: false },
  render: (_args, out) => [{ type: 'text', text: out.text }],
})

function emptyParams() {
  return { type: 'object', properties: {}, additionalProperties: false }
}

/**
 * @param {object} ctx 宿主上下文（inject tools）
 * @returns {() => void} 注销全部工具
 */
export function registerTools(ctx, { memory, config, dataDir, fetchFn }) {
  const disposers = []
  const budget = createBudget({
    maxQueriesPerWindow: Number(config.netMaxQueriesPerHour ?? 30) || 0,
    windowMs: 3600000,
    maxConcurrent: Number(config.netMaxConcurrent ?? 2) || 0,
  })

  disposers.push(ctx.tools.register({
    name: 'fish_status',
    description: '看一眼大肥鱼自己的状态：跑在哪、记得多少条、群内节奏、真实发送有没有开。',
    parameters: emptyParams(),
    output: textOutput({ ok: { type: 'boolean' }, text: { type: 'string' } }),
    async execute() {
      const count = await memory.count()
      const text = [
        `大肥鱼（${VERSION}）`,
        `数据目录：${dataDir}`,
        `记忆条数：${count}`,
        `群内节奏：${config.groupMode ?? 'balanced'}`,
        `真实发送：${config.sendingEnabled ? '已开' : '关闭（默认）'}`,
        `主动参与：${config.proactiveEnabled ? '已开' : '关闭（默认）'}`,
      ].join('\n')
      return { ok: true, text }
    },
  }))

  disposers.push(ctx.tools.register({
    name: 'fish_recall',
    description: '翻大肥鱼过去记下的事。想提「以前有一次」的时候先用它翻一翻，翻到了再说；翻不到就别编。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '你想找的是什么，几个词就够。' },
        days: { type: 'number', description: '只想翻最近多少天就传几天；不传就是全部。' },
        limit: { type: 'number', description: '最多给几条，默认 8。' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: textOutput({ found: { type: 'boolean' }, text: { type: 'string' } }),
    async execute(args = {}) {
      try {
        const rows = await memory.recall(args.query, { days: args.days, limit: args.limit })
        if (!rows.length) return { found: false, text: '没翻到相关的事。' }
        const text = rows.map((r) => `[${r.type}/${r.scope}] ${clip(r.text, 200)}`).join('\n')
        return { found: true, text }
      } catch (err) {
        return { found: false, text: `翻不动：${String(err?.message ?? err).slice(0, 120)}` }
      }
    },
  }))

  disposers.push(ctx.tools.register({
    name: 'fish_remember',
    description: '把一件值得记住的事写进大肥鱼的记忆。只记真实发生过、值得留的事；不把猜测当事实。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '类型：fact | event | opinion | interest | diary | question' },
        scope: { type: 'string', description: '范围：global | private | group | shared' },
        text: { type: 'string', description: '要记下来的那句话。' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: textOutput({ ok: { type: 'boolean' }, text: { type: 'string' } }),
    async execute(args = {}) {
      const text = sanitizeForeign(args.text)
      if (!text) return { ok: false, text: '没内容，没记。' }
      if (looksSecret(text)) return { ok: false, text: '这句话看着像秘密，不记。' }
      const rec = await memory.append({ type: args.type ?? 'fact', scope: args.scope ?? 'global', text })
      return { ok: true, text: `记下了（${rec.id}）。` }
    },
  }))

  disposers.push(ctx.tools.register({
    name: 'fish_diary',
    description: '写或翻大肥鱼自己的日记。日记是写给自己看的，不是交出去的汇报；写的时候说真心话，翻的时候如实看。',
    parameters: {
      type: 'object',
      properties: {
        verb: { type: 'string', description: 'write=写一篇；read=看某一天；list=看写过哪些天。', enum: ['write', 'read', 'list'] },
        text: { type: 'string', description: 'verb=write 时要写下的内容。' },
        date: { type: 'string', description: 'verb=read 时看哪一天（YYYY-MM-DD）；不写就是最近一天。' },
      },
      required: ['verb'],
      additionalProperties: false,
    },
    output: textOutput({ ok: { type: 'boolean' }, text: { type: 'string' } }),
    async execute(args = {}) {
      const verb = String(args.verb ?? '')
      if (verb === 'write') {
        const text = sanitizeForeign(args.text)
        if (!text) return { ok: false, text: '没内容，没写。' }
        if (looksSecret(text)) return { ok: false, text: '这句话看着像秘密，不写。' }
        const rec = await memory.append({ type: 'diary', scope: 'global', text })
        return { ok: true, text: `记下了（${rec.id}）。` }
      }
      if (verb === 'list') {
        const rows = await memory.listByType('diary', { limit: 200 })
        const dates = [...new Set(rows.map((r) => dateKey(r.ts)))]
        return { ok: true, text: dates.length ? `写过这些天：${dates.join('、')}` : '还没写过日记。' }
      }
      if (verb === 'read') {
        const rows = await memory.listByType('diary', { limit: 200 })
        const d = args.date || (rows[0] ? dateKey(rows[0].ts) : '')
        const mine = rows.filter((r) => dateKey(r.ts) === d)
        if (!mine.length) return { ok: true, text: args.date ? `${args.date} 没写日记。` : '最近没写日记。' }
        return { ok: true, text: mine.map((r) => `[${dateKey(r.ts)}] ${r.text}`).join('\n') }
      }
      return { ok: false, text: `未知 verb：${verb}` }
    },
  }))

  disposers.push(ctx.tools.register({
    name: 'fish_interest',
    description: '管理大肥鱼正在长出来的兴趣：记下一个上心的话题，或看看现在对什么还热、什么已经淡了。兴趣会随时间和新的经历自然变化，可以淡去。',
    parameters: {
      type: 'object',
      properties: {
        verb: { type: 'string', description: 'add=记下一个兴趣；list=看现在的兴趣热度。', enum: ['add', 'list'] },
        topic: { type: 'string', description: 'verb=add 时要记下的兴趣话题。' },
      },
      required: ['verb'],
      additionalProperties: false,
    },
    output: textOutput({ ok: { type: 'boolean' }, text: { type: 'string' } }),
    async execute(args = {}) {
      const verb = String(args.verb ?? '')
      if (verb === 'add') {
        const topic = sanitizeForeign(args.topic)
        if (!topic) return { ok: false, text: '没内容，没记。' }
        await memory.append({ type: 'interest', scope: 'global', text: topic })
        return { ok: true, text: `记下兴趣：${topic}。` }
      }
      if (verb === 'list') {
        const rows = await memory.listByType('interest', { limit: 100 })
        if (!rows.length) return { ok: true, text: '还没什么特别上心的事。' }
        const now = Date.now()
        const DAY = 86_400_000
        const ranked = rows
          .map((r) => {
            const ageDays = Math.max(0, Math.round((now - Number(r.ts)) / DAY))
            const level = ageDays < 7 ? '热' : ageDays < 30 ? '温' : '淡'
            return { text: r.text, level, ageDays }
          })
          .sort((a, b) => a.ageDays - b.ageDays)
        return { ok: true, text: ranked.map((x) => `${x.text}（${x.level}，${x.ageDays} 天前）`).join('\n') }
      }
      return { ok: false, text: `未知 verb：${verb}` }
    },
  }))

  disposers.push(ctx.tools.register({
    name: 'fish_browse',
    description: '抓一个公开网页看看内容。只在需要核对事实、查当前信息、或学新说法时用；会返回来源和抓取时间。受限：只允许公网 http(s) URL，体积与次数有预算。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要抓的完整 http(s) URL。' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: textOutput({ ok: { type: 'boolean' }, text: { type: 'string' } }),
    async execute(args = {}) {
      const r = await browse(String(args.url ?? ''), {
        budget,
        fetchFn,
        maxBytes: Number(config.netMaxBytes ?? 512000) || 512000,
        timeoutMs: Number(config.netTimeoutMs ?? 15000) || 15000,
      })
      if (!r.ok) return { ok: false, text: `抓不动：${r.error}` }
      const when = new Date(r.retrievedAt).toISOString()
      return { ok: true, text: `[来源 ${r.url} · 抓取 ${when} · ${r.contentType}]\n${r.text}` }
    },
  }))

  return () => { for (const d of disposers) { try { d() } catch { /* ignore */ } } }
}

const clip = (text, n) => (text.length > n ? text.slice(0, n - 1).replace(/[\uD800-\uDBFF]$/, '') + '…' : text)

/** 毫秒时间戳 → 本地 YYYY-MM-DD。 */
function dateKey(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return ''
  const d = new Date(n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
