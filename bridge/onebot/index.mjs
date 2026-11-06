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
 *   FISH_SEND_ENABLED   只有严格等于 "true" 才真实发送；否则 dry-run
 */
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createBridge } from './lib/bridge.js'
import { createOutbound } from './lib/outbound.js'

const env = process.env
const selfId = env.FISH_SELF_ID
const sayToken = env.FISH_SAY_TOKEN
if (!selfId || !sayToken) { console.error('缺少 FISH_SELF_ID 或 FISH_SAY_TOKEN'); process.exit(2) }
const allowlistRaw = String(env.FISH_ALLOWLIST ?? '').trim()
const allowlist = allowlistRaw ? allowlistRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
const [host, port] = String(env.FISH_LISTEN ?? '127.0.0.1:6199').split(':')
const sendEnabled = env.FISH_SEND_ENABLED === 'true'
if (sendEnabled && !env.NAPCAT_API) { console.error('FISH_SEND_ENABLED=true 需要 NAPCAT_API'); process.exit(2) }

const outbound = createOutbound({ apiBase: env.NAPCAT_API ?? 'http://invalid', accessToken: env.NAPCAT_TOKEN, sendEnabled })
const bridge = createBridge({
  selfId, account: env.FISH_ACCOUNT ?? selfId, allowlist,
  sayUrl: env.FISH_SAY_URL ?? 'http://127.0.0.1:3080/dsh-fish-v3/say',
  sayToken, outbound, log: (m) => console.log(m),
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
  console.log(`大肥鱼 OneBot 桥监听 http://${host}:${port}；目标名单：${allowlist ? `${allowlist.length} 个` : '未设置（信任 NapCat 已过滤）'}；发送模式：${sendEnabled ? '真实发送' : 'dry-run（不发送）'}`)
  if (!env.FISH_INBOUND_SECRET) console.warn('警告：未设置 FISH_INBOUND_SECRET，上报未做签名校验')
})
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => server.close(() => process.exit(0)))
