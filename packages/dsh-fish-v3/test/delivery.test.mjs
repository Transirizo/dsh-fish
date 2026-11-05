import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeliveryGate } from '../lib/delivery.js'

test('default gate is disabled → deny', () => {
  const g = createDeliveryGate()
  assert.deepEqual(g.authorize({ target: 'x', category: 'reply' }), { allowed: false, reason: 'sending-disabled' })
})

test('stop switch wins over enabled', () => {
  const g = createDeliveryGate({ enabled: true })
  g.stop()
  assert.equal(g.authorize({ target: 'x' }).reason, 'stop-switch')
  g.resume()
  assert.equal(g.authorize({ target: 'x' }).allowed, true)
})

test('allowlist denies non-listed target', () => {
  const g = createDeliveryGate({ enabled: true, allowlist: ['group:1'] })
  assert.equal(g.authorize({ target: 'group:2' }).reason, 'target-not-allowed')
  assert.equal(g.authorize({ target: 'group:1' }).allowed, true)
})

test('category not allowed is denied', () => {
  const g = createDeliveryGate({ enabled: true, categories: ['reply'] })
  assert.equal(g.authorize({ target: 'x', category: 'proactive' }).reason, 'category-not-allowed:proactive')
})

test('cooldown blocks a second send within window', () => {
  const g = createDeliveryGate({ enabled: true, cooldownMs: 1000 })
  assert.equal(g.authorize({ target: 'x' }).allowed, true)
  assert.equal(g.authorize({ target: 'x' }).reason, 'cooldown')
})

test('daily limit blocks beyond cap', () => {
  const g = createDeliveryGate({ enabled: true, dailyLimit: 2 })
  assert.equal(g.authorize({ target: 'a' }).allowed, true)
  assert.equal(g.authorize({ target: 'b' }).allowed, true)
  assert.equal(g.authorize({ target: 'c' }).reason, 'daily-limit')
})

test('audit records every decision', () => {
  const g = createDeliveryGate()
  g.authorize({ target: 'x' })
  assert.equal(g.audit().length, 1)
  assert.equal(g.audit()[0].allowed, false)
})
