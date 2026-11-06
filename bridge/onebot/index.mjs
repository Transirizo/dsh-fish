#!/usr/bin/env node
/**
 * 大肥鱼 OneBot 桥（NapCat HTTP 上报 → DSH /say → NapCat HTTP API）。
 *
 * 配置走环境变量（不放进参数，避免进程列表泄露）：
 *   FISH_SELF_ID        机器人 QQ 号（识别 @ 与过滤自身消息）
 *   FISH_ACCOUNT        账号标识（会话/去重作用域，默认等于 SELF_ID）
 *   FISH_ALLOWLIST      逗号分隔，如 private:123,group:456；不设置＝信任 NapCat 已过滤（全放行）
 *   FISH_SAY_URL        默认 http://127.0.0.1:3080/dsh-fish-v3/say
 *   FISH_SAY_TOKEN      与 DSH 凭据 DSH_FISH_INGRESS_TOKEN 相同
 *   FISH_LISTEN         桥监听地址，默认 127.0.0.1:6199（NapCat HTTP 上报目标）
 *   FISH_INBOUND_SECRET NapCat 上报 secret（HMAC-SHA1 签名校验，强烈建议设置）
 *   NAPCAT_API          NapCat HTTP API 基址，如 http://127.0.0.1:3000
 *   NAPCAT_TOKEN        NapCat access token（可选）
 *   FISH_SEND_ENABLED   true/false 显式；不设或 auto 时跟随 DSH 设置页的「真实平台回复」开关
 *   FISH_STATE_FILE     去重状态文件，默认 /app/bridge-state.jsonl（重启后恢复，避免重发）
 */
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createBridge } from './lib/bridge.js'
import { createOutbound } from './lib/outbound.js'

const env = process.env
const selfId = env.FISH_SELF_ID
const sayToken = env.FISH_SAY_TOKEN
if (!selfId || !sayToken) { console.error('缺少 FISH_SELF_ID 或 FISH_SAY_TOKEN'); process.exit(2) }
const allowlistRaw = String(env.FISH_ALLOWLIST ?? '').trim()
const allowlist = allowlistRaw ? allowlistRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
const [host, port] = String(env.FISH_LISTEN ?? '127.0.0.1:6199').split(':')

// 发送模式：true/false 显式；auto（默认）跟随 DSH 设置页的「真实平台回复」开关（sendingEnabled）。
const sendMode = String(env.FISH_SEND_ENABLED ?? 'auto').toLowerCase()
if (!['true', 'false', 'auto'].includes(sendMode)) { console.error('FISH_SEND_ENABLED 只能是 true / false / auto'); process.exit(2) }
const sayUrl = env.FISH_SAY_URL ?? 'http://127.0.0.1:3080/dsh-fish-v3/say'
const healthUrl = sayUrl.replace(/\/say(?:\?.*)?$/, '/health')
if (sendMode !== 'false' && !env.NAPCAT_API) { console.error('需要 NAPCAT_API（FISH_SEND_ENABLED 不是 false 时）'); process.exit(2) }

// auto：轮询 DSH 健康接口读 sendingEnabled，5 秒缓存；读不到按不发送（fail-safe）。
let gateCache = { at: 0, value: false }
async function dshSendingEnabled() {
  const nowMs = Date.now()
  if (nowMs - gateCache.at < 5000) return gateCache.value
  try {
    const res = await fetch(`${healthUrl}?t=${nowMs}`)
    if (!res.ok) throw new Error(`health ${res.status}`)
    const data = await res.json()
    gateCache = { at: nowMs, value: data?.sendingEnabled === true }
  } catch {
    gateCache = { at: nowMs, value: false }
  }
  return gateCache.value
}
const gate = sendMode === 'true' ? async () => true : sendMode === 'false' ? async () => false : dshSendingEnabled
const modeLabel = sendMode === 'auto' ? '跟随 DSH 设置（auto）' : sendMode === 'true' ? '真实发送' : 'dry-run（不发送）'

