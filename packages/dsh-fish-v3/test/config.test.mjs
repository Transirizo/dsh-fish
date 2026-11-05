import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, GROUP_MODES } from '../lib/config.js'

test('GROUP_MODES is the three modes', () => {
  assert.deepEqual(GROUP_MODES, ['quiet', 'balanced', 'active'])
})

test('defaults: real sending and proactive are OFF', () => {
  const c = Config({})
  assert.equal(c.sendingEnabled, false)
  assert.equal(c.proactiveEnabled, false)
  assert.equal(c.groupMode, 'balanced')
  assert.equal(c.memoryRetentionDays, 0)
  assert.equal(c.memoryMaxRecords, 10000)
})

test('network budgets and sending policy have safe defaults', () => {
  const c = Config({})
  assert.deepEqual(c.sendingAllowlist, [])
  assert.equal(c.sendingDailyLimit, 0)
  assert.equal(c.netMaxQueriesPerHour, 30)
  assert.equal(c.netMaxConcurrent, 2)
  assert.equal(c.netMaxBytes, 512000)
  assert.equal(c.netTimeoutMs, 15000)
  assert.equal(c.biliEnabled, false)
  assert.equal(c.logLevel, 'info')
})

test('rejects unknown groupMode', () => {
  assert.throws(() => Config({ groupMode: 'screaming' }))
})

test('rejects unknown logLevel', () => {
  assert.throws(() => Config({ logLevel: 'loud' }))
})

test('accepts an explicit groupMode', () => {
  const c = Config({ groupMode: 'active' })
  assert.equal(c.groupMode, 'active')
})
