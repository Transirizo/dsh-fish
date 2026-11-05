/**
 * apply/dispose 生命周期测试：用真实插件代码（index.js 的 apply）+ 最小 mock 宿主，
 * 验证装配与清理的接线正确。**不是**「真实 DSH 加载」验收（那需要审批 + 独立 profile）。
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
    get: (key) => {
      if (key === 'webServer') {
        return { register: (r) => { registrations.routes.push(r); return () => {} } }
      }
      return undefined
    },
  }
  return { ctx, registrations }
}

test('plugin metadata', () => {
  assert.equal(name, 'dsh-fish-v3')
  assert.equal(VERSION, '3.2.0')
  assert.deepEqual(inject, ['systemPrompt', 'tools'])
})

test('apply registers identity + policy + tools + health', () => {
  const { ctx, registrations } = mockCtx()
  const inst = apply(ctx, { dataDir: '/tmp/dsh-fish-v3-test' })
  assert.equal(typeof inst.dispose, 'function')

  const sectionNames = registrations.sections.map((s) => s.name)
  assert.ok(sectionNames.includes('dafeyu:identity'))
  assert.ok(sectionNames.includes('dafeyu:policy'))

  const toolNames = registrations.tools.map((t) => t.name).sort()
  assert.deepEqual(toolNames, ['fish_browse', 'fish_diary', 'fish_interest', 'fish_recall', 'fish_remember', 'fish_status'])

  assert.equal(registrations.routes.length, 1)
  assert.equal(registrations.routes[0].path, '/dsh-fish-v3/health')

  inst.dispose()
})

test('apply degrades when webServer is absent (health skipped, no throw)', () => {
  const registrations = { sections: [], tools: [], routes: [] }
  const ctx = {
    systemPrompt: {
      section: (s) => { registrations.sections.push(s); return () => {} },
      getSectionOrder: () => 0,
    },
    tools: { register: (def) => { registrations.tools.push(def); return () => {} } },
    get: () => undefined,
  }
  const inst = apply(ctx, { dataDir: '/tmp/dsh-fish-v3-test2' })
  assert.equal(registrations.routes.length, 0)
  assert.equal(registrations.tools.length, 6)
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
