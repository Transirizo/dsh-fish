#!/usr/bin/env node
/**
 * patch-dsh-fish-say.mjs —— 给上游 @ssamurias/dsh-fish 0.9.1 的 lib/say.js 打补丁。
 *
 * 背景：0.9.1 的 `/dsh-fish/say` 只把 `growth_commit` 类事件放进 `herReply`；
 * 普通聊天正文（assistant/message）不进事件流，外部桥会收到「她这次没说话」。
 * 上游 issue #51（2026-11-06 仍开着）。补丁把本轮最后一条 assistant/message
 * 的正文作为 `herReply` 的兜底返回。
 *
 * 幂等：已经打过就跳过。只认 0.9.1 的三处原文；上游改版后应优先升级本脚本，
 * 而不是硬套（匹配不到会非零退出，不破坏文件）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('用法：node scripts/patch-dsh-fish-say.mjs <.../node_modules/@ssamurias/dsh-fish/lib/say.js>')
  process.exit(2)
}

let source
try {
  source = readFileSync(file, 'utf8')
} catch (err) {
  console.error(`读不到 ${file}：${err?.message ?? err}`)
  process.exit(2)
}

if (source.includes('turnWait.text?.()')) {
  console.log(`已打过补丁，跳过：${file}`)
  process.exit(0)
}

const replacements = [
  {
    name: 'beginTurnWait 收集正文',
    from: `  let settle = () => {}
  const promise = new Promise((resolve) => { settle = resolve })`,
    to: `  let settle = () => {}
  // issue #51：本轮最后一条 assistant/message 的正文，作为 herReply 的兜底
  let reply = ''
  const promise = new Promise((resolve) => { settle = resolve })`,
  },
  {
    name: '监听 assistant/message',
    from: `      const id = session?.header?.id ?? session?.id
      if (id !== sessionId) return
      if (event?.type === 'turn/end') finish()`,
    to: `      const id = session?.header?.id ?? session?.id
      if (id !== sessionId) return
      if (event?.type === 'assistant/message') {
        const content = event?.data?.message?.content
        const text = Array.isArray(content)
          ? content.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('')
          : ''
        if (text.trim()) reply = text
      }
      if (event?.type === 'turn/end') finish()`,
  },
  {
    name: '返回 text()',
    from: `  return { wait: () => promise, cancel: finish }`,
    to: `  return { wait: () => promise, cancel: finish, text: () => reply }`,
  },
  {
    name: 'herReply 兜底',
    from: `    const herReply = said.map((s) => s.text).join('\\n\\n')`,
    to: `    const committed = said.map((s) => s.text).join('\\n\\n')
    // issue #51：她正常聊天写下的正文不在事件流里；没有 commit 的话就用本轮正文。
    const herReply = committed || String(turnWait.text?.() ?? '').trim()`,
  },
  {
    name: 'note 判定',
    from: `    let note = said.length ? '' : '她这次没说话。'`,
    to: `    let note = (said.length || herReply) ? '' : '她这次没说话。'`,
  },
]

let next = source
const missing = []
for (const r of replacements) {
  if (!next.includes(r.from)) missing.push(r.name)
  else next = next.replace(r.from, r.to)
}
if (missing.length) {
  console.error(`这份 say.js 和 0.9.1 的原文对不上（${missing.join('、')}），没有改动。`)
  console.error('上游可能已修复 issue #51，先看新版是否已经返回聊天正文；不要再强套本补丁。')
  process.exit(1)
}

writeFileSync(file, next)
console.log(`已打补丁：${file}`)
console.log('现在 /dsh-fish/say 在没有 commit 事件时，也会返回本轮最后一条 assistant 正文。')
