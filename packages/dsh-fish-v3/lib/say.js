/** 合成事件诊断入口。真实平台接入在宿主隔离与授权验收前拒绝。 */
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { sanitizeForeign, looksSecret } from './guard.js'
import { setupChatScope } from './chat-scope.js'

export function registerSay(ctx, { token, dataDir, memory, config = {} }) {
  const agents = ctx.agents ?? ctx.get?.('agents')
  const models = ctx.agentDefaultModel ?? ctx.get?.('agentDefaultModel')
  const sessions = ctx.sessions ?? ctx.get?.('sessions')
  if (!agents || !models || !sessions) throw new Error('缺少原生会话服务')
  const file = path.join(dataDir, 'say-ledger-v1.json')
  let state = { version: 1, sessions: {}, events: {} }
  try { state = JSON.parse(readFileSync(file, 'utf8')) } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  if (state.version !== 1) throw new Error('不兼容的入站账本版本')
  const save = () => {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    writeFileSync(file + '.tmp', JSON.stringify(state), { mode: 0o600 })
    renameSync(file + '.tmp', file)
  }
  // 进程重启后的在途事件不自动重放。
  for (const entry of Object.values(state.events)) if (entry.status === 'processing') entry.status = 'unknown'
  let active = false
  let closed = false
  const handles = new Set()
  const unregister = ctx.webServer.register({
    kind: 'exact', path: '/dsh-fish-v3/say',
    handler: async (req, res) => {
      const reply = (status, value) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      let key
      try { key = typeof token === 'function' ? await token() : token } catch { return reply(401, { ok: false, error: 'unauthorized' }) }
      const supplied = String(req.headers?.authorization ?? '')
      const digest = (s) => createHash('sha256').update(s).digest()
      if (!key || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) return reply(401, { ok: false, error: 'unauthorized' })
      if (req.method !== 'POST') return reply(405, { ok: false, error: 'method-not-allowed' })
      let eventKey
      let fingerprint
      let ownsSlot = false
      let agent
      let handle
      let timer
      try {
        let bytes = 0
        const chunks = []
        for await (const value of req) {
          const chunk = Buffer.from(value)
          bytes += chunk.length
          if (bytes > 16384) return reply(413, { ok: false, error: 'body-too-large' })
          chunks.push(chunk)
        }
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return reply(400, { ok: false, error: 'invalid-json' }) }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { ok: false, error: 'invalid-event' })
        if (body.mode !== 'simulation') return reply(403, { ok: false, error: 'live-ingress-not-authorized' })
        for (const field of ['account', 'channel', 'eventId', 'sender', 'text']) {
          if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > (field === 'text' ? 4000 : 128)) return reply(400, { ok: false, error: 'invalid-event' })
        }
        if (!['private', 'group'].includes(body.scene)) return reply(400, { ok: false, error: 'invalid-scene' })
        const text = sanitizeForeign(body.text)
        if (looksSecret(text)) return reply(400, { ok: false, error: 'blocked-secret' })
        const scope = JSON.stringify([body.account, body.scene, body.channel])
        eventKey = createHash('sha256').update(JSON.stringify([scope, body.eventId])).digest('hex')
        fingerprint = createHash('sha256').update(JSON.stringify([scope, body.eventId, body.sender, body.text])).digest('hex')
        const previous = state.events[eventKey]
        if (previous) {
          if (previous.fingerprint !== fingerprint) return reply(409, { ok: false, error: 'event-id-content-conflict' })
          return reply(previous.status === 'completed' ? 200 : 409, previous.result ?? { ok: false, error: 'outcome-unknown-or-pending' })
        }
        if (closed || active) return reply(429, { ok: false, error: 'busy' })
        if (Object.keys(state.events).length >= 1000) return reply(429, { ok: false, error: 'ledger-capacity' })
        active = true
        ownsSlot = true
        state.events[eventKey] = { status: 'processing', fingerprint }
        save()
        let sessionId = state.sessions[scope]
        const setup = async (agentCtx, subject) => {
          const presets = ctx.agentPresets ?? ctx.get?.('agentPresets')
          if (!presets?.mount) throw new Error('缺少独立聊天preset服务')
          await presets.mount(agentCtx, 'fish-chat')
          if (memory) return setupChatScope(agentCtx, subject, { memory, config, dataDir, scope })
          // 无记忆服务的测试上下文禁止全部工具。
          const names = agentCtx.tools.definitions().map((t) => t.name)
          agentCtx.effect(() => agentCtx.tools.restrict({ deny: names }), 'fish.deny-global-tools')
          agentCtx.effect(() => agentCtx.tools.guard(() => '诊断会话禁止所有工具'), 'fish.deny-tool-execution')
        }
        const options = { agentOptions: { ...models.currentSelection(), maxTokens: 512 }, setup }
        if (sessionId) handle = await agents.resume({ resumeSessionId: sessionId, ...options })
        else {
          sessionId = `fish-sim-${randomUUID()}`
          const cwd = path.join(dataDir, 'simulation-chat')
          mkdirSync(cwd, { recursive: true, mode: 0o700 })
          handle = await agents.create({ sessionId, meta: { cwd, agentPreset: 'fish-chat' }, ...options })
          handles.add(handle)
          agent = handle.agent
          state.sessions[scope] = sessionId
          save()
        }
        handles.add(handle)
        agent = handle.agent
        const firstSeq = agent.session.seq
        agent.followup({ id: randomUUID(), role: 'user', content: [{ type: 'text', text: `[合成${body.scene}消息，发言者：${sanitizeForeign(body.sender)}]\n${text}` }], source: { kind: 'user' } })
        await Promise.race([
          agent.whenIdle(),
          new Promise((_, reject) => { timer = setTimeout(() => { agent.cancel({ kind: 'user' }); reject(new Error('turn-timeout')) }, 60000) }),
        ])
        clearTimeout(timer)
        let response = ''
        let completed = false
        for (let seq = firstSeq; seq < agent.session.seq; seq++) {
          const event = agent.session.eventAt(seq)
          if (event?.type === 'assistant/message') response = event.data.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
          if (event?.type === 'turn/end') completed = event.data.reason.kind === 'completed'
        }
        if (!completed || !response || looksSecret(response)) throw new Error('turn-not-completed')
        await sessions.flush(agent.session)
        const result = { ok: true, mode: 'simulation', sessionId, eventId: body.eventId, response, delivered: false }
        state.events[eventKey] = { status: 'completed', fingerprint, result }
        save()
        await handle.dispose()
        handles.delete(handle)
        handle = undefined
        return reply(200, result)
      } catch {
        if (eventKey && ownsSlot) {
          state.events[eventKey] = { status: 'unknown', fingerprint }
          try { save() } catch { closed = true } // 存储失败使入口进入拒绝态，不能无限继续处理。
        }
        return reply(503, { ok: false, error: 'turn-unavailable', retry: 'manual-reconcile' })
      } finally {
        clearTimeout(timer)
        if (handle) {
          try {
            agent?.cancel({ kind: 'user' })
            await agent?.whenIdle()
            if (agent) await sessions.flush(agent.session)
          } catch { /* 清理继续执行，不泄漏异常内容 */ }
          try { await handle.dispose() } catch { closed = true }
          handles.delete(handle)
        }
        if (ownsSlot) active = false
      }
    },
  })
  return async () => {
    closed = true
    unregister()
    for (const handle of handles) {
      handle.agent.cancel({ kind: 'disposed' })
      await handle.agent.whenIdle()
      await sessions.flush(handle.agent.session)
      await handle.dispose()
    }
  }
}
