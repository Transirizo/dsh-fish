/** 模型外的记忆工具范围。绑定仅由可信宿主代码持有，不接受工具参数授权。 */
export function createToolAccess() {
  const bindings = new WeakMap()
  return {
    bind(agent, scope) {
      if (!agent || typeof scope !== 'string' || !scope.trim()) throw new Error('无效的宿主会话绑定')
      if (bindings.has(agent)) throw new Error('会话范围已绑定')
      bindings.set(agent, scope)
      return () => bindings.delete(agent)
    },
    scopeOf(exec) {
      const agent = exec?.agent
      if (!agent || typeof agent.id !== 'string' || !agent.id) return undefined
      return bindings.get(agent) ?? `session:${agent.id}`
    },
  }
}
