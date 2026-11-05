import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, createParticipation, signalFromText, MODES } from '../lib/participation.js'

test('MODES is quiet/balanced/active', () => {
  assert.deepEqual(MODES, ['quiet', 'balanced', 'active'])
})

test('mention or direct question always replies in any mode', () => {
  assert.equal(decide({ mentioned: true }, 'quiet').shouldReply, true)
  assert.equal(decide({ directQuestion: true }, 'quiet').shouldReply, true)
})

test('quiet mode only replies when relevant', () => {
  assert.equal(decide({}, 'quiet').shouldReply, false)
  assert.equal(decide({ relevant: true }, 'quiet').shouldReply, true)
})

test('balanced mode replies when relevant, not otherwise', () => {
  assert.equal(decide({ relevant: true }, 'balanced').shouldReply, true)
  assert.equal(decide({}, 'balanced').shouldReply, false)
})

test('active mode replies on relevant or high activity', () => {
  assert.equal(decide({ activityHigh: true }, 'active').shouldReply, true)
  assert.equal(decide({}, 'active').shouldReply, false)
})

test('recently-ignored suppresses non-mention replies until engaged again', () => {
  const p = createParticipation('balanced')
  p.markIgnored()
  assert.equal(p.decide({ relevant: true }).shouldReply, false)
  assert.equal(p.decide({ mentioned: true }).shouldReply, true) // 点名打破
  p.markEngaged()
  assert.equal(p.decide({ relevant: true }).shouldReply, true)
})

test('signalFromText detects mention and question', () => {
  assert.deepEqual(signalFromText('大肥鱼在吗？'), { mentioned: true, directQuestion: true, relevant: true })
  assert.deepEqual(signalFromText('今天天气不错啊'), { mentioned: false, directQuestion: false, relevant: false })
})
