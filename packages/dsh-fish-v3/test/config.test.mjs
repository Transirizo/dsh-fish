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

test('rejects unknown groupMode', () => {
  assert.throws(() => Config({ groupMode: 'screaming' }))
})

test('accepts an explicit groupMode', () => {
  const c = Config({ groupMode: 'active' })
  assert.equal(c.groupMode, 'active')
})
