/**
 * apply/dispose 生命周期测试：用真实插件代码（index.js 的 apply）+ 最小 mock 宿主，
 * 验证装配与清理的接线正确。**不是**「真实 DSH 加载」验收。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, name, VERSION, inject, resolveDataDir } from '../index.js'

function mockCtx() {
  const registrations = { sections: [], tools: [], routes: [] }
  const ctx = {
    systemPrompt: {
      section: (s) => { registrations.sections.push(s); return () => {} },
      getSectionOrder: (n) => (n === 'DEPLOYMENT_PERSONA_PREFIX' ? 0 : 10200),
    },
    tools: {
      register: (def) => { registrations.tools.push(def); return () => {} },
    },
    webServer: {
      register: (r) => { registrations.routes.push(r); return () => {} },
    },
    effect: (fn) => { const off = fn(); return typeof off === 'function' ? off : () => {} },
    inject: () => ({}),
    get: () => undefined, // 心跳默认关闭不会走到 timer 探测
  }
  return { ctx, registrations }
}

test('plugin metadata', () => {
  assert.equal(name, 'dsh-fish-v3')
  assert.equal(VERSION, '3.2.1')
  assert.deepEqual(inject, ['systemPrompt', 'tools', 'webServer'])
})

test('Host apply leaves engineering persona untouched and registers tools + health', () => {
  const { ctx, registrations } = mockCtx()
  const inst = apply(ctx, { dataDir: '/tmp/dsh-fish-v3-test' })
  assert.equal(typeof inst.dispose, 'function')

  const sectionNames = registrations.sections.map((s) => s.name)
  assert.deepEqual(sectionNames, [])

  const toolNames = registrations.tools.map((t) => t.name).sort()
  assert.deepEqual(toolNames, ['fish_browse', 'fish_diary', 'fish_interest', 'fish_recall', 'fish_remember', 'fish_status'])

  assert.equal(registrations.routes.length, 1)
  assert.equal(registrations.routes[0].path, '/dsh-fish-v3/health')

  inst.dispose()
})

test('resolveDataDir honors config and env', () => {
  assert.equal(resolveDataDir({ dataDir: '/x/y' }), '/x/y')
  const prev = process.env.DSH_FISH_V3_HOME
  process.env.DSH_FISH_V3_HOME = '/env/home'
  try { assert.equal(resolveDataDir({}), '/env/home') } finally {
    if (prev === undefined) delete process.env.DSH_FISH_V3_HOME
    else process.env.DSH_FISH_V3_HOME = prev
  }
})
