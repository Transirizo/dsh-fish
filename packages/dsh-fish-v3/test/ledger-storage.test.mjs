import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,readFile,symlink,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {acquireLedgerLock,writeLedger} from '../lib/ledger-storage.js'
await mkdir(path.resolve('data/test-locks'),{recursive:true})
const dir=()=>mkdtemp(path.resolve('data/test-locks/case-'))
test('本机同目录只能持有一把锁，正常释放后可重获',async()=>{
 const d=await dir(),release=acquireLedgerLock(d)
 assert.throws(()=>acquireLedgerLock(d),/EEXIST/)
 release();release()
 acquireLedgerLock(d)()
})
test('锁归属变化后拒绝删除，不抢占遗留锁',async()=>{
 const d=await dir(),release=acquireLedgerLock(d)
 await writeFile(path.join(d,'say-ledger.lock'),JSON.stringify({nonce:'someone-else'}))
 assert.throws(()=>release(),/归属/)
 assert.throws(()=>acquireLedgerLock(d),/EEXIST/)
})
test('账本写入可回读且拒绝临时文件符号链接',async()=>{
 const d=await dir(),p=path.join(d,'ledger.json')
 writeLedger(p,{version:1})
 assert.deepEqual(JSON.parse(await readFile(p,'utf8')),{version:1})
 const other=path.join(d,'preserved');await writeFile(other,'keep')
 await symlink(other,p+'.tmp')
 assert.throws(()=>writeLedger(p,{version:2}))
 assert.equal(await readFile(other,'utf8'),'keep')
})
