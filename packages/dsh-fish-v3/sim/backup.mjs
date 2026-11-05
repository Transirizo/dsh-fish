#!/usr/bin/env node
/**
 * backup.mjs —— 可执行的备份/恢复/校验工具（映射「fish backup/restore/verify」操作语义）。
 *
 * 用法：
 *   node sim/backup.mjs backup  <dataDir> <backupRoot>
 *   node sim/backup.mjs restore <snapshotDir> <targetDir>
 *   node sim/backup.mjs verify  <snapshotDir>
 *
 * 退出码 0=成功；1=失败。恢复是覆盖式、幂等（不追加，故不产生重复记录）；
 * 目标目录默认拒绝非空且含无关文件时（除 memory.jsonl/manifest.json 外）报错，避免误覆盖。
 */
import { readdir } from 'node:fs/promises'
import { backup, restore, verify } from '../lib/backup.js'

async function assertEmptyish(targetDir) {
  let entries = []
  try { entries = await readdir(targetDir) } catch (e) { if (e?.code === 'ENOENT') return; throw e }
  const foreign = entries.filter((e) => e !== 'memory.jsonl' && e !== 'manifest.json')
  if (foreign.length) {
    throw new Error(`目标目录非空且含无关文件（${foreign.join(', ')}），拒绝覆盖；请指定隔离的空目录`)
  }
}

const [cmd, ...args] = process.argv.slice(2)

try {
  if (cmd === 'backup') {
    const [dataDir, backupRoot] = args
    if (!dataDir || !backupRoot) throw new Error('backup <dataDir> <backupRoot>')
    const m = await backup(dataDir, backupRoot)
    console.log(`备份完成：${m.snapshotDir}（memoryCount=${m.memoryCount}）`)
  } else if (cmd === 'restore') {
    const [snapshotDir, targetDir] = args
    if (!snapshotDir || !targetDir) throw new Error('restore <snapshotDir> <targetDir>')
    await assertEmptyish(targetDir)
    const m = await restore(snapshotDir, targetDir)
    console.log(`恢复完成：${targetDir}（memoryCount=${m.memoryCount}）`)
  } else if (cmd === 'verify') {
    const [snapshotDir] = args
    if (!snapshotDir) throw new Error('verify <snapshotDir>')
    const v = await verify(snapshotDir)
    console.log(v.ok ? `校验通过（memoryCount=${v.memoryCount}）` : `校验失败：${JSON.stringify(v.results)}`)
    if (!v.ok) process.exit(1)
  } else {
    throw new Error(`未知命令：${cmd}。可用：backup | restore | verify`)
  }
} catch (err) {
  console.error(`错误：${err?.message ?? err}`)
  process.exit(1)
}
