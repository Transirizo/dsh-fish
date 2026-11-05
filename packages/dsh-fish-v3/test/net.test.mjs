import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUrl, isPublicHost, isPublicIp, isSafePublicUrl } from '../lib/net.js'

test('normalizeUrl accepts https and rejects non-http/invalid/credentials', () => {
  assert.equal(normalizeUrl('https://example.com/a').ok, true)
  assert.equal(normalizeUrl('http://example.com').ok, true)
  assert.equal(normalizeUrl('ftp://example.com').error, 'unsupported-protocol')
  assert.equal(normalizeUrl('not a url').error, 'invalid-url')
  assert.equal(normalizeUrl('https://user:pass@example.com').error, 'embedded-credentials')
})

test('isPublicHost rejects loopback/private/link-local/metadata', () => {
  for (const h of ['localhost', 'foo.localhost', 'foo.local', '127.0.0.1', '10.0.0.1',
    '192.168.1.1', '172.16.0.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', 'fc00::1',
    '::ffff:10.0.0.1', 'metadata.google.internal']) {
    assert.equal(isPublicHost(h), false, `should block ${h}`)
  }
})

test('isPublicHost accepts public literals and hostnames', () => {
  for (const h of ['8.8.8.8', '93.184.216.34', 'example.com', '2606:4700::1111']) {
    assert.equal(isPublicHost(h), true, `should allow ${h}`)
  }
})

test('isPublicIp rejects private and accepts public', () => {
  assert.equal(isPublicIp('10.1.2.3'), false)
  assert.equal(isPublicIp('8.8.8.8'), true)
  assert.equal(isPublicIp('::1'), false)
  assert.equal(isPublicIp('2606:4700::1111'), true)
})

test('isSafePublicUrl is the one-step gate', () => {
  assert.equal(isSafePublicUrl('https://example.com').ok, true)
  assert.equal(isSafePublicUrl('https://127.0.0.1').error, 'non-public-host')
  assert.equal(isSafePublicUrl('https://169.254.169.254/latest/meta-data').error, 'non-public-host')
})
