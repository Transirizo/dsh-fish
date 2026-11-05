import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMemory } from '../lib/memory.js'
import { reflect, formatReflection } from '../lib/reflect.js'
import { startHeartbeat } from '../lib/heartbeat.js'

async function withMemory(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fish-reflect-'))
  const memory = createMemory(dir)
  try { await fn(memory) } finally { await rm(dir, { recursive: true, force: true }) }
}

test('reflect summarizes counts and interest heat', async () => {
  await withMemory(async (memory) => {
    await memory.append({ type: 'fact', text: '张三喜欢美式咖啡' })
    await memory.append({ type: 'interest', text: '露营' })
    await memory.append({ type: 'interest', text: '旧兴趣', ts: Date.now() - 40 * 86400000 })
    await memory.append({ type: 'question', text: '人为什么要睡觉' })
    const r = await reflect(memory, { now: Date.now() })
    assert.equal(r.counts.fact, 1)
    assert.equal(r.counts.interest, 2)
    assert.ok(r.hot.includes('露营'))
    assert.ok(r.faded.includes('旧兴趣'))
    assert.deepEqual(r.openQuestions, ['人为什么要睡觉'])
  })
})

test('formatReflection produces readable text', async () => {
  await withMemory(async (memory) => {
    await memory.append({ type: 'fact', text: 'a' })
    const r = await reflect(memory)
    const text = formatReflection(r)
    assert.ok(text.includes('事实 1 条'))
    assert.ok(text.includes('整理'))
  })
})

test('heartbeat disabled by default is a noop', () => {
  const off = startHeartbeat({ get: () => undefined }, { enabled: false })
  assert.equal(typeof off, 'function')
})

test('heartbeat runs reflection and appends a reflection record', async () => {
  await withMemory(async (memory) => {
    await memory.append({ type: 'fact', text: 'x' })
    let tick = null
    const ctx = { get: () => ({ interval(cb) { tick = cb; return () => {} } }) }
    startHeartbeat(ctx, { memory, enabled: true, intervalMs: 1000 })
    assert.equal(typeof tick, 'function')
    await tick() // 手动触发一次
    const refs = await memory.listByType('reflection')
    assert.equal(refs.length, 1)
    assert.ok(refs[0].text.includes('事实 1 条'))
  })
})
