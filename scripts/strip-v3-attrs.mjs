#!/usr/bin/env node
/**
 * strip-v3-attrs.mjs —— 把 dsh-fish-v3 从某个 DSH profile 里摘掉（只动归属，不动数据）。
 *
 * 切换上游 @ssamurias/dsh-fish 之前必须做：v3 的依赖是 `file:/pkg.tgz`，
 * 那个包在镜像里早没了，pnpm 任何一次 install 都会因为它失败；bundles 里的
 * `dsh-fish-v3` 也会让下一次启动去 import 一个不存在的包。
 *
 * 只改两处：
 *   - package.json：dependencies['dsh-fish-v3']、dsh.profile.bundles 里的项；
 *   - cordis.patch.yml：整段 `- id: dsh-fish-v3` 的覆盖行。
 *
 * 不删 node_modules、不删 ~/.dsh/dsh-fish-v3 的数据；改前各留一份 .bak-<时间>。
 *
 * 用法：node scripts/strip-v3-attrs.mjs /home/node/.dsh/profiles/web
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('用法：node scripts/strip-v3-attrs.mjs <profile 目录>')
  process.exit(2)
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const changes = []

function backup(file) {
  const out = `${file}.bak-${stamp}`
  copyFileSync(file, out)
  return out
}

const pkgFile = join(dir, 'package.json')
if (existsSync(pkgFile)) {
  let changed = false
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  } catch (err) {
    console.error(`package.json 解析失败：${err?.message ?? err}`)
    process.exit(1)
  }
  if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, 'dsh-fish-v3')) {
    delete pkg.dependencies['dsh-fish-v3']
    changed = true
  }
  const bundles = pkg?.dsh?.profile?.bundles
  if (Array.isArray(bundles) && bundles.includes('dsh-fish-v3')) {
    pkg.dsh.profile.bundles = bundles.filter((b) => b !== 'dsh-fish-v3')
    changed = true
  }
  if (changed) {
    const bak = backup(pkgFile)
    writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
    changes.push(`package.json（备份 ${bak}）`)
  }
}

const patchFile = join(dir, 'cordis.patch.yml')
if (existsSync(patchFile)) {
  const text = readFileSync(patchFile, 'utf8')
  const lines = text.split(/\r?\n/)
  const out = []
  let skip = false
  let changed = false
  for (const line of lines) {
    if (/^- id:\s*dsh-fish-v3\s*$/.test(line)) {
      skip = true
      changed = true
      continue
    }
    if (skip) {
      if (/^- /.test(line)) skip = false
      else continue
    }
    out.push(line)
  }
  if (changed) {
    const bak = backup(patchFile)
    const next = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n'
    writeFileSync(patchFile, next)
    changes.push(`cordis.patch.yml（备份 ${bak}）`)
  }
}

if (!changes.length) console.log(`没有 dsh-fish-v3 的归属需要摘：${dir}`)
else {
  console.log(`已摘掉 dsh-fish-v3 的归属：${dir}`)
  for (const c of changes) console.log(`  - ${c}`)
}
