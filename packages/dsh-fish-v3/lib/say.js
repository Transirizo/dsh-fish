/**
 * say.js —— 入站桥接收口 `POST /dsh-fish-v3/say`（token 鉴权）。
 *
 * 替代「自建 DSH 会话」的轻量桥入口：桥只发 HTTP，本插件驱动 DSH agent 会话
 * （同一身份、按 channel 分房、记忆按 scope 隔离）。
 *
 * 请求体：{ text, channel?, scene?('private'|'group'), speaker? }
 * 零依赖：模型选择走 agentDefaultModel 服务；消息手工构造（内联 createUserMessage 语义）。
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function registerSay(ctx, { token, dataDir }) {
  if (!token) return () => {}
  const agents = ctx.get ? ctx.get('agents') : undefined
  const defaultModel = ctx.get ? ctx.get('agentDefaultModel') : undefined
  if (!agents?.create || !agents?.resume || !agents?.get || !defaultModel?.currentSelection) return () => {}
  const ws = ctx.webServer
  if (!ws?.register) return () => {}

  const sessionsFile = path.join(dataDir, 'say-sessions.json')
  let sessions = {}
  try { sessions = JSON.parse(readFileSync(sessionsFile, 'utf8')) } catch { /* 首次 */ }
  const saveSessions = () => {
    try { mkdirSync(dataDir, { recursive: true }); writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2)) } catch { /* 忽略 */ }
  }

  return ws.register({
    kind: 'exact',
    path: '/dsh-fish-v3/say',
    handler: async (request, response) => {
      try {
        const auth = String(request.headers?.authorization ?? request.headers?.Authorization ?? '')
        if (auth !== `Bearer ${token}`) return writeJson(response, 401, { ok: false, error: 'unauthorized' })

        const body = await readJsonBody(request, 1_000_000)
        if (!body || typeof body.text !== 'string' || !body.text.trim()) return writeJson(response, 400, { ok: false, error: 'invalid-body' })
        const text = String(body.text).trim()
        const scene = body.scene === 'group' ? 'group' : 'private'
        const channel = String(body.channel ?? '')
        const speaker = String(body.speaker ?? '')
        const sk = scene === 'group' ? `qq:group:${channel}` : 'qq:private'

        // 会话映射：live → resume → create
        let sessionId = sessions[sk]
        let agent = sessionId ? agents.get(sessionId) : undefined
        if (!agent && sessionId) {
          try { agent = (await agents.resume({ resumeSessionId: sessionId, meta: { cwd: dataDir } })).agent } catch { agent = undefined }
        }
        if (!agent) {
          sessionId = `fish-${randomUUID()}`
          sessions[sk] = sessionId
          saveSessions()
          const selection = defaultModel.currentSelection() ?? {}
          agent = (await agents.create({
            sessionId,
            meta: { cwd: dataDir },
            agentOptions: { ...selection },
          })).agent
        }

        await agent.whenIdle()
        const firstSeq = agent.session.seq
        const content = scene === 'group' && speaker ? `${speaker}说：${text}` : text
        agent.followup({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: content }],
          source: { kind: 'user' },
        })
        await agent.whenIdle()

        const out = collectAssistantText(agent.session, firstSeq)
        writeJson(response, 200, { ok: true, sessionId, response: out })
      } catch (err) {
        console.error('[dsh-fish-v3 say] handler error:', err?.stack ?? err)
        writeJson(response, 500, { ok: false, error: String(err?.message ?? err).slice(0, 200), stack: String(err?.stack ?? '').slice(0, 1200) })
      }
    },
  })
}

function collectAssistantText(session, firstSeq) {
  let text = ''
  const length = session.seq
  for (let seq = firstSeq; seq < length; seq++) {
    const event = session.eventAt(seq)
    if (!event || event.type !== 'assistant/message') continue
    const joined = (event.data?.message?.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    if (joined) text = joined
  }
  return text
}

function writeJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request, limit) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) return null
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null }
}
