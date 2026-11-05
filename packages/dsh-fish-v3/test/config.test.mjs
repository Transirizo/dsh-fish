import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, GROUP_MODES, read } from '../lib/config.js'

test('GROUP_MODES is the three modes', () => {
  assert.deepEqual(GROUP_MODES, ['quiet', 'balanced', 'active'])
})

test('defaults: real sending and proactive are OFF', () => {
  const c = Config({})
  assert.equal(read(c, 'sendingEnabled', true), false)
  assert.equal(read(c, 'proactiveEnabled', true), false)
  assert.equal(read(c, 'groupMode', ''), 'balanced')
  assert.equal(read(c, 'memoryRetentionDays', -1), 0)
  assert.equal(read(c, 'memoryMaxRecords', -1), 10000)
})

test('network budgets and sending policy have safe defaults', () => {
  const c = Config({})
  assert.deepEqual(read(c, 'sendingAllowlist', null), [])
  assert.equal(read(c, 'sendingDailyLimit', -1), 0)
  assert.equal(read(c, 'netMaxQueriesPerHour', -1), 30)
  assert.equal(read(c, 'netMaxConcurrent', -1), 2)
  assert.equal(read(c, 'netMaxBytes', -1), 512000)
  assert.equal(read(c, 'netTimeoutMs', -1), 15000)
  assert.equal(read(c, 'biliEnabled', true), false)
  assert.equal(read(c, 'logLevel', ''), 'info')
})

test('rejects unknown groupMode', () => {
  assert.throws(() => Config({ groupMode: 'screaming' }))
})

test('rejects unknown logLevel', () => {
  assert.throws(() => Config({ logLevel: 'loud' }))
})

test('accepts an explicit groupMode', () => {
  const c = Config({ groupMode: 'active' })
  assert.equal(read(c, 'groupMode', ''), 'active')
})

test('read() falls back on plain objects and volatile wrappers', () => {
  assert.equal(read({}, 'x', 1), 1)
  assert.equal(read({ x: 5 }, 'x', 1), 5)
  const v = { get: () => 'live' }
  assert.equal(read({ x: v }, 'x', 1), 'live')
})
