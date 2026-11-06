import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'
import zlib from 'node:zlib'
import {
  cookieName, readBrowserSessionSecret, decodeSecret, mintCookie, createDshAuth, defaultCredentialsFile,
} from '../lib/dsh-auth.js'
import { createDshFishProtocol, protocolFromUrl, detectProtocol } from '../lib/protocols.js'
import { lastAssistantText, findSessionFile, createSessionReader } from '../lib/session-read.js'
import { createBridge } from '../lib/bridge.js'

const b64url = (b) => Buffer.from(b).toString('base64url')
const SECRET = b64url(randomBytes(32))

const groupEv = (over = {}) => ({ post_type: 'message', message_type: 'group', message_id: 77, group_id: 555, group_name: '摸鱼群', user_id: 222, sender: { card: '张三' }, message: [{ type: 'at', data: { qq: '10000' } }, { type: 'text', data: { text: '你好' } }], ...over })
const privEv = (over = {}) => ({ post_type: 'message', message_type: 'private', message_id: 88, user_id: 333, sender: { nickname: '李四' }, message: [{ type: 'text', data: { text: '在吗' } }], ...over })

test('dsh-auth：从凭据文件读到 browser-session 密钥，读不到返回空串', () => {
  const yaml = [
    'version: 1',
    'refs:',
    '  DSH_FISH_INGRESS_TOKEN: abc',
    'records:',
    '  client-connection/browser-session:',
    '    kind: grant',
    '    payload:',
    '      version: 1',
    `      secret: ${SECRET}`,
    '',
  ].join('\n')
  assert.equal(readBrowserSessionSecret(yaml), SECRET)
  assert.equal(readBrowserSessionSecret('version: 1\nrefs: {}\n'), '')
  assert.equal(readBrowserSessionSecret(''), '')
  assert.equal(decodeSecret(SECRET).length, 32)
  assert.equal(decodeSecret('short'), null)
})

test('dsh-auth：mintCookie 与宿主算法一致（名字 + v1 HMAC + authority）', () => {
  const authority = '127.0.0.1:3080'
  const now = 1_700_000_000_000
  const { cookie, expiresAt } = mintCookie(SECRET, authority, { now, ttlMs: 1000 })
  const name = cookieName(authority)
  assert.ok(cookie.startsWith(name + '=v1.'))
  const value = cookie.slice(name.length + 1)
  const [v, body, sig] = value.split('.')
  assert.equal(v, 'v1')
  const key = Buffer.from(SECRET, 'base64url')
  assert.equal(sig, createHmac('sha256', key).update(body).digest().toString('base64url'))
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  assert.deepEqual(payload, { version: 1, authority, issuedAt: now, expiresAt: expiresAt })
})

test('dsh-auth：能从凭据文件读密钥并铸 cookie', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-auth-'))
  const file = join(dir, '.credentials.yaml')
  writeFileSync(file, ['version: 1', 'records:', '  client-connection/browser-session:', '    kind: grant', '    payload:', '      version: 1', `      secret: ${SECRET}`, ''].join('\n'))
  const a = createDshAuth({ authority: 'dsh:3080', credentialsFile: file })
  assert.match(a.header(), /^dsh-auth-[A-Za-z0-9_-]+=v1\./)
  assert.match(a.describe(), /fish-auth-|credentials/)
})

test('protocols：detectProtocol 先探 v3 health，再探 whoami，最后回落 v3', async () => {
  const onlyV3 = async (url) => ({ ok: url.endsWith('/dsh-fish-v3/health') })
  assert.equal(await detectProtocol({ sayUrl: 'http://x/say', fetchFn: onlyV3 }), 'v3')
  const onlyFish = async (url, init) => ({ ok: url.endsWith('/dsh-fish/whoami') && Boolean(init?.headers?.cookie) })
  assert.equal(await detectProtocol({ sayUrl: 'http://x/say', authHeader: 'c=1', fetchFn: onlyFish }), 'dsh-fish')
  const none = async () => ({ ok: false })
  assert.equal(await detectProtocol({ sayUrl: 'http://x/say', fetchFn: none }), 'v3')
})

