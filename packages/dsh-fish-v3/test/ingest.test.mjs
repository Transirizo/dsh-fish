import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEvent, sessionKey, createIngest } from '../lib/ingest.js'

const valid = () => ({
  account: 'qq-main',
  eventId: 'ev-1',
  scope: 'group:987654',
  sender: '张三',
  ts: Date.now(),
  contentType: 'text',
  text: '你好',
})

test('sessionKey derives from account + scope', () => {
  assert.equal(sessionKey('qq-main', 'group:987654'), 'qq-main:group:987654')
  assert.equal(sessionKey('qq-main', 'private'), 'qq-main:private')
  assert.equal(sessionKey('qq-main'), 'qq-main:private') // 缺省 private
})

test('normalizeEvent accepts a valid event', () => {
  const r = normalizeEvent(valid())
  assert.equal(r.ok, true)
  assert.equal(r.event.scope, 'group:987654')
  assert.equal(r.event.sender, '张三')
})

test('normalizeEvent rejects missing fields', () => {
  for (const f of ['account', 'eventId', 'scope', 'sender', 'ts', 'contentType']) {
    const raw = valid()
    delete raw[f]
    const r = normalizeEvent(raw)
    assert.equal(r.ok, false)
    assert.ok(r.error.includes(f))
  }
})

test('normalizeEvent rejects unsupported contentType', () => {
  const r = normalizeEvent({ ...valid(), contentType: 'video' })
  assert.equal(r.ok, false)
})

test('createIngest dedups the same eventId', () => {
  const ing = createIngest()
  const a = ing.accept(valid())
  const b = ing.accept(valid()) // 同一 eventId
  assert.equal(a.ok, true)
  assert.equal(b.ok, false)
  assert.equal(b.dup, true)
  assert.equal(a.sessionKey, 'qq-main:group:987654')
})

test('createIngest accepts distinct eventIds to the same session', () => {
  const ing = createIngest()
  assert.equal(ing.accept(valid()).ok, true)
  assert.equal(ing.accept({ ...valid(), eventId: 'ev-2' }).ok, true)
})
