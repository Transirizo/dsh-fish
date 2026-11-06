#!/usr/bin/env node
/**
 * patch-dsh-fish-say.mjs —— 给上游 @ssamurias/dsh-fish 0.9.1 的 lib/say.js 打补丁。
 *
 * 背景：0.9.1 的 `/dsh-fish/say` 只把 `growth_commit` 类事件放进 `herReply`；
 * 普通聊天正文（assistant/message）不进事件流，外部桥会收到「她这次没说话」。
 * 上游 issue #51（2026-11-06 仍开着）。补丁把本轮最后一条 assistant/message
 * 的正文接进来。
 *
 * 第二版（2026-11-06 晚）：第一版是 `committed || 正文`——她只要顺手 commit 一句，
 * QQ 那边就只收到那句私下记下的话，看不到她真正回的那一段（用户实测：
 * DSH 里是一整段回复，QQ 只收到"推给我的四条，我一条都没点进去……"）。
 * 现在反过来：**正文优先，commit 只在没有正文时兜底**。
 *
 * 幂等：已是最新版就跳过；认得出第一版补丁会就地升级；只认 0.9.1 的原文，
 * 上游改版后应优先看新版是否已修 #51，而不是硬套（匹配不到会非零退出）。
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

// 两版补丁的 herReply 行。第一版的顺序会把她私下 commit 的话顶到 QQ 上。
const V1_ORDER = `const herReply = committed || String(turnWait.text?.() ?? '').trim()`
const V2_ORDER = `const herReply = String(turnWait.text?.() ?? '').trim() || committed`

// 旧补丁留下的两处注释，升级时一起换掉，免得两条路径产出的文件不一致。
const V1_COMMENT_A = `  // issue #51：本轮最后一条 assistant/message 的正文，作为 herReply 的兜底`
const V2_COMMENT_A = `  // issue #51：本轮最后一条 assistant/message 的正文，作为 herReply 的正文来源`
const V1_COMMENT_B = `    // issue #51：她正常聊天写下的正文不在事件流里；没有 commit 的话就用本轮正文。`
const V2_COMMENT_B = `    // issue #51：她正常聊天写下的正文不在事件流里。
    // 正文优先：她若顺手 commit 了一句，那句话是她写给自己看的，不是回给他的。`

if (source.includes(V2_ORDER)) {
  console.log(`已是最新补丁，跳过：${file}`)
  process.exit(0)
}

if (source.includes(V1_ORDER)) {
  const upgraded = source
    .replace(V1_ORDER, V2_ORDER)
    .replace(V1_COMMENT_A, V2_COMMENT_A)
    .replace(V1_COMMENT_B, V2_COMMENT_B)
  writeFileSync(file, upgraded)
  console.log(`已把第一版补丁升级成第二版（commit 优先 → 正文优先）：${file}`)
  console.log('重启 DSH 后生效：QQ 会收到她真正回的那段，而不是她私下 commit 的那句。')
  process.exit(0)
}

if (source.includes('turnWait.text?.()')) {
  console.error(`这份 say.js 里有 turnWait.text，但不是本脚本认识的两版之一，没有改动。`)
  process.exit(1)
}

const replacements = [
  {
    name: 'beginTurnWait 收集正文',
    from: `  let settle = () => {}
  const promise = new Promise((resolve) => { settle = resolve })`,
    to: `  let settle = () => {}
  // issue #51：本轮最后一条 assistant/message 的正文，作为 herReply 的正文来源
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
    // issue #51：她正常聊天写下的正文不在事件流里。
    // 正文优先：她若顺手 commit 了一句，那句话是她写给自己看的，不是回给他的。
    const herReply = String(turnWait.text?.() ?? '').trim() || committed`,
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
console.log('现在 /dsh-fish/say 会返回她这一轮的聊天正文（优先），没有正文时才用 commit 的事件。')