test('dsh-auth：显式 secret / cookie 优先，缺凭据时 header 为空且有说明', () => {
  const a = createDshAuth({ authority: 'dsh:3080', secret: SECRET })
  assert.match(a.header(), /^dsh-auth-[A-Za-z0-9_-]+=v1\./)
  const b = createDshAuth({ authority: 'dsh:3080', cookie: 'dsh-auth-x=v1.a.b' })
  assert.equal(b.header(), 'dsh-auth-x=v1.a.b')
  const c = createDshAuth({ authority: 'dsh:3080' })
  assert.equal(c.header(), '')
  assert.match(c.describe(), /没有可用|未配置/)
  assert.equal(defaultCredentialsFile({ FISH_DSH_HOME: '/dsh-home' }), '/dsh-home/.credentials.yaml')
})

test('protocols：URL 能认出两种协议', () => {
  assert.equal(protocolFromUrl('http://127.0.0.1:3080/dsh-fish-v3/say'), 'v3')
  assert.equal(protocolFromUrl('http://127.0.0.1:3080/dsh-fish/say'), 'dsh-fish')
  assert.equal(protocolFromUrl('http://127.0.0.1:3080/say'), '')
  assert.equal(protocolFromUrl('not a url'), '')
})

function protocolWith(authHeader = 'dsh-auth-x=v1.a.b', extra = {}) {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return { status: 200, ok: true, json: async () => extra.response ?? { ok: true, herReply: '好' } }
  }
  const p = createDshFishProtocol({
    sayUrl: 'http://dsh:3080/dsh-fish/say',
    auth: { header: () => authHeader, describe: () => 'test' },
    ownerId: '999',
    ...extra,
    fetchFn,
  })
  return { p, calls }
}

test('dsh-fish 协议：群聊 / 主人私聊 / 外客私聊的入参映射', async () => {
  const { p, calls } = protocolWith()

  await p.say({ target: { scene: 'group', id: '555' }, eventId: '77', userId: '222', sender: '张三', text: '你好', mentioned: true, groupName: '摸鱼群' })
  await p.say({ target: { scene: 'private', id: '999' }, eventId: '88', userId: '999', sender: '主人', text: '在吗', mentioned: false, groupName: '' })
  await p.say({ target: { scene: 'private', id: '333' }, eventId: '89', userId: '333', sender: '群友', text: '私聊', mentioned: false, groupName: '' })

  const [g, owner, guest] = calls.map((c) => c.body)
  assert.deepEqual(g, { text: '你好', scene: 'group', channel: 'qq-group:555', speaker: '张三', room: 'channel', title: '摸鱼群' })
  assert.deepEqual(owner, { text: '在吗', scene: 'private', channel: 'qq:999', speaker: '主人', room: 'house' })
  assert.deepEqual(guest, { text: '私聊', scene: 'private', channel: 'qq:dm:333', speaker: '群友', room: 'channel', guest: true })
  assert.equal(calls[0].headers.cookie, 'dsh-auth-x=v1.a.b')
})

test('dsh-fish 协议：herReply / said / 会话兜底三条回话路径', async () => {
  const a = protocolWith(undefined, { response: { ok: true, herReply: '她说的' } })
  assert.equal((await a.p.say({ target: { scene: 'private', id: '1' }, userId: '1', sender: 's', text: 't' })).reply, '她说的')

  const b = protocolWith(undefined, { response: { ok: true, said: [{ text: '一' }, { text: '二' }] } })
  assert.equal((await b.p.say({ target: { scene: 'private', id: '1' }, userId: '1', sender: 's', text: 't' })).reply, '一\n\n二')

  const readerCalls = []
  const c = protocolWith(undefined, {
    response: { ok: true, herReply: '', said: [], sessionId: 'session-1', note: '她这次没说话。' },
    sessionReader: { enabled: true, waitForReply: async (x) => { readerCalls.push(x); return '从会话里读到的' } },
  })
  const r = await c.p.say({ target: { scene: 'private', id: '1' }, userId: '1', sender: 's', text: 't' })
  assert.equal(r.reply, '从会话里读到的')
  assert.equal(readerCalls[0].sessionId, 'session-1')
})

