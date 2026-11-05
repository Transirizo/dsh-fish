/**
 * health.js —— 健康路由。
 *
 * GET /dsh-fish-v3/health —— 只读、无鉴权、无敏感数据。webServer 缺席时降级（不注册）。
 * 注意：webServer.register 的路由**没有任何鉴权**（见 astrbot-relay 注释），
 * 所以这里只返回不含密钥、不含对话正文的摘要。
 */
import { VERSION } from './version.js'
import { redact } from './guard.js'

export function registerHealth(ctx, { memory, config, dataDir }) {
  // webServer 已在 inject 里声明，apply 时可用
  return ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-fish-v3/health',
    handler: async (_request, response) => {
      let count = -1
      try { count = await memory.count() } catch { /* 读不到就报 -1 */ }
      const body = {
        ok: true,
        plugin: 'dsh-fish-v3',
        version: VERSION,
        dataDir: redact(dataDir),
        memoryCount: count,
        groupMode: config.groupMode ?? 'balanced',
        sendingEnabled: Boolean(config.sendingEnabled),
        proactiveEnabled: Boolean(config.proactiveEnabled),
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(body))
    },
  })
}
