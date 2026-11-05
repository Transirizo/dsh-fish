import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMemory } from '../lib/memory.js'
import { createIngest } from '../lib/ingest.js'
import { createDeliveryGate } from '../lib/delivery.js'
import { createLoop } from '../lib/loop.js'

async function setup(overrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fish-loop-'))
  const memory = createMemory(dir)
  const ingest = createIngest()
  const delivery = createDeliveryGate({ enabled: true, allowlist: overrides.allowlist ?? ['qq-main:group:987654', 'qq-main:private'] })
  const model = overrides.model ?? (async ({ text, sender }) => `回${sender}：${text}`)
  const loop = createLoop({ memory, model, ingest, delivery, allowInbound: overrides.allowInbound })
  return { dir, memory, loop, delivery }
}

const ev = (over = {}) => ({
  account: 'qq-main', eventId: 'ev-1', scope: 'group:987654', sender: '张三',
  ts: Date.now(), contentType: 'text', text: '你好', ...over,
})

test('full loop: process → response → memory write → delivery', async () => {
  const { dir, memory, loop } = await setup()
  const r = await loop.handleInbound(ev())
  assert.equal(r.ok, true)
  assert.equal(r.sessionKey, 'qq-main:group:987654')
  assert.equal(r.delivered, true)
  assert.equal(typeof r.deliveryId, 'string')
  assert.equal(r.response, '回张三：你好')
  assert.equal(await memory.count(), 1)
  await rm(dir, { recursive: true, force: true })
})

test('duplicate eventId is deduped: no second memory write, no second delivery', async () => {
  const { dir, memory, loop } = await setup()
  await loop.handleInbound(ev())
  const r2 = await loop.handleInbound(ev())
  assert.equal(r2.ok, false)
  assert.equal(r2.dup, true)
  assert.equal(await memory.count(), 1)
  await rm(dir, { recursive: true, force: true })
})

test('unauthorized inbound source is rejected and not remembered', async () => {
  const { dir, memory, loop } = await setup({ allowInbound: ['qq-main:private'] })
  const r = await loop.handleInbound(ev({ scope: 'group:987654' }))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'unauthorized-event')
  assert.equal(await memory.count(), 0)
  await rm(dir, { recursive: true, force: true })
})

test('secret-bearing text is blocked before memory', async () => {
  const { dir, memory, loop } = await setup()
  const r = await loop.handleInbound(ev({ text: 'token: abcdefghijklmnop' }))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'blocked-secret')
  assert.equal(await memory.count(), 0)
  await rm(dir, { recursive: true, force: true })
})

test('delivery denied (target not allowed) still records memory but does not deliver', async () => {
  const { dir, memory, loop } = await setup({ allowlist: ['qq-main:private'] })
  const r = await loop.handleInbound(ev({ scope: 'group:987654' }))
  assert.equal(r.ok, true)
  assert.equal(r.delivered, false)
  assert.equal(r.deliveryReason, 'target-not-allowed')
  assert.equal(await memory.count(), 1)
  await rm(dir, { recursive: true, force: true })
})
