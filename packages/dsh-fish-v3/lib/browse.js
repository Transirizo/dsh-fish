/**
 * browse.js —— 受限抓取编排（规格 §5）。
 *
 * 顺序：URL 静态校验（SSRF）→ 预算 acquire → 逐跳 fetch（redirect:manual，每跳重校验）
 *      → 体积限制读取 → 释放预算。来源与抓取时间一并返回（provenance）。
 *
 * fetch 由调用方注入（默认 globalThis.fetch）；真实部署应换成受限抓取代理，
 * 并把「DNS 解析后二次校验绑定地址」落到代理/宿主 web 服务（此处为纯逻辑）。
 */
import { isSafePublicUrl } from './net.js'

export async function browse(rawUrl, opts = {}) {
  const fetchFn = opts.fetchFn
  if (typeof fetchFn !== 'function') return { ok: false, error: 'restricted-fetch-unavailable' }
  const budget = opts.budget
  const maxBytes = Number(opts.maxBytes ?? 512000)
  const maxRedirects = Number(opts.maxRedirects ?? 5)
  const timeoutMs = Number(opts.timeoutMs ?? 15000)

  const v = isSafePublicUrl(rawUrl)
  if (!v.ok) return { ok: false, error: v.error }

  let slot = null
  if (budget) {
    slot = budget.acquire()
    if (!slot.ok) return { ok: false, error: `budget:${slot.reason}` }
  }

  try {
    let url = v.url
    const seen = new Set()
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const key = url.toString()
      if (seen.has(key)) return { ok: false, error: 'redirect-loop' }
      seen.add(key)

      // 每跳都重校验（重定向目标也必须公网）
      const rv = isSafePublicUrl(key)
      if (!rv.ok) return { ok: false, error: `redirect:${rv.error}` }

      const res = await fetchFn(key, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return { ok: false, error: 'redirect-no-location' }
        url = new URL(loc, url)
        continue
      }
      if (!res.ok) return { ok: false, error: `http-${res.status}` }

      const contentType = res.headers.get('content-type') ?? ''
      const text = await readLimited(res, maxBytes)
      return {
        ok: true,
        url: url.toString(),
        contentType,
        bytes: text.length,
        text: text.slice(0, 200000),
        retrievedAt: Date.now(),
      }
    }
    return { ok: false, error: 'too-many-redirects' }
  } finally {
    slot?.release?.()
  }
}

/** 从 Response 读 body，硬截断到 maxBytes，读够就 cancel。 */
async function readLimited(res, maxBytes) {
  const reader = res.body?.getReader?.()
  if (!reader) return ''
  const chunks = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > maxBytes) {
        chunks.push(value.slice(0, value.length - (total - maxBytes)))
        break
      }
      chunks.push(value)
    }
    reader.cancel?.().catch?.(() => {})
  } catch { /* 流中断不致命 */ }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}
