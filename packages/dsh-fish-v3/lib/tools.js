/**
 * tools.js —— 聊天 Agent 的工具面。
 *
 * v0.1 三个工具：fish_status（自检）、fish_recall（回忆）、fish_remember（记一条）。
 * 参数用标准 JSON Schema（宿主把 parameters 原样交给 provider，不做 DSL 编译）。
 */
import { VERSION } from './version.js'
import { sanitizeForeign, looksSecret } from './guard.js'

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
export function registerTools(ctx, { memory, config, dataDir }) {
  const disposers = []

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

  return () => { for (const d of disposers) { try { d() } catch { /* ignore */ } } }
}

const clip = (text, n) => (text.length > n ? text.slice(0, n - 1).replace(/[\uD800-\uDBFF]$/, '') + '…' : text)
