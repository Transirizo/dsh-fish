import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMemory } from '../lib/memory.js'
import { backup, restore, verify } from '../lib/backup.js'

async function tmp() { return mkdtemp(path.join(tmpdir(), 'fish-bk-')) }

test('backup → verify → restore into isolated target → count matches', async () => {
  const dataDir = await tmp()
  const backupRoot = await tmp()
  const targetDir = await tmp()
  try {
    const mem = createMemory(dataDir)
    await mem.append({ type: 'fact', text: '张三喜欢美式咖啡' })
    await mem.append({ type: 'fact', text: '李四养了只猫' })

    const manifest = await backup(dataDir, backupRoot)
    assert.equal(manifest.memoryCount, 2)

    const v = await verify(manifest.snapshotDir)
    assert.equal(v.ok, true)
    assert.equal(v.memoryCount, 2)

    await restore(manifest.snapshotDir, targetDir)
    const targetMem = createMemory(targetDir)
    assert.equal(await targetMem.count(), 2)
    const rows = await targetMem.recall('咖啡')
    assert.equal(rows[0].text, '张三喜欢美式咖啡')
  } finally {
    await rm(dataDir, { recursive: true, force: true })
    await rm(backupRoot, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  }
})

test('repeated restore does not duplicate records', async () => {
  const dataDir = await tmp()
  const backupRoot = await tmp()
  const targetDir = await tmp()
  try {
    const mem = createMemory(dataDir)
    await mem.append({ type: 'fact', text: '唯一一条' })
    const manifest = await backup(dataDir, backupRoot)

    await restore(manifest.snapshotDir, targetDir)
    await restore(manifest.snapshotDir, targetDir) // 覆盖式，不追加
    assert.equal(await createMemory(targetDir).count(), 1)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
    await rm(backupRoot, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  }
})

test('verify fails on a corrupted file', async () => {
  const dataDir = await tmp()
  const backupRoot = await tmp()
  try {
    const mem = createMemory(dataDir)
    await mem.append({ type: 'fact', text: '会被改坏' })
    const manifest = await backup(dataDir, backupRoot)

    await writeFile(path.join(manifest.snapshotDir, 'memory.jsonl'), '被篡改\n', 'utf8')
    const v = await verify(manifest.snapshotDir)
    assert.equal(v.ok, false)
    assert.ok(v.results.some((r) => r.name === 'memory.jsonl' && r.ok === false))
  } finally {
    await rm(dataDir, { recursive: true, force: true })
    await rm(backupRoot, { recursive: true, force: true })
  }
})

test('backup of an empty data dir yields a valid manifest', async () => {
  const dataDir = await tmp()
  const backupRoot = await tmp()
  try {
    const manifest = await backup(dataDir, backupRoot)
    assert.equal(manifest.memoryCount, 0)
    assert.equal((await verify(manifest.snapshotDir)).ok, true)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
    await rm(backupRoot, { recursive: true, force: true })
  }
})
