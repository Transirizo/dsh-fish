import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,symlink,readdir} from 'node:fs/promises'
import path from 'node:path'
import {backup,restore,verify} from '../lib/backup.js'
import {createMemory} from '../lib/memory.js'
await mkdir(path.resolve('data/test-backup-security'),{recursive:true})
async function fixture(){const root=await mkdtemp(path.resolve('data/test-backup-security/case-')); const source=path.join(root,'source');await mkdir(source);await createMemory(source).append({scope:'private:a',text:'合成快照'});const m=await backup(source,path.join(root,'snapshots'));return{root,source,snapshot:m.snapshotDir,target:path.join(root,'target')}}
test('篡改路径清单不能写出目标目录',async()=>{
 const f=await fixture(), p=path.join(f.snapshot,'manifest.json'), m=JSON.parse(await readFile(p,'utf8'))
 m.files[0].name='../escape';await writeFile(p,JSON.stringify(m))
 await assert.rejects(()=>restore(f.snapshot,f.target));assert.equal((await verify(f.snapshot)).ok,false)
 assert.ok(!(await readdir(f.root)).includes('escape'))
})
test('损坏备份拒绝恢复，现有目标不变',async()=>{
 const f=await fixture();await mkdir(f.target);await writeFile(path.join(f.target,'keep'),'必须保留')
 await writeFile(path.join(f.snapshot,'memory.jsonl'),'坏数据')
 await assert.rejects(()=>restore(f.snapshot,f.target))
 assert.equal(await readFile(path.join(f.target,'keep'),'utf8'),'必须保留')
})
test('有效备份不覆盖目标已有的不同记忆',async()=>{
 const f=await fixture();await mkdir(f.target);await writeFile(path.join(f.target,'memory.jsonl'),'现有内容')
 await assert.rejects(()=>restore(f.snapshot,f.target));assert.equal(await readFile(path.join(f.target,'memory.jsonl'),'utf8'),'现有内容')
})
test('目标符号链接目录拒绝，源快照不能通过符号链接读取',async()=>{
 const f=await fixture();await mkdir(f.target);const alias=path.join(f.root,'alias');await symlink(f.target,alias)
 await assert.rejects(()=>restore(f.snapshot,alias))
 const fileAlias=path.join(f.source,'linked');await symlink(path.join(f.snapshot,'memory.jsonl'),fileAlias)
 // 目录级别的链接也必须拒绝。
 const dirAlias=path.join(f.root,'snapshot-alias');await symlink(f.snapshot,dirAlias)
 assert.equal((await verify(dirAlias)).ok,false)
})
test('旧版或不兼容清单拒绝而不改目标',async()=>{
 const f=await fixture(),p=path.join(f.snapshot,'manifest.json'),m=JSON.parse(await readFile(p,'utf8'));m.version=999;await writeFile(p,JSON.stringify(m))
 await assert.rejects(()=>restore(f.snapshot,f.target))
})
