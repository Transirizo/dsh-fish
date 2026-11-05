import { test } from 'node:test'
import assert from 'node:assert/strict'
import { browse } from '../lib/browse.js'
import { createBudget } from '../lib/budget.js'

function bodyOf(str) {
  const enc = new TextEncoder()
  return new ReadableStream({ start(c) { c.enqueue(enc.encode(str)); c.close() } })
}

function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k] ?? null },
    body: body === null ? null : bodyOf(body),
  }
}

const unbudgeted = () => createBudget({ maxConcurrent: 0 })

test('browse returns text + provenance', async () => {
  const fetchFn = async () => response(200, '<html>你好世界</html>', { 'content-type': 'text/html' })
  const r = await browse('https://example.com/page', { fetchFn, budget: unbudgeted() })
  assert.equal(r.ok, true)
  assert.equal(r.url, 'https://example.com/page')
  assert.ok(r.text.includes('你好世界'))
  assert.equal(typeof r.retrievedAt, 'number')
})

test('browse rejects non-public URL before any fetch', async () => {
  let called = false
  const fetchFn = async () => { called = true; return response(200, 'x') }
  const r = await browse('https://127.0.0.1/x', { fetchFn, budget: unbudgeted() })
  assert.equal(r.ok, false)
  assert.equal(r.error, 'non-public-host')
  assert.equal(called, false)
})

test('browse follows redirect and re-validates each hop', async () => {
  const fetchFn = async (url) => {
    if (url === 'https://example.com/a') return response(302, '', { location: 'http://169.254.169.254/latest' })
    return response(200, 'never')
  }
  const r = await browse('https://example.com/a', { fetchFn, budget: unbudgeted() })
  assert.equal(r.ok, false)
  assert.equal(r.error, 'redirect:non-public-host')
})

test('browse enforces budget quota', async () => {
  const b = createBudget({ maxQueriesPerWindow: 1, windowMs: 60000, maxConcurrent: 0 })
  const fetchFn = async () => response(200, 'ok')
  assert.equal((await browse('https://example.com', { fetchFn, budget: b })).ok, true)
  const second = await browse('https://example.com', { fetchFn, budget: b })
  assert.equal(second.ok, false)
  assert.equal(second.error, 'budget:quota')
})
