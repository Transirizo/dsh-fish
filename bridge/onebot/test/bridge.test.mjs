import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEvent, allowed } from '../lib/normalize.js'
import { createOutbound } from '../lib/outbound.js'
import { createBridge } from '../lib/bridge.js'

const SELF = '10000'
const groupEv = (over = {}) => ({ post_type: 'message', message_type: 'group', message_id: 77, group_id: 555, user_id: 222, sender: { card: '张三' }, message: [{ type: 'at', data: { qq: SELF } }, { type: 'text', data: { text: ' 你好' } }], ...over })
const privEv = (over = {}) => ({ post_type: 'message', message_type: 'private', message_id: 88, user_id: 333, sender: { nickname: '李四' }, message: [{ type: 'text', data: { text: '在吗' } }], ...over })

test('normalize：群消息@自己识别为mentioned，私聊无mentioned字段', () => {
  const g = normalizeEvent(groupEv(), { selfId: SELF, account: 'acct' })
  assert.deepEqual(g.target, { scene: 'group', id: '555' })
  assert.equal(g.body.mentioned, true)
  assert.equal(g.body.text, '你好')
  assert.equal(g.body.sender, '张三')
  assert.equal(g.body.mode, 'simulation')
  const p = normalizeEvent(privEv(), { selfId: SELF, account: 'acct' })
  assert.deepEqual(p.target, { scene: 'private', id: '333' })
  assert.equal('mentioned' in p.body, false)
})
test('normalize：@别人不算mentioned；跳过自身、非消息、空文本、图片', () => {
  assert.equal(normalizeEvent(groupEv({ message: [{ type: 'at', data: { qq: '999' } }, { type: 'text', data: { text: 'hi' } }] }), { selfId: SELF }).body.mentioned, false)
  assert.equal(normalizeEvent(privEv({ user_id: SELF }), { selfId: SELF }).skip, 'self')
  assert.equal(normalizeEvent({ post_type: 'notice' }, { selfId: SELF }).skip, 'not-message')
  assert.equal(normalizeEvent(privEv({ message: [{ type: 'image', data: {} }] }), { selfId: SELF }).skip, 'empty-text')
  assert.equal(normalizeEvent(null, { selfId: SELF }).skip, 'not-object')
})
test('allowlist：空名单全拒，精确匹配', () => {
  assert.equal(allowed({ scene: 'group', id: '555' }, []), false)
  assert.equal(allowed({ scene: 'group', id: '555' }, ['group:555']), true)
  assert.equal(allowed({ scene: 'private', id: '555' }, ['group:555']), false)
})
test('outbound：默认dry-run不调用网络', async () => {
  let called = false
  const o = createOutbound({ apiBase: 'http://x', sendEnabled: false, fetchFn: async () => { called = true } })
  assert.deepEqual(await o.send({ scene: 'group', id: '1' }, 'hi'), { sent: false, reason: 'dry-run' })
  assert.equal(called, false)
})
test('outbound：真实发送走正确端点，冷却与日上限生效，失败视为未知不重发', async () => {
  let t = 1e12; const calls = []
  const fetchFn = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ status: 'ok', retcode: 0 }) } }
  const o = createOutbound({ apiBase: 'http://napcat/', sendEnabled: true, dailyLimit: 2, cooldownMs: 1000, fetchFn, now: () => t })
  assert.equal((await o.send({ scene: 'group', id: '5' }, 'a')).sent, true)
  assert.equal(calls[0].url, 'http://napcat/send_group_msg'); assert.equal(calls[0].body.group_id, 5)
  assert.equal((await o.send({ scene: 'group', id: '5' }, 'b')).reason, 'cooldown')
  t += 2000
  assert.equal((await o.send({ scene: 'private', id: '6' }, 'c')).sent, true)
  assert.equal(calls[1].url, 'http://napcat/send_private_msg')
  t += 2000
  assert.equal((await o.send({ scene: 'private', id: '7' }, 'd')).reason, 'daily-limit')
  const bad = createOutbound({ apiBase: 'http://x', sendEnabled: true, fetchFn: async () => { throw Error('timeout') } })
  assert.equal((await bad.send({ scene: 'group', id: '1' }, 'e')).reason, 'outcome-unknown')
})
test('bridge：不在名单不调用/say；沉默不发送；回复交给出站', async () => {
  const sayCalls = []; const sent = []
  const sayFetch = async (_u, init) => { const b = JSON.parse(init.body); sayCalls.push(b); return { status: 200, json: async () => b.scene === 'group' && !b.mentioned ? { ok: true, silent: true, reason: 'not-relevant' } : { ok: true, response: '回复内容' } } }
  const outbound = { send: async (target, text) => { sent.push({ target, text }); return { sent: false, reason: 'dry-run' } } }
  const b = createBridge({ selfId: SELF, account: 'acct', allowlist: ['group:555', 'private:333'], sayUrl: 'http://say', sayToken: 't', outbound, fetchFn: sayFetch })
  assert.equal((await b.handle(groupEv({ group_id: 999 }))).reason, 'not-allowlisted')
  assert.equal(sayCalls.length, 0)
  assert.equal((await b.handle(groupEv({ message: [{ type: 'text', data: { text: '闲聊' } }] }))).action, 'silent')
  assert.equal(sent.length, 0)
  const r = await b.handle(privEv())
  assert.equal(r.action, 'held'); assert.equal(sent[0].text, '回复内容'); assert.deepEqual(sent[0].target, { scene: 'private', id: '333' })
})
test('bridge：/say不可达或报错不发送', async () => {
  const outbound = { send: async () => { throw Error('should not send') } }
  const down = createBridge({ selfId: SELF, account: 'a', allowlist: ['private:333'], sayUrl: 'x', sayToken: 't', outbound, fetchFn: async () => { throw Error('down') } })
  assert.equal((await down.handle(privEv())).reason, 'say-unreachable')
  const err = createBridge({ selfId: SELF, account: 'a', allowlist: ['private:333'], sayUrl: 'x', sayToken: 't', outbound, fetchFn: async () => ({ status: 409, json: async () => ({ ok: false, error: 'outcome-unknown-or-pending' }) }) })
  assert.equal((await err.handle(privEv())).reason, 'outcome-unknown-or-pending')
})

test('bridge：同一事件重投只处理一次', async () => {
  let says = 0; const sent = []
  const b = createBridge({ selfId: SELF, account: 'a', allowlist: ['private:333'], sayUrl: 'x', sayToken: 't',
    outbound: { send: async (t, x) => { sent.push(x); return { sent: true, reason: 'sent' } } },
    fetchFn: async () => { says++; return { status: 200, json: async () => ({ ok: true, response: 'r' }) } } })
  await b.handle(privEv()); const second = await b.handle(privEv())
  assert.equal(second.reason, 'duplicate'); assert.equal(says, 1); assert.equal(sent.length, 1)
  assert.equal((await b.handle(privEv({ message_id: 89 }))).action, 'sent')
})
