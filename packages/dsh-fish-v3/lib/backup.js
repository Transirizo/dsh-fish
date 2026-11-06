/** 有界记忆快照工具。不是完整DSH实例迁移；源应先静默。 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, lstat, readdir, realpath, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
const MAX_BYTES = 16 * 1024 * 1024
const hash = (b) => createHash('sha256').update(b).digest('hex')

async function safeDirectory(dir, create = false) {
  const absolute = path.resolve(dir)
  let current = path.parse(absolute).root
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    try { const st = await lstat(current); if (!st.isDirectory() || st.isSymbolicLink()) throw Error('目录不能包含符号链接或普通文件') }
    catch (err) { if (err.code !== 'ENOENT' || !create) throw err; await mkdir(current, { mode: 0o700 }) }
  }
  return realpath(absolute)
}
async function boundedRead(file, max = MAX_BYTES) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const st = await handle.stat()
    if (!st.isFile() || st.size > max) throw Error('文件类型或体积不符合限制')
    const b = await handle.readFile()
    if (b.length > max) throw Error('读取体积超限')
    return b
  } finally { await handle.close() }
}
function memoryCount(buffer) {
  const lines = buffer.toString('utf8').split('\n').filter((s) => s.trim())
  for (const line of lines) {
    const r = JSON.parse(line)
    if (!r || typeof r.text !== 'string' || typeof r.scope !== 'string') throw Error('无效记忆记录')
  }
  return lines.length
}
async function loadSnapshot(snapshotDir) {
  const root = await safeDirectory(snapshotDir)
  const m = JSON.parse((await boundedRead(path.join(root, 'manifest.json'), 65536)).toString('utf8'))
  if (m.version !== 1 || !Array.isArray(m.files) || m.files.length > 1 || !Number.isSafeInteger(m.memoryCount) || m.memoryCount < 0) throw Error('不支持或无效的备份清单')
  const buffers = new Map()
  for (const f of m.files) {
    if (f.name !== 'memory.jsonl' || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > MAX_BYTES || !/^[0-9a-f]{64}$/.test(f.sha256)) throw Error('备份路径、体积或校验信息非法')
    const b = await boundedRead(path.join(root, f.name))
    if (b.length !== f.size || hash(b) !== f.sha256 || memoryCount(b) !== m.memoryCount) throw Error('备份完整性校验失败')
    buffers.set(f.name, b)
  }
  if (!m.files.length && m.memoryCount !== 0) throw Error('记录计数不一致')
  return { manifest: m, buffers }
}
export async function backup(dataDir, backupRoot) {
  const source = await safeDirectory(dataDir)
  const root = await safeDirectory(backupRoot, true)
  const snapshotDir = path.join(root, `backup-${Date.now()}-${randomUUID()}`)
  await mkdir(snapshotDir, { mode: 0o700 })
  const files = []; let count = 0
  try {
    const b = await boundedRead(path.join(source, 'memory.jsonl'))
    count = memoryCount(b)
    await writeFile(path.join(snapshotDir, 'memory.jsonl'), b, { flag: 'wx', mode: 0o600 })
    files.push({ name: 'memory.jsonl', size: b.length, sha256: hash(b) })
  } catch (err) { if (err.code !== 'ENOENT') throw err }
  const manifest = { version: 1, createdAt: Date.now(), files, memoryCount: count, exclusions: ['DSH会话日志', '凭据', '平台登录态', '入站账本', '任务'] }
  await writeFile(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
  return { ...manifest, snapshotDir }
}
export async function restore(snapshotDir, targetDir) {
  // 在创建/修改目标之前完整校验，清单文件名严格白名单，不拼接任意输入路径。
  const { manifest, buffers } = await loadSnapshot(snapshotDir)
  const target = await safeDirectory(targetDir, true)
  const entries = await readdir(target)
  if (entries.some((name) => !buffers.has(name))) throw Error('目标非空或包含无关数据，拒绝覆盖')
  for (const name of entries) {
    const existing = await boundedRead(path.join(target, name))
    if (!existing.equals(buffers.get(name))) throw Error('目标已有不同数据，拒绝覆盖')
  }
  for (const [name, b] of buffers) {
    if (entries.includes(name)) continue
    await writeFile(path.join(target, name), b, { flag: 'wx', mode: 0o600 })
  }
  return manifest
}
export async function verify(snapshotDir) {
  try {
    const { manifest } = await loadSnapshot(snapshotDir)
    return { ok: true, results: manifest.files.map((f) => ({ name: f.name, ok: true })), memoryCount: manifest.memoryCount }
  } catch {
    return { ok: false, results: [{ name: 'memory.jsonl', ok: false, error: '备份清单或完整性校验失败' }], memoryCount: 0 }
  }
}
