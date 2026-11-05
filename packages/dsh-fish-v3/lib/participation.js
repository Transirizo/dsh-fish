/**
 * participation.js —— 群内参与节奏决策（规格 §4）。
 *
 * 在模型外做第一道闸：这条消息要不要回。模式：
 *   quiet     只在点名/直接提问/直接相关时回
 *   balanced  相关就回，被反复冷落则降级
 *   active    更积极：相关或近期活跃就回
 * 被反复冷落时自动降频；被点名/直接提问永远回（打破冷落态）。
 */
export const MODES = ['quiet', 'balanced', 'active']

/**
 * 纯决策。signal: { mentioned, directQuestion, relevant, activityHigh, recentlyIgnored }。
 */
export function decide(signal, mode = 'balanced') {
  const s = signal ?? {}
  if (s.mentioned || s.directQuestion) return { shouldReply: true, reason: 'mentioned-or-question' }
  if (s.recentlyIgnored) return { shouldReply: false, reason: 'recently-ignored' }
  switch (mode) {
    case 'quiet':
      return { shouldReply: s.relevant === true, reason: s.relevant === true ? 'relevant' : 'quiet-mode' }
    case 'active':
      return {
        shouldReply: s.relevant === true || s.activityHigh === true,
        reason: (s.relevant || s.activityHigh) ? 'relevant-or-active' : 'active-no-hook',
      }
    case 'balanced':
    default:
      return { shouldReply: s.relevant === true, reason: s.relevant === true ? 'relevant' : 'not-relevant' }
  }
}

/** 有状态版：跟踪「被冷落」标记（由 loop 在检测到连续被无视时置位）。 */
export function createParticipation(mode = 'balanced') {
  let mode_ = mode
  let recentlyIgnored = false
  return {
    decide(signal) { return decide({ ...(signal ?? {}), recentlyIgnored }, mode_) },
    markIgnored() { recentlyIgnored = true },
    markEngaged() { recentlyIgnored = false },
    setMode(m) { mode_ = m },
    isIgnored() { return recentlyIgnored },
  }
}

/** 从文本做最粗的提及/提问判断（真实相关性需记忆/模型，P1 后续）。 */
export function signalFromText(text) {
  const t = String(text ?? '')
  const mentioned = /大肥鱼|@/.test(t)
  const directQuestion = /[?？]$/.test(t) || /[吗呢]$/.test(t)
  return { mentioned, directQuestion, relevant: mentioned }
}
