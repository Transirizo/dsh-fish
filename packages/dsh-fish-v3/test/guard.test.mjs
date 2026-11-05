import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeForeign, looksSecret, redact } from '../lib/guard.js'

test('looksSecret detects common secret shapes', () => {
  assert.ok(looksSecret('sk-abcdefghijklmnopqrstuvwxyz123456'))
  assert.ok(looksSecret('Authorization: Bearer abcdefghijklmnopqrstuvwx'))
  assert.ok(looksSecret('token: "3e927f443e23679e0577428512991e65"'))
  assert.ok(looksSecret('-----BEGIN RSA PRIVATE KEY-----'))
})

test('looksSecret false for ordinary text', () => {
  assert.ok(!looksSecret('今天天气不错，出去走走'))
})

test('sanitizeForeign strips control chars and trims', () => {
  assert.equal(sanitizeForeign('  你好\u0000世界\u0007  '), '你好世界')
})

test('redact masks secrets', () => {
  const out = redact('token: abcdefghijklmnop')
  assert.ok(!/abcdefghijklmnop/.test(out))
  assert.ok(out.includes('[REDACTED]'))
})
