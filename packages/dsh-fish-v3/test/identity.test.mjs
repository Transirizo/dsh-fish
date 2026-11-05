import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDENTITY_SECTION, IDENTITY_TEXT, registerIdentity } from '../lib/identity.js'

test('identity section name is stable', () => {
  assert.equal(IDENTITY_SECTION, 'dafeyu:identity')
})

test('identity text carries the stable anchors', () => {
  assert.ok(IDENTITY_TEXT.includes('大肥鱼'))
  assert.ok(IDENTITY_TEXT.includes('不假装成人类'))
  assert.ok(IDENTITY_TEXT.includes('不编造真实经历'))
  assert.ok(IDENTITY_TEXT.includes('保持沉默'))
})

test('registerIdentity registers correct name/order/text', () => {
  let registered = null
  const ctx = {
    systemPrompt: {
      getSectionOrder: () => 0,
      section: (s) => { registered = s; return () => {} },
    },
  }
  const off = registerIdentity(ctx)
  assert.equal(typeof off, 'function')
  assert.equal(registered.name, IDENTITY_SECTION)
  assert.equal(registered.order, 1) // DEPLOYMENT_PERSONA_PREFIX(0) + 1
  assert.equal(registered.text, IDENTITY_TEXT)
})
