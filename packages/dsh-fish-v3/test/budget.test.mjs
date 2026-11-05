import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBudget } from '../lib/budget.js'

test('concurrency limit blocks excess in-flight slots', () => {
  const b = createBudget({ maxConcurrent: 2 })
  const a = b.acquire()
  const c = b.acquire()
  const d = b.acquire()
  assert.equal(a.ok, true)
  assert.equal(c.ok, true)
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'concurrency')
  a.release()
  assert.equal(b.acquire().ok, true)
})

test('quota limit blocks beyond window cap', () => {
  const b = createBudget({ maxQueriesPerWindow: 2, windowMs: 60000, maxConcurrent: 0 })
  assert.equal(b.acquire().ok, true)
  assert.equal(b.acquire().ok, true)
  const third = b.acquire()
  assert.equal(third.ok, false)
  assert.equal(third.reason, 'quota')
})

test('release frees a slot exactly once', () => {
  const b = createBudget({ maxConcurrent: 1 })
  const a = b.acquire()
  assert.equal(b.acquire().ok, false)
  a.release()
  a.release() // 二次释放无副作用
  assert.equal(b.acquire().ok, true)
})

test('stats reflect state', () => {
  const b = createBudget({ maxConcurrent: 1 })
  b.acquire()
  assert.equal(b.stats().active, 1)
  assert.equal(b.stats().limits.maxConcurrent, 1)
})
