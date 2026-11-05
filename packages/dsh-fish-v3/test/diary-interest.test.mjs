import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMemory } from '../lib/memory.js'
import { registerTools } from '../lib/tools.js'

async function withTools(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fish-tools-'))
  const memory = createMemory(dir)
  const defs = []
  const ctx = { tools: { register: (d) => { defs.push(d); return () => {} } } }
  registerTools(ctx, { memory, config: {}, dataDir: dir })
  const get = (name) => defs.find((d) => d.name === name)
  try { await fn(memory, get) } finally { await rm(dir, { recursive: true, force: true }) }
}

test('fish_diary write / list / read roundtrip', async () => {
  await withTools(async (_mem, get) => {
    const diary = get('fish_diary')
    const w = await diary.execute({ verb: 'write', text: '今天第一次看海。' })
    assert.equal(w.ok, true)

    const list = await diary.execute({ verb: 'list' })
    assert.equal(list.ok, true)
    assert.ok(list.text.includes('写过这些天'))

    const read = await diary.execute({ verb: 'read' })
    assert.ok(read.text.includes('今天第一次看海。'))
  })
})

test('fish_diary blocks secret text', async () => {
  await withTools(async (_mem, get) => {
    const r = await get('fish_diary').execute({ verb: 'write', text: 'token: abcdefghijklmnop' })
    assert.equal(r.ok, false)
  })
})

test('fish_interest add / list shows hot level', async () => {
  await withTools(async (_mem, get) => {
    const it = get('fish_interest')
    await it.execute({ verb: 'add', topic: '露营' })
    const r = await it.execute({ verb: 'list' })
    assert.equal(r.ok, true)
    assert.ok(r.text.includes('露营'))
    assert.ok(r.text.includes('热'))
  })
})

test('fish_interest empty list', async () => {
  await withTools(async (_mem, get) => {
    const r = await get('fish_interest').execute({ verb: 'list' })
    assert.ok(r.text.includes('还没什么特别上心'))
  })
})
