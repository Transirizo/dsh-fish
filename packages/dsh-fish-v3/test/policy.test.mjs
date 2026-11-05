import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POLICY_SECTION, POLICY_TEXT, registerPolicy } from '../lib/policy.js'

test('policy section name is stable', () => {
  assert.equal(POLICY_SECTION, 'dafeyu:policy')
})

test('policy text covers the required dimensions', () => {
  assert.ok(POLICY_TEXT.includes('事实'))
  assert.ok(POLICY_TEXT.includes('记忆'))
  assert.ok(POLICY_TEXT.includes('隐私'))
  assert.ok(POLICY_TEXT.includes('自主行动'))
  assert.ok(POLICY_TEXT.includes('不确定'))
})

test('registerPolicy registers correct name/order/text', () => {
  let registered = null
  const ctx = {
    systemPrompt: {
      getSectionOrder: () => 10200,
      section: (s) => { registered = s; return () => {} },
    },
  }
  const off = registerPolicy(ctx)
  assert.equal(typeof off, 'function')
  assert.equal(registered.name, POLICY_SECTION)
  assert.equal(registered.order, 10199) // DEPLOYMENT_PERSONA_SUFFIX(10200) - 1
  assert.equal(registered.text, POLICY_TEXT)
})
