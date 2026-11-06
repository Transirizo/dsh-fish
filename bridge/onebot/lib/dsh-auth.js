/**
 * dsh-auth.js —— 给上游 dsh-fish 的 /dsh-fish/say 做鉴权。
 *
 * 为什么不能沿用 v3 的 Bearer：
 *   `/dsh-fish/*` 在宿主的 connection 信任栅栏后面（`connection.requestRejection`
 *   → `admit` → `browserAuth.isAuthenticated`）。它不认自定义 token，只认两种东西：
 *     1. 浏览器会话 cookie（`dsh-auth-<authority>`，`v1.<payload>.<hmac>`）；
 *     2. `/connect` 用进程 token 换出来的 API cookie（v2）。
 *   进程 token 是每进程现生成、只存在内存里的随机数，外部进程拿不到；所以这里走第 1 种：
 *   用 DSH_HOME 里持久化的 `client-connection/browser-session` 签名密钥自签一个 v1 cookie。
 *   这正是社区 qq-bridge 的「离线铸造 Cookie」做法，算法以宿主源码为准。
 *
 * 安全边界：
 *   - 签名密钥等同于「能以 owner 身份调用宿主」的凭据。桥必须只跑在本机/同一宿主机，
 *     凭据只从 0600 的 DSH_HOME 读，或由部署方显式给 `FISH_DSH_SECRET`。
 *   - 本模块不落盘、不外传，只在内存里缓存到过期。
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SECRET_BYTES = 32
const COOKIE_PREFIX = 'dsh-auth-'
const DEFAULT_TTL_MS = 86_400_000
const REFRESH_BEFORE_MS = 60_000

const b64url = (buf) => Buffer.from(buf).toString('base64url')

/** 浏览器 cookie 的名字由 authority 的 sha256 决定；Host 换了名字也换。 */
export function cookieName(authority) {
  return COOKIE_PREFIX + b64url(createHash('sha256').update(String(authority)).digest())
}

/**
 * 从 DSH 的 `.credentials.yaml` 里取 `client-connection/browser-session` 的密钥。
 * 不引 YAML 依赖：这份文件是宿主自己写的固定形状，按缩进块读就够。
 * 读不到/形状不对返回空串，由调用方决定是报错还是回退到 FISH_DSH_COOKIE。
 */
export function readBrowserSessionSecret(yaml) {
  const lines = String(yaml ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\s*)client-connection\/browser-session:\s*$/.exec(lines[i])
    if (!head) continue
    const base = head[1].length
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (!line.trim()) continue
      const indent = /^\s*/.exec(line)[0].length
      if (indent <= base) break
      const m = /^\s*secret:\s*['"]?([A-Za-z0-9_-]{20,})['"]?\s*$/.exec(line)
      if (m) return m[1]
    }
  }
  return ''
}

/** 把 base64url 密钥解成 32 字节；长度不对返回 null（与宿主同口径）。 */
export function decodeSecret(secret) {
  try {
    const buf = Buffer.from(String(secret ?? ''), 'base64url')
    return buf.byteLength === SECRET_BYTES ? buf : null
  } catch {
    return null
  }
}

/**
 * 按宿主的 `encodeCookie` 造一个 v1 浏览器 cookie。
 * payload 的 authority 必须与请求的 Host 完全一致（宿主 `requestAudience` 用 url.host）。
 */
export function mintCookie(secret, authority, { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const key = decodeSecret(secret)
  if (!key) throw new Error('browser-session 密钥无效（需要 32 字节 base64url）')
  const payload = {
    version: 1,
    authority: String(authority),
    issuedAt: now,
    expiresAt: now + ttlMs,
  }
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64url(createHmac('sha256', key).update(body).digest())
  return { cookie: `${cookieName(authority)}=v1.${body}.${sig}`, expiresAt: payload.expiresAt }
}

/** 常量时间比较两个 cookie 串，单测/自检用。 */
export function sameCookie(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.byteLength === y.byteLength && timingSafeEqual(x, y)
}

/**
 * 鉴权头提供者。
 *
 * 取值优先级：显式 cookie > 显式 secret > DSH_HOME 里的凭据文件。
 * `header()` 返回可直接塞进 fetch 的 `cookie` 头；没有可用凭据时返回空串，
 * 由协议层报 `say-unauthorized`，而不是抛到事件循环里。
 */
export function createDshAuth({ cookie = '', secret = '', credentialsFile = '', authority, now = Date.now, ttlMs = DEFAULT_TTL_MS, log = () => {} } = {}) {
  const auth = String(authority ?? '').trim()
  if (!auth) throw new Error('缺少 authority（应为 /say 地址的 host，如 127.0.0.1:3080）')

  let cache = cookie ? { header: normalizeCookie(cookie), expiresAt: Infinity, source: 'env' } : null
  let failed = ''

  function normalizeCookie(value) {
    const s = String(value ?? '').trim()
    if (!s) return ''
    return s.includes('=') ? s : `${cookieName(auth)}=${s}`
  }

  function loadSecret() {
    if (secret) return { value: secret, source: 'env' }
    if (!credentialsFile) return { value: '', source: '' }
    try {
      const value = readBrowserSessionSecret(readFileSync(credentialsFile, 'utf8'))
      return { value, source: value ? credentialsFile : '' }
    } catch (err) {
      log(`读取 DSH 凭据失败：${err?.code ?? err?.message ?? err}`)
      return { value: '', source: '' }
    }
  }

  return {
    authority: auth,
    /** 返回 `cookie` 头；拿不到凭据返回空串。 */
    header() {
      const t = now()
      if (cache && cache.expiresAt - REFRESH_BEFORE_MS > t) return cache.header
      if (cookie) return cache?.header ?? normalizeCookie(cookie)
      const s = loadSecret()
      if (!s.value) {
        failed = credentialsFile ? `没有可用的 browser-session 密钥（${credentialsFile}）` : '未配置 FISH_DSH_SECRET / FISH_DSH_COOKIE / FISH_DSH_HOME'
        return ''
      }
      try {
        const minted = mintCookie(s.value, auth, { now: t, ttlMs })
        cache = { header: minted.cookie, expiresAt: minted.expiresAt, source: s.source }
        return cache.header
      } catch (err) {
        failed = String(err?.message ?? err)
        return ''
      }
    },
    /** 排障用：不返回秘密，只说从哪儿来的 / 为什么没有。 */
    describe() {
      return cache?.source ? `cookie 来源：${cache.source}` : failed || 'cookie 尚未生成'
    },
  }
}

/** 默认的 DSH_HOME：显式 > 环境变量 > ~/.dsh。 */
export function resolveDshHome(env = process.env) {
  const explicit = String(env.FISH_DSH_HOME ?? env.DSH_HOME ?? '').trim()
  if (explicit) return explicit
  return join(homedir(), '.dsh')
}

export function defaultCredentialsFile(env = process.env) {
  return join(resolveDshHome(env), '.credentials.yaml')
}
