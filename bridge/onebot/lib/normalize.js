/**
 * OneBot v11 事件 → /say 合成请求体。纯函数，可离线测试。
 *
 * 只处理 post_type=message 的 private/group 普通消息；其余（通知、请求、心跳、
 * 自身发出的消息）返回 { skip: reason }。CQ 段数组里只取 text 与 at；图片等其他段丢弃。
 */
export function normalizeEvent(ev, { selfId, account }) {
  if (!ev || typeof ev !== 'object') return { skip: 'not-object' }
  if (ev.post_type !== 'message') return { skip: 'not-message' }
  if (ev.message_type !== 'private' && ev.message_type !== 'group') return { skip: 'unsupported-type' }
  if (String(ev.user_id) === String(selfId)) return { skip: 'self' }
  if (ev.message_id === undefined || ev.user_id === undefined) return { skip: 'missing-id' }

  const segments = Array.isArray(ev.message) ? ev.message : [{ type: 'text', data: { text: String(ev.raw_message ?? ev.message ?? '') } }]
  let text = ''
  let mentioned = false
  for (const seg of segments) {
    if (seg?.type === 'text') text += String(seg.data?.text ?? '')
    else if (seg?.type === 'at' && String(seg.data?.qq) === String(selfId)) mentioned = true
  }
  text = text.trim()
  if (!text) return { skip: 'empty-text' }

  const scene = ev.message_type
  const channel = scene === 'group' ? String(ev.group_id) : String(ev.user_id)
  if (scene === 'group' && !ev.group_id) return { skip: 'missing-group' }
  const sender = String(ev.sender?.card || ev.sender?.nickname || ev.user_id).slice(0, 64)
  return {
    target: { scene, id: channel },
    body: {
      mode: 'simulation',
      account: String(account),
      scene,
      channel,
      eventId: String(ev.message_id),
      sender,
      text: text.slice(0, 4000),
      ...(scene === 'group' ? { mentioned } : {}),
    },
  }
}

/** 允许名单：targets 形如 ['private:123', 'group:456']；空名单 = 全部拒绝。 */
export function allowed(target, allowlist) {
  return Array.isArray(allowlist) && allowlist.includes(`${target.scene}:${target.id}`)
}