const outbound = createOutbound({ apiBase: env.NAPCAT_API ?? 'http://invalid', accessToken: env.NAPCAT_TOKEN, sendEnabled: sendMode === 'true', gate })

// 去重状态落盘：重启后从文件恢复已处理事件，避免 NapCat 重投导致重复发送。
const maxSeen = 2000
const stateFile = env.FISH_STATE_FILE ?? '/app/bridge-state.jsonl'
const seen = new Set()
if (existsSync(stateFile)) {
  try {
    const lines = readFileSync(stateFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
    for (const k of lines.slice(-maxSeen)) seen.add(k)
    if (seen.size) console.log(`已加载 ${seen.size} 条去重记录`)
  } catch (err) { console.error(`读取去重状态失败：${err.message}`) }
}
let appends = 0
const onSeen = (key) => {
  try {
    mkdirSync(dirname(stateFile), { recursive: true })
    appendFileSync(stateFile, key + '\n')
    appends++
    // 每 500 条压缩一次：把文件重写为内存里最近 maxSeen 条，保持文件有界。
    if (appends >= 500) { writeFileSync(stateFile, [...seen].slice(-maxSeen).join('\n') + '\n'); appends = 0 }
  } catch (err) { console.error(`去重状态落盘失败：${err.message}`) }
}

const bridge = createBridge({
  selfId, account: env.FISH_ACCOUNT ?? selfId, allowlist,
  sayUrl: env.FISH_SAY_URL ?? 'http://127.0.0.1:3080/dsh-fish-v3/say',
  sayToken, outbound, log: (m) => console.log(m),
  seen, onSeen,
})

const ts = () => new Date().toISOString()
/** 只打 ID 不打正文的上报摘要，方便排障又不落消息内容。 */
function describeEvent(ev) {
  if (!ev || typeof ev !== 'object') return '非对象'
  return [ev.post_type, ev.message_type, ev.group_id ? `group:${ev.group_id}` : ev.user_id ? `user:${ev.user_id}` : '', ev.message_id ? `msg:${ev.message_id}` : ''].filter(Boolean).join(' ') || '未知'
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST') { console.log(`[${ts()}] 非POST ${req.method}`); res.writeHead(405).end(); return }
  const chunks = []; let size = 0
  for await (const c of req) { size += c.length; if (size > 65536) { res.writeHead(413).end(); return } chunks.push(c) }
  const raw = Buffer.concat(chunks)
  if (env.FISH_INBOUND_SECRET) {
    const sig = String(req.headers['x-signature'] ?? '')
    const want = 'sha1=' + createHmac('sha1', env.FISH_INBOUND_SECRET).update(raw).digest('hex')
    if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) {
      console.log(`[${ts()}] 上报签名校验失败（secret 不匹配或未填）：收到 ${sig.length} 字节签名，期望 ${want.length} 字节`)
      res.writeHead(401).end(); return
    }
  }
  // NapCat 只要求快速 2xx；处理异步进行，避免上报超时重投。
  res.writeHead(204).end()
  let ev; try { ev = JSON.parse(raw.toString('utf8')) } catch { console.log(`[${ts()}] 上报非JSON`); return }
  console.log(`[${ts()}] 收到上报：${describeEvent(ev)}`)
  const r = await bridge.handle(ev)
  if (r.action !== 'skip' || r.reason === 'not-allowlisted') console.log(`[${ts()}] ${r.action} ${r.reason ?? ''}`)
})
server.listen(Number(port), host, () => {
  console.log(`大肥鱼 OneBot 桥监听 http://${host}:${port}；目标名单：${allowlist ? `${allowlist.length} 个` : '未设置（信任 NapCat 已过滤）'}；发送模式：${modeLabel}`)
  if (!env.FISH_INBOUND_SECRET) console.warn('警告：未设置 FISH_INBOUND_SECRET，上报未做签名校验')
})
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => server.close(() => process.exit(0)))
