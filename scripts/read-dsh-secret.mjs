#!/usr/bin/env node
/**
 * read-dsh-secret.mjs —— 从 DSH 的 .credentials.yaml 里读出
 * `client-connection/browser-session` 的签名密钥（base64url，32 字节）。
 *
 * 桥用它在宿主机上离线铸造 `dsh-auth-…` cookie，才能调用上游 dsh-fish 的
 * `/dsh-fish/*`（那条路由在 DSH 的 connection 信任栅栏后面）。
 *
 * 只输出密钥本身，不写文件、不打印其余凭据。
 *
 * 用法：node scripts/read-dsh-secret.mjs [/home/node/.dsh/.credentials.yaml]
 */
import { readFileSync } from 'node:fs'

const file = process.argv[2] || '/home/node/.dsh/.credentials.yaml'
let text
try {
  text = readFileSync(file, 'utf8')
} catch (err) {
  console.error(`读不到 ${file}：${err?.message ?? err}`)
  process.exit(2)
}

const lines = text.split(/\r?\n/)
for (let i = 0; i < lines.length; i++) {
  const head = /^(\s*)client-connection\/browser-session:\s*$/.exec(lines[i])
  if (!head) continue
  const base = head[1].length
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]
    if (!line.trim()) continue
    const indent = /^\s*/.exec(line)[0].length
    if (indent <= base) break
    const m = /^\s*secret:\s*['"]?([A-Za-z0-9_-]{20,})['"]?\s*$/.exec(line)
    if (m) {
      process.stdout.write(m[1])
      process.exit(0)
    }
  }
}
console.error(`没在 ${file} 里找到 client-connection/browser-session 的 secret（DSH 可能还没第一次启动）。`)
process.exit(1)
