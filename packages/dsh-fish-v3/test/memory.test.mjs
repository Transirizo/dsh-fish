import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMemory, tokensOf } from '../lib/memory.js'

async function withMemory(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fish-mem-'))
  const mem = createMemory(dir)
  try { await fn(mem, dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

test('append / count / recall roundtrip', async () => {
  await withMemory(async (mem) => {
    await mem.append({ type: 'fact', scope: 'global', text: '张三喜欢喝美式咖啡' })
    await mem.append({ type: 'event', scope: 'group:abc', text: '上周群里讨论过露营' })
    assert.equal(await mem.count(), 2)
    const rows = await mem.recall('咖啡')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].text, '张三喜欢喝美式咖啡')
  })
})

test('recall is limited', async () => {
  await withMemory(async (mem) => {
    for (let i = 0; i < 5; i++) await mem.append({ type: 'fact', text: `共同话题 ${i}` })
    const rows = await mem.recall('共同话题', { limit: 2 })
    assert.equal(rows.length, 2)
  })
})

test('append rejects empty text', async () => {
  await withMemory(async (mem) => {
    await assert.rejects(() => mem.append({ text: '' }))
  })
})

test('tokensOf builds chinese bigrams', () => {
  const t = tokensOf('露营计划')
  assert.ok(t.includes('露营'))
  assert.ok(t.includes('营计'))
  assert.ok(t.includes('计划'))
})

test('recall respects scope isolation (global visible, cross-scope hidden)', async () => {
  await withMemory(async (mem) => {
    await mem.append({ type: 'fact', scope: 'global', text: '共同喜欢的咖啡' })
    await mem.append({ type: 'fact', scope: 'group:abc', text: '群里说过露营咖啡' })
    await mem.append({ type: 'fact', scope: 'private', text: '私聊说过的咖啡' })

    const groupTexts = (await mem.recall('咖啡', { scope: 'group:abc' })).map((r) => r.text)
    assert.ok(groupTexts.includes('共同喜欢的咖啡')) // global 可见
    assert.ok(groupTexts.includes('群里说过露营咖啡')) // 本 group 可见
    assert.ok(!groupTexts.includes('私聊说过的咖啡')) // private 隔离

    const privTexts = (await mem.recall('咖啡', { scope: 'private' })).map((r) => r.text)
    assert.ok(privTexts.includes('私聊说过的咖啡'))
    assert.ok(!privTexts.includes('群里说过露营咖啡')) // 别的 group 隔离
  })
})
