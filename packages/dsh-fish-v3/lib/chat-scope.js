/** 原生 Agent.setup 中安装聊天身份与能力。宿主权限仍需独立验收；不开放真实账号。 */
import { IDENTITY_TEXT } from './identity.js'
import { POLICY_TEXT } from './policy.js'
import { registerTools } from './tools.js'
import { createToolAccess } from './tool-access.js'

export const CHAT_TOOLS = ['fish_status', 'fish_recall', 'fish_remember', 'fish_diary', 'fish_interest']
export function setupChatScope(ctx, agent, { memory, config, dataDir, scope }) {
  const access = createToolAccess()
  ctx.effect(() => access.bind(agent, scope), 'fish.chat-scope-binding')
  // 用原生 persona 槽覆盖部署工程身份；仅发生在该聊天Agent作用域。
  ctx.effect(() => ctx.systemPrompt.section({ name: 'deployment:persona-prefix', order: 0, text: IDENTITY_TEXT + '\n\n' + POLICY_TEXT }), 'fish.chat-persona')
  ctx.effect(() => ctx.systemPrompt.section({ name: 'deployment:persona-suffix', order: 10200, text: '' }), 'fish.chat-persona-suffix')
  const globalNames = ctx.tools.definitions().map((tool) => tool.name)
  if (globalNames.length) ctx.effect(() => ctx.tools.restrict({ deny: globalNames }), 'fish.chat-global-mask')
  const toolContext = { tools: { register: (definition) => CHAT_TOOLS.includes(definition.name) ? ctx.tools.register(definition) : () => {} } }
  ctx.effect(() => registerTools(toolContext, { memory, config, dataDir, access }), 'fish.chat-memory-tools')
  // scoped工具不受全局mask影响；额外guard覆盖未来新增的工程工具与所有外网工具。
  ctx.effect(() => ctx.tools.guard((exec) => CHAT_TOOLS.includes(exec.name) ? undefined : '聊天会话禁止工程、管理、外网和发送工具'), 'fish.chat-tool-guard')
}
