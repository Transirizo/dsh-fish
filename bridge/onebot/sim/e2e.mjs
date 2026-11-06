#!/usr/bin/env node
/**
 * 全链路模拟：假 NapCat ⇄ 桥 ⇄ 真实 DSH(/say, 真实模型)。
 * 真实发送开关打开，但发往本地假 NapCat，不触达任何 QQ。
 * 用法：node bridge/onebot/sim/e2e.mjs <诊断profile> [dshPort]
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, writeFile, open } from 'node:fs/promises'
import { randomBytes, createHmac } from 'node:crypto'
import path from 'node:path'

const profile = process.argv[2]; const dshPort = Number(process.argv[3] ?? 3084)
if (!profile) { console.error('用法：node bridge/onebot/sim/e2e.mjs <profile> [port]'); process.exit(2) }
const root = path.resolve('data/onebot-e2e'); await mkdir(root, { recursive: true, mode: 0o700 })
const run = await mkdtemp(path.join(root, 'run-'))
const token = randomBytes(32).toString('hex'); const secret = randomBytes(16).toString('hex')
const SELF = '10000', GROUP = '555', FRIEND = '333'

// 假 NapCat：记录桥调用的发送 API
const sent = []
const napcat = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c)
  sent.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') })
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: sent.length } }))
})
await new Promise((r) => napcat.listen(0, '127.0.0.1', r))
const napcatPort = napcat.address().port

const procs = []
const startLogged = async (cmd, args, env, name) => {
  const log = await open(path.join(run, name + '.log'), 'w', 0o600)
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', log.fd, log.fd] })
  procs.push({ p, log }); return p
}
await writeFile(path.join(run, 'overlay.yml'), `- id: dsh-fish-v3\n  config:\n    dataDir: ${JSON.stringify(path.join(run, 'state'))}\n    ingressCredentialRef: DSH_FISH_DIAGNOSTIC_TOKEN\n    groupMode: balanced\n`, { mode: 0o600 })
await startLogged('dsh', ['--profile', profile, '--patch', path.join(run, 'overlay.yml'), '--host', '127.0.0.1', '--port', String(dshPort), '--no-open'], { DSH_FISH_DIAGNOSTIC_TOKEN: token }, 'dsh')
const bridgePort = 6199 + Math.floor(Math.random() * 500)
await startLogged('node', [path.resolve('bridge/onebot/index.mjs')], {
  FISH_SELF_ID: SELF, FISH_ALLOWLIST: `group:${GROUP},private:${FRIEND}`,
  FISH_SAY_URL: `http://127.0.0.1:${dshPort}/dsh-fish-v3/say`, FISH_SAY_TOKEN: token,
  FISH_LISTEN: `127.0.0.1:${bridgePort}`, FISH_INBOUND_SECRET: secret,
  NAPCAT_API: `http://127.0.0.1:${napcatPort}`, FISH_SEND_ENABLED: 'true',
}, 'bridge')

const checks = []
const check = (name, pass) => { checks.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function report(ev, sign = true) {
  const raw = JSON.stringify(ev)
  const headers = { 'content-type': 'application/json' }
  if (sign) headers['x-signature'] = 'sha1=' + createHmac('sha1', secret).update(raw).digest('hex')
  return (await fetch(`http://127.0.0.1:${bridgePort}/`, { method: 'POST', headers, body: raw })).status
}
async function waitSent(n, ms = 80000) { const end = Date.now() + ms; while (Date.now() < end && sent.length < n) await wait(250); return sent.length >= n }

let ok = false
try {
  let up = false
  for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${dshPort}/dsh-fish-v3/health`)).ok } catch {} if (!up) await wait(200) }
  check('DSH 就绪', up)
  const ev = (o) => ({ post_type: 'message', time: Math.floor(Date.now() / 1000), self_id: Number(SELF), ...o })

  check('伪造签名上报被拒', (await report(ev({ message_type: 'private', message_id: 1, user_id: Number(FRIEND), message: [{ type: 'text', data: { text: 'x' } }] }), false)) === 401)

  await report(ev({ message_type: 'private', message_id: 101, user_id: Number(FRIEND), sender: { nickname: '测试好友' }, message: [{ type: 'text', data: { text: '合成测试：只回复“私聊收到”。' } }] }))
  check('私聊：经模型回复并调用 send_private_msg', (await waitSent(1)) && sent[0].path === '/send_private_msg' && sent[0].body.user_id === Number(FRIEND) && sent[0].body.message.length > 0)

  await report(ev({ message_type: 'group', message_id: 102, group_id: Number(GROUP), user_id: 222, sender: { card: '群友' }, message: [{ type: 'text', data: { text: '大家好啊' } }] }))
  await report(ev({ message_type: 'group', message_id: 103, group_id: 999, user_id: 222, message: [{ type: 'at', data: { qq: SELF } }, { type: 'text', data: { text: '你好' } }] }))
  await wait(4000)
  check('群聊未@与非名单群：不发送', sent.length === 1)

  await report(ev({ message_type: 'group', message_id: 104, group_id: Number(GROUP), user_id: 222, sender: { card: '群友' }, message: [{ type: 'at', data: { qq: SELF } }, { type: 'text', data: { text: ' 合成测试：只回复“群里收到”。' } }] }))
  check('群聊@：经模型回复并调用 send_group_msg', (await waitSent(2)) && sent[1].path === '/send_group_msg' && sent[1].body.group_id === Number(GROUP))

  await report(ev({ message_type: 'private', message_id: 101, user_id: Number(FRIEND), sender: { nickname: '测试好友' }, message: [{ type: 'text', data: { text: '合成测试：只回复“私聊收到”。' } }] }))
  await wait(4000)
  // 重复上报：/say 返回同一结果，但桥的出站冷却/去重必须阻止二次发送。
  check('同一消息重复上报不二次发送', sent.length === 2)
  ok = checks.every((c) => c.pass)
} catch (e) { console.error('失败：', e.message) } finally {
  for (const { p } of procs) p.kill('SIGTERM')
  await wait(1500)
  for (const { p, log } of procs) { if (p.exitCode === null) p.kill('SIGKILL'); await log.close() }
  napcat.close()
  await writeFile(path.join(run, 'report.json'), JSON.stringify({ ok, checks, sent: sent.map((s) => ({ path: s.path, chars: s.body.message?.length })), realQQ: false }, null, 2), { mode: 0o600 })
  console.log('报告：' + path.join(run, 'report.json'))
}
process.exitCode = ok ? 0 : 1
