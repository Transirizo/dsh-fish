import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CATEGORIES = new Set(['casual', 'meme', 'tease', 'complex', 'current', 'silence', 'excessive', 'cross-day', 'model-switch'])

const dir = path.dirname(fileURLToPath(import.meta.url))
const scenarios = JSON.parse(await readFile(path.join(dir, '../eval/scenarios.json'), 'utf8'))

test('scenario fixtures are versioned and cover the required categories', () => {
  assert.equal(scenarios.version, 1)
  const ids = new Set()
  const cats = new Set()
  for (const s of scenarios.scenarios) {
    assert.ok(s.id, 'id required')
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`)
    ids.add(s.id)
    assert.ok(s.title, `${s.id} title required`)
    assert.ok(Array.isArray(s.turns) && s.turns.length > 0, `${s.id} needs turns`)
    assert.ok(CATEGORIES.has(s.category), `${s.id} unknown category ${s.category}`)
    for (const t of s.turns) {
      assert.ok(t.speaker && t.text, `${s.id} turn needs speaker+text`)
    }
    cats.add(s.category)
  }
  // 覆盖 §17 要求的场景类型
  for (const c of ['casual', 'meme', 'tease', 'complex', 'current', 'silence', 'excessive', 'cross-day', 'model-switch']) {
    assert.ok(cats.has(c), `missing category ${c}`)
  }
})
