/**
 * net.js —— 受限抓取前的 URL 校验（SSRF 防护，规格 §5）。
 *
 * 只做「纯函数」可测的部分：解析、协议、凭据、主机名/IP 字面量判定。
 * 动态 DNS 解析与「绑定到已校验地址」的二次校验属运行期（由抓取代理/宿主 web 服务承担），
 * 这里无法离网测试，记为待办。
 */
import { isIP } from 'node:net'

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal'])

/** 解析并做静态校验。返回 { ok:true, url } | { ok:false, error }。 */
export function normalizeUrl(raw) {
  let u
  try { u = new URL(String(raw)) } catch { return { ok: false, error: 'invalid-url' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'unsupported-protocol' }
  if (u.username || u.password) return { ok: false, error: 'embedded-credentials' }
  return { ok: true, url: u }
}

/** 判定一个主机名/IP 字面量是否「可能是公网」（拒绝明显非公网）。 */
export function isPublicHost(hostname) {
  const h = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return false
  if (BLOCKED_HOSTS.has(h)) return false
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return false
  const ver = isIP(h)
  if (ver !== 0) return isPublicIp(h, ver)
  // 非 IP 字面量：主机名，需运行期解析后再校验（这里先放行）
  return true
}

/** IPv4 / IPv6 字面量：拒绝回环/私网/链路本地/云元数据/未指定。 */
export function isPublicIp(ip, ver = isIP(ip)) {
  if (ver === 4) return !isPrivateIpv4(ip)
  if (ver === 6) return !isPrivateIpv6(ip)
  return false
}

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local（含云元数据 169.254.169.254）
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a >= 224) return true // 多播/保留
  return false
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true // fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 ULA
  // IPv4-mapped / IPv4-compatible：取尾段 IPv4 再判
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  return false
}

/** 一步校验：解析 + 主机可公网。 */
export function isSafePublicUrl(raw) {
  const n = normalizeUrl(raw)
  if (!n.ok) return n
  if (!isPublicHost(n.url.hostname)) return { ok: false, error: 'non-public-host' }
  return n
}
