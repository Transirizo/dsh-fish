/** 只解析本插件允许命名的凭据引用；每个请求重新读取，不缓存秘密。 */
export async function resolveIngressToken(credentials, ref) {
  if (typeof ref !== 'string' || !/^DSH_FISH_[A-Z0-9_]{1,80}$/.test(ref)) return undefined
  if (typeof credentials?.resolve !== 'function') return undefined
  try {
    const record = await credentials.resolve(ref)
    const value = record?.value
    return typeof value === 'string' && Buffer.byteLength(value) >= 32 && Buffer.byteLength(value) <= 512 ? value : undefined
  } catch {
    return undefined
  }
}
