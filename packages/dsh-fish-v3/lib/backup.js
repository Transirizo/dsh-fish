/**
 * backup.js —— 备份 / 隔离恢复 / 校验。
 *
 * v0.1 数据 = <dataDir>/memory.jsonl。备份 = 拷贝 + 校验和清单；恢复 = 拷回隔离目标
 * （覆盖式，重复导入不追加，故不产生重复记录）；校验 = 重算 sha256 对比清单。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises'
import path from 'node:path'

const DATA_FILES = ['memory.jsonl']

async function sha256(filePath) {
  const buf = await readFile(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

async function countMemory(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8')
    return raw.split('\n').filter((l) => l.trim()).length
  } catch (e) {
    if (e?.code === 'ENOENT') return 0
    throw e
  }
}

/** 备份 dataDir 到 backupRoot/<backup-<ts>>/，返回 manifest。 */
export async function backup(dataDir, backupRoot) {
  await mkdir(backupRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const snapshotDir = path.join(backupRoot, `backup-${stamp}`)
  await mkdir(snapshotDir, { recursive: true })

  const files = []
  let memoryCount = 0
  for (const name of DATA_FILES) {
    const src = path.join(dataDir, name)
    try {
      const s = await stat(src)
    } catch (e) {
      if (e?.code === 'ENOENT') continue
      throw e
    }
    await copyFile(src, path.join(snapshotDir, name))
    files.push({ name, size: (await stat(src)).size, sha256: await sha256(src) })
    if (name === 'memory.jsonl') memoryCount = await countMemory(src)
  }

  const manifest = { createdAt: Date.now(), snapshotDir, files, memoryCount }
  await writeFile(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  return manifest
}

/** 从 snapshotDir 恢复到隔离 targetDir（覆盖式，幂等）。返回 manifest。 */
export async function restore(snapshotDir, targetDir) {
  const manifest = JSON.parse(await readFile(path.join(snapshotDir, 'manifest.json'), 'utf8'))
  await mkdir(targetDir, { recursive: true })
  for (const f of manifest.files ?? []) {
    await copyFile(path.join(snapshotDir, f.name), path.join(targetDir, f.name))
  }
  return manifest
}

/** 校验 snapshotDir：重算 sha256 对比清单。返回 { ok, results, memoryCount }。 */
export async function verify(snapshotDir) {
  const manifest = JSON.parse(await readFile(path.join(snapshotDir, 'manifest.json'), 'utf8'))
  const results = []
  for (const f of manifest.files ?? []) {
    const p = path.join(snapshotDir, f.name)
    try {
      const sha = await sha256(p)
      results.push({ name: f.name, ok: sha === f.sha256 })
    } catch (e) {
      results.push({ name: f.name, ok: false, error: String(e?.code ?? e) })
    }
  }
  return { ok: results.every((r) => r.ok), results, memoryCount: manifest.memoryCount }
}
