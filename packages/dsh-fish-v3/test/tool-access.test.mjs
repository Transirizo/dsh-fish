import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import { createMemory } from '../lib/memory.js'
import { registerTools } from '../lib/tools.js'
import { createToolAccess } from '../lib/tool-access.js'
import { browse } from '../lib/browse.js'

async function setup() {
 await mkdir(path.resolve('data/test-access'),{recursive:true})
 const dir=await mkdtemp(path.resolve('data/test-access/case-'))
 const memory=createMemory(dir), defs=new Map(), access=createToolAccess()
 registerTools({tools:{register(d){defs.set(d.name,d);return()=>{}}}},{memory,config:{},dataDir:dir,access})
 return {memory,defs,access}
}
const caller=(id)=>({agent:{id}})
test('记忆工具拒绝缺失调用者，不能通过参数声称自己是管理员',async()=>{
 const {defs,memory}=await setup()
 for(const name of ['fish_remember','fish_recall','fish_diary','fish_interest','fish_status']) {
  const out=await defs.get(name).execute({text:'a',verb:'write',scope:'global'})
  assert.match(out.text,/可信调用者/)
 }
 assert.equal(await memory.count(),0)
})
test('模型不能写全局或其他会话，自己的私密记忆不进入其他会话',async()=>{
 const {defs,memory}=await setup(), a=caller('a'), b=caller('b')
 const remember=defs.get('fish_remember')
 assert.equal((await remember.execute({scope:'global',text:'越权咖啡'},a)).ok,false)
 assert.equal((await remember.execute({text:'仅A的咖啡'},a)).ok,true)
 assert.equal((await defs.get('fish_recall').execute({query:'咖啡'},b)).found,false)
 assert.equal((await defs.get('fish_recall').execute({query:'咖啡'},a)).found,true)
 assert.equal((await memory.list())[0].scope,'session:a')
})
test('日记与兴趣按调用者隔离并拒绝兴趣秘密',async()=>{
 const {defs}=await setup(), a=caller('a'), b=caller('b')
 await defs.get('fish_diary').execute({verb:'write',text:'A私密日记'},a)
 assert.doesNotMatch((await defs.get('fish_diary').execute({verb:'read'},b)).text,/A私密/)
 await defs.get('fish_interest').execute({verb:'add',topic:'A的独特兴趣'},a)
 assert.doesNotMatch((await defs.get('fish_interest').execute({verb:'list'},b)).text,/独特兴趣/)
 assert.equal((await defs.get('fish_interest').execute({verb:'add',topic:'token: abcdefghijklmnop'},a)).ok,false)
})
test('宿主绑定可恢复同一会话范围，模型工具不接受任意范围',async()=>{
 const access=createToolAccess(), a={id:'one'}, b={id:'two'}
 access.bind(a,'account:group:fixture'); access.bind(b,'account:group:fixture')
 assert.equal(access.scopeOf({agent:a}),access.scopeOf({agent:b}))
 assert.throws(()=>access.bind(a,'new'))
})
test('未配置受限抓取代理时不允许回退到系统 fetch',async()=>{
 const {defs}=await setup()
 assert.match((await defs.get('fish_browse').execute({url:'https://example.com'},caller('a'))).text,/联网已关闭/)
 assert.deepEqual(await browse('https://example.com'),{ok:false,error:'restricted-fetch-unavailable'})
})
