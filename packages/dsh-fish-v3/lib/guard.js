/**
 * guard.js —— 外来文本消毒 + 秘密外发拦截。
 *
 * 数据即数据：任何外部文本（QQ/网页/评论/记忆/辅助模型输出）在进入记忆或外发前
 * 都要过这里。红线：秘密（token/sk-/Bearer/私钥/长 base64）一律拦下。
 */

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // 长 base64（可能含密钥）；阈值取高些，减少对正常长文本的误伤
  /[A-Za-z0-9+/]{64,}={0,2}/,
  // 形如 token/secret/api_key/password: 值
  /(?:"|'|^|\s)(token|secret|api[_-]?key|password|passwd|cookie)\s*[:=]\s*["']?[^\s"',;]{8,}/i,
]

/** 去除控制字符、裁剪首尾空白。 */
export function sanitizeForeign(text) {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
}

/** 是否疑似含秘密（fail-closed：拿不准就拦）。 */
export function looksSecret(text) {
  return SECRET_PATTERNS.some((re) => re.test(String(text ?? '')))
}

/** 脱敏（用于日志/报告）。 */
export function redact(text) {
  let out = String(text ?? '')
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]')
  return out
}