test('dsh-fish 协议：没有回话时诚实返回 silent，不伪造发送内容', async () => {
  const { p } = protocolWith(undefined, { response: { ok: true, herReply: '', said: [], note: '她这次没说话。' } })
  const r = await p.say({ target: { scene: 'private', id: '1' }, userId: '1', sender: 's', text: 't' })
  assert.deepEqual(r, { ok: true, silent: true, reason: 'empty-response', note: '她这次没说话。' })
})

test('dsh-fish 协议：403（Host 不受信）与 401（cookie 无效）分开报', async () => {
  const mk = (status) => createDshFishProtocol({
    sayUrl: 'http://dsh:3080/dsh-fish/say',
    auth: { header: () => 'x', describe: () => '' },
    fetchFn: async () => ({ status, ok: false, json: async () => ({ error: 'no' }) }),
  })
  assert.match((await mk(403).say({ target: { scene: 'private', id: '1' }, userId: '1', sender: 's', text: 't' })).error, /say-forbidden/)
  assert.equal((await mk(401).say({ target: { scene: 'private', id: '1' }, userId: '1', sender: 's', text: 't' })).error, 'say-unauthorized')
})

test('session-read：取 since 之后最后一条有正文的 assistant/message', () => {
  const text = [
    JSON.stringify({ type: 'assistant/message', time: 1000, data: { message: { content: [{ type: 'text', text: '旧' }] } } }),
    JSON.stringify({ type: 'assistant/message', time: 2000, data: { message: { content: [{ type: 'reasoning', text: '想' }, { type: 'text', text: '新回复' }] } } }),
    'not json',
    '',
  ].join('\n')
  assert.equal(lastAssistantText(text, { since: 1500 }), '新回复')
  assert.equal(lastAssistantText(text, { since: 2500 }), '')
  assert.equal(lastAssistantText(text, { since: 0 }), '新回复')
})

test('session-read：按 sessionId 找到文件；zstd 也能读；没有就返回空', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fish-sessions-'))
  const sdir = join(root, '--cwd--', 'session-abc')
  mkdirSync(sdir, { recursive: true })
  const lines = [
    JSON.stringify({ type: 'assistant/message', time: 1000, data: { message: { content: [{ type: 'text', text: '压缩前的回复' }] } } }),
  ].join('\n') + '\n'
  const zstd = zlib.zstdCompressSync
  if (typeof zstd === 'function') {
    writeFileSync(join(sdir, 'session.v4.jsonl.zstd'), zstd(Buffer.from(lines)))
  } else {
    writeFileSync(join(sdir, 'session.v4.jsonl'), lines)
  }

  assert.ok(findSessionFile(root, 'session-abc'))
  assert.equal(findSessionFile(root, '../etc'), '')
  const reader = createSessionReader({ sessionsDir: root })
  assert.equal(await reader.readReply({ sessionId: 'session-abc', since: 0 }), '压缩前的回复')
  assert.equal(await reader.waitForReply({ sessionId: 'missing', since: 0, timeoutMs: 30, pollMs: 10 }), '')
})

test('bridge：dsh-fish 模式下群聊未 @ 直接丢弃，不进模型', async () => {
  let says = 0
  const protocol = { name: 'dsh-fish', say: async () => { says++; return { ok: true, reply: 'r' } } }
  const outbound = { send: async () => ({ sent: true, reason: 'sent' }) }
  const b = createBridge({ selfId: '10000', account: 'a', allowlist: null, protocol, groupRequireAt: true, outbound })
  assert.equal((await b.handle(groupEv({ message: [{ type: 'text', data: { text: '闲聊' } }] }))).reason, 'not-mentioned')
  assert.equal(says, 0)
  assert.equal((await b.handle(groupEv())).action, 'sent')
  assert.equal(says, 1)
})
