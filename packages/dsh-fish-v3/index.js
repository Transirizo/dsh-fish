/**
 * dsh-fish-v3 —— 大肥鱼插件入口
 *
 * 生命周期：apply → 解析 dataDir → 注册身份段/策略段 → 注册工具 → 注册健康路由。
 * dispose → 依序调用所有 disposer。停用 = 零后台活动。
 *
 * inject 只写核心服务（缺一个整个插件在 import 阶段就被静默跳过）：
 * systemPrompt / tools 是 agent 循环的必需件；webServer 走运行时探测，缺了就降级。
 */
import { Config, read } from './lib/config.js'
import { createMemory } from './lib/memory.js'
import { registerTools } from './lib/tools.js'
import { registerHealth } from './lib/health.js'
import { registerSay } from './lib/say.js'
import { startHeartbeat } from './lib/heartbeat.js'
import { name, VERSION } from './lib/version.js'
import { resolveIngressToken } from './lib/ingress-credentials.js'

export { name, VERSION, Config }
export const inject = ['systemPrompt', 'tools', 'webServer']

/** dataDir：配置 > 环境变量 > <DSH_HOME>/dsh-fish-v3 > 临时目录。 */
export function resolveDataDir(config = {}) {
  const d = read(config, 'dataDir', '')
  if (d) return d
  if (process.env.DSH_FISH_V3_HOME) return process.env.DSH_FISH_V3_HOME
  const home = process.env.DSH_HOME || (process.env.HOME ? `${process.env.HOME}/.dsh` : '')
  return home ? `${home}/dsh-fish-v3` : '/tmp/dsh-fish-v3'
}

export function apply(ctx, config = {}) {
  const disposers = []
  const dataDir = resolveDataDir(config)
  const memory = createMemory(dataDir)

  const registrars = [
    () => registerTools(ctx, { memory, config, dataDir }),
    () => registerHealth(ctx, { memory, config, dataDir }),
    () => ctx.inject(['agents', 'agentDefaultModel', 'sessions', 'agentPresets', 'credentials'], (host) => {
      host.effect(() => registerSay(host, { token: () => resolveIngressToken(host.credentials, read(config, 'ingressCredentialRef', '')), dataDir, memory, config }), 'fish.say');
    }),
    () => startHeartbeat(ctx, {
      memory,
      enabled: read(config, 'proactiveEnabled', false) === true,
      intervalMs: read(config, 'proactiveHeartbeatMs', 300000),
      log: (msg) => console.log(msg),
    }),
  ]
  for (const reg of registrars) {
    const off = ctx.effect(() => {
      const cleanup = reg()
      return typeof cleanup === 'function' ? cleanup : () => {}
    }, 'fish.registration')
    disposers.push(off)
  }

  return {
    dispose() {
      for (const d of disposers.reverse()) {
        try { d() } catch { /* 卸载期异常不得逃逸 */ }
      }
    },
  }
}
