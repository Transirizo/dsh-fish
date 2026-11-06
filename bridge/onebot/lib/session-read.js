/**
 * session-read.js —— 从 DSH 会话文件里取她这一轮真正说出口的话。
 *
 * 为什么需要这个兜底（2026-11-06）：
 *   上游 dsh-fish 0.9.1 的 `/dsh-fish/say` 只把 `growth_commit` 类事件放进
 *   `said` / `herReply`；她正常聊天写下的 `assistant/message` 不进事件流，
 *   所以接口会回「她这次没说话」，而会话里其实有回复（上游 issue #51，仍开着）。
 *   桥要能对话，就得在她「没 commit」时读一眼会话落盘。
 *
 * 这是**兜底**，不是主路径：上游修好之后把 `FISH_DSH_REPLY=api` 就能关掉。
 * 读的是宿主内部格式（session.v*.jsonl.zstd），只读、不写、不碰锁。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import zlib from 'node:zlib'

const SESSION_RE = /^session\.v\d+\.jsonl(\.zstd)?$/
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/** 解压一个会话文件；认不出格式/解不开返回空串，绝不抛。 */
export function readSessionText(file, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  try {
    const st = statSync(file)
    if (!st.isFile() || st.size > maxBytes) return ''
    const buf = readFileSync(file)
    if (file.endsWith('.zstd')) {
      const decode = zlib.zstdDecompressSync
      return typeof decode === 'function' ? decode(buf).toString('utf8') : ''
    }
    return buf.toString('utf8')
  } catch {
    return ''
  }
}

/**
 * 在会话 JSONL 里找 `since` 之后最后一条有正文的 `assistant/message`。
 * 纯函数，行坏掉就跳过。
 */
export function lastAssistantText(text, { since = 0 } = {}) {
  let out = ''
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev?.type !== 'assistant/message') continue
    const t = Number(ev.time)
    if (Number.isFinite(t) && t < since) continue
    const content = ev?.data?.message?.content
    if (!Array.isArray(content)) continue
    let one = ''
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') one += block.text
    }
    if (one.trim()) out = one
  }
  return out
}

/**
 * 找到某个 sessionId 的会话文件。DSH 按 cwd 分目录：sessions/<encoded-cwd>/<sessionId>/。
 * 同一个 sessionId 理论上只有一份；有多份时取最新修改的那份。
 */
export function findSessionFile(sessionsDir, sessionId) {
  const id = String(sessionId ?? '').trim()
  if (!id || /[\\/]/.test(id)) return ''
  let best = ''
  let bestAt = -1
  try {
    for (const dir of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const candidateDir = join(sessionsDir, dir.name, id)
      let files = []
      try { files = readdirSync(candidateDir) } catch { continue }
      for (const name of files) {
        if (!SESSION_RE.test(name)) continue
        const file = join(candidateDir, name)
        try {
          const at = statSync(file).mtimeMs
          if (at > bestAt) { bestAt = at; best = file }
        } catch { /* 读不到就当没有 */ }
      }
    }
  } catch {
    return ''
  }
  return best
}

/**
 * 会话回话读取器。
 *
 * `waitForReply` 会短轮询：`/say` 返回时宿主可能还没把最后一条消息 flush 到磁盘。
 * 默认 2.5 秒、每 250ms 看一眼；仍没有就返回空串（调用方按「她没说话」处理）。
 */
export function createSessionReader({ sessionsDir, maxBytes = DEFAULT_MAX_BYTES, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const dir = String(sessionsDir ?? '').trim()
  return {
    enabled: Boolean(dir),
    dir,
    async readReply({ sessionId, since = 0 } = {}) {
      if (!dir) return ''
      const file = findSessionFile(dir, sessionId)
      if (!file) return ''
      return lastAssistantText(readSessionText(file, { maxBytes }), { since })
    },
    async waitForReply({ sessionId, since = 0, timeoutMs = 2500, pollMs = 250 } = {}) {
      if (!dir) return ''
      const end = Date.now() + Math.max(0, timeoutMs)
      for (;;) {
        const text = await this.readReply({ sessionId, since })
        if (text.trim()) return text
        if (Date.now() >= end) {
          log(`会话里没有读到 ${sessionId} 的新回复（${dir}）`)
          return ''
        }
        await sleep(pollMs)
      }
    },
  }
}
