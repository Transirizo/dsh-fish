#!/usr/bin/env node
/**
 * offline.mjs —— 离线模拟消息闭环（对应「fish test --offline」的操作语义）。
 *
 * 无真实账号、无外部模型：用确定性模型桩 + 模拟平台事件，走真实插件代码
 * （ingest/loop/delivery/memory/guard），验证：
 *   事件身份/scope、会话映射、去重、授权拒绝、记忆读写、投递授权链。
 *
 * 用法：node sim/offline.mjs   （退出码 0=全过，1=有失败）
 * 这是「模拟验证」，不构成真实账号 / 真实 provider / 生产成功（规格 §13）。
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMemory } from '../lib/memory.js'
import { createIngest, sessionKey } from '../lib/ingest.js'
import { createDeliveryGate } from '../lib/delivery.js'
import { createLoop } from '../lib/loop.js'

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const stubModel = async ({ text, scope, sender }) => {
  const where = scope === 'group:987654' ? '群聊' : scope === 'private' ? '私聊' : scope
  return `[大肥鱼] ${where}收到 ${sender} 的话：${text}`
}

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), 'fish-sim-'))
  const memory = createMemory(dir)

  // 出站授权：默认关闭，先验证默认拒绝，再开启并配白名单
  const deliveryOff = createDeliveryGate({})
  const delivery = createDeliveryGate({
    enabled: true,
    allowlist: ['qq-main:private', 'qq-main:group:987654'],
    cooldownMs: 0,
  })
  const ingest = createIngest()
  const loop = createLoop({
    memory, ingest, delivery, model: stubModel,
    allowInbound: ['qq-main:private', 'qq-main:group:987654'],
  })

  const ev = (over = {}) => ({
    account: 'qq-main', eventId: 'ev-1', scope: 'private', sender: '某人',
    ts: Date.now(), contentType: 'text', text: '你好呀', ...over,
  })

  try {
    // 0. 默认关闭：投递闸拒绝一切
    const g = createDeliveryGate({})
    check('默认投递关闭 → 拒绝', g.authorize({ target: 'x', category: 'reply' }).reason === 'sending-disabled')

    // 1. 允许的私聊事件
    const priv = await loop.handleInbound(ev({ eventId: 'p-1', scope: 'private', text: '在吗' }))
    check('私聊：事件身份/scope 正确', priv.ok && priv.sessionKey === 'qq-main:private', priv.sessionKey)
    check('私聊：模型被调用并出话', priv.response?.includes('私聊'), priv.response)
    check('私聊：经授权链投递成功', priv.delivered === true && typeof priv.deliveryId === 'string')

    // 2. 允许的群聊事件
    const grp = await loop.handleInbound(ev({ eventId: 'g-1', scope: 'group:987654', sender: '张三', text: '今晚吃什么' }))
    check('群聊：会话映射到 group scope', grp.ok && grp.sessionKey === 'qq-main:group:987654', grp.sessionKey)
    check('群聊：说话人进正文', grp.response?.includes('张三'), grp.response)
    check('群聊：投递成功', grp.delivered === true)

    // 3. 幂等：同一事件重复注入不重复投递
    const dup = await loop.handleInbound(ev({ eventId: 'p-1', scope: 'private', text: '在吗' }))
    check('重复注入：去重且不重复投递', dup.ok === false && dup.dup === true)

    // 4. 未授权事件（来源不在白名单）
    const bad = await loop.handleInbound(ev({ eventId: 'x-1', account: 'qq-other', scope: 'private', text: 'hello' }))
    check('未授权来源被拒', bad.ok === false && bad.reason === 'unauthorized-event')

    // 5. 恶意文本（疑似密钥）被拦
    const secret = await loop.handleInbound(ev({ eventId: 's-1', text: 'token: abcdefghijklmnop' }))
    check('疑似密钥被拦', secret.ok === false && secret.reason === 'blocked-secret')

    // 6. 记忆已按 scope 记录
    const count = await memory.count()
    check('记忆落库（私聊+群聊各 1 条）', count === 2, `count=${count}`)

    const failed = results.filter((r) => !r.pass)
    console.log(`\n${results.length - failed.length}/${results.length} 通过`)
    return failed.length === 0 ? 0 : 1
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(1) })
