/**
 * index.mjs 的端到端接线测试（不碰真实 DSH / 真实 QQ）：
 *   假 NapCat 上报 → 桥 → 假 DSH /dsh-fish/say（返回空 herReply）→ 桥读会话落盘 → 假 NapCat 发送。
 *
 * 覆盖的是 index.mjs 里的 env 解析、协议选择、cookie 铸造、群聊/私聊映射与回话兜底，
 * 不覆盖真实模型与真实 NapCat。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes, createHmac } from 'node:crypto'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)))
}
function json(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(value))
}

test('index：接上游 dsh-fish，herReply 为空时用会话落盘回话，并经 NapCat 发出', { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'fish-bridge-e2e-'))
  const sessionDir = join(root, 'sessions', '--cwd--', 'session-abc')
  mkdirSync(sessionDir, { recursive: true })
  const secret = randomBytes(32).toString('base64url')
  const inbound = randomBytes(16).toString('hex')

  const dshHits = []
  const dsh = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    if (req.method === 'POST' && req.url.startsWith('/dsh-fish/say')) {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      dshHits.push({ cookie: String(req.headers.cookie ?? ''), body })
      // 模拟上游 0.9.1：普通聊天正文不在 herReply/said 里，只落在会话文件。
      writeFileSync(
        join(sessionDir, 'session.v4.jsonl'),
        JSON.stringify({ type: 'assistant/message', time: Date.now(), data: { message: { content: [{ type: 'text', text: '会话里的回复' }] } } }) + '\n',
      )
      return json(res, 200, { ok: true, herReply: '', said: [], sessionId: 'session-abc', note: '她这次没说话。' })
    }
    json(res, 404, { error: 'not-found' })
  })
  const dshPort = await listen(dsh)

  const napcatHits = []
  const napcat = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    napcatHits.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') })
    json(res, 200, { status: 'ok', retcode: 0 })
  })
  const napcatPort = await listen(napcat)

  const child = spawn(process.execPath, [resolve('bridge/onebot/index.mjs')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FISH_SELF_ID: '10000',
      FISH_PROTOCOL: 'dsh-fish',
      FISH_SAY_URL: `http://127.0.0.1:${dshPort}/dsh-fish/say`,
      FISH_DSH_SECRET: secret,
      FISH_DSH_HOME: root,
      FISH_DSH_SESSIONS_DIR: join(root, 'sessions'),
      FISH_OWNER_QQ: '999',
      FISH_LISTEN: '127.0.0.1:0',
      FISH_INBOUND_SECRET: inbound,
      NAPCAT_API: `http://127.0.0.1:${napcatPort}`,
      FISH_SEND_ENABLED: 'true',
      FISH_STATE_FILE: join(root, 'state.jsonl'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', (d) => { out += d })
  child.stderr.on('data', (d) => { out += d })

  const port = await new Promise((resolvePort, reject) => {
    const end = Date.now() + 10_000
    const tick = () => {
      const m = /监听 http:\/\/[^:]+:(\d+)/.exec(out)
      if (m) return resolvePort(Number(m[1]))
      if (Date.now() > end) return reject(new Error(`桥没起来：${out}`))
      setTimeout(tick, 50)
    }
    tick()
  })

  try {
    const ev = {
      post_type: 'message', message_type: 'private', message_id: 501, user_id: 999, self_id: 10000,
      sender: { nickname: '主人' }, message: [{ type: 'text', data: { text: '在吗' } }],
    }
    const raw = JSON.stringify(ev)
    const sig = 'sha1=' + createHmac('sha1', inbound).update(raw).digest('hex')
    const report = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig }, body: raw,
    })
    assert.equal(report.status, 204)

    const end = Date.now() + 10_000
    while (Date.now() < end && napcatHits.length === 0) await wait(50)
    assert.equal(napcatHits.length, 1, `没有发出：${out}`)
    assert.equal(napcatHits[0].url, '/send_private_msg')
    assert.equal(napcatHits[0].body.user_id, 999)
    assert.equal(napcatHits[0].body.message, '会话里的回复')

    assert.equal(dshHits.length, 1)
    assert.match(dshHits[0].cookie, /^dsh-auth-[A-Za-z0-9_-]+=v1\./)
    assert.deepEqual(dshHits[0].body, {
      text: '在吗', scene: 'private', channel: 'qq:999', speaker: '主人', room: 'house',
    })
  } finally {
    child.kill('SIGKILL')
    napcat.close()
    dsh.close()
    rmSync(root, { recursive: true, force: true })
  }
})
