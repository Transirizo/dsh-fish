import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { registerSay } from '../lib/say.js'

await mkdir(path.resolve('data/test-say'), { recursive: true })
const event = (over = {}) => ({ mode: 'simulation', account: 'fixture', channel: 'one', scene: 'private', eventId: 'ev-1', sender: '合成人物', text: '你好', ...over })
async function fixture(options = {}) {
 const dir = options.dir ?? await mkdtemp(path.resolve('data/test-say/case-'))
 let route, calls = 0, restrictions = 0, disposed = 0
 const agents = {
  get() {},
  async create(opts) {
   calls++
   if (options.creationGate) { options.started(); await options.creationGate }
   if (options.fail) throw new Error('synthetic-private-error-do-not-leak')
   await opts.setup({ tools: { definitions: () => [{name:'bash'}], restrict: (f) => { assert.deepEqual(f.deny,['bash']); restrictions++; return () => {} }, guard: () => () => {} }, effect: (f) => f() })
   const events = []
   const agent = { status:'idle', session: { get seq(){return events.length}, eventAt(i){return events[i]} },
    followup() { if (options.followupFail) throw Error('synthetic-failure'); events.push({type:'assistant/message', data:{message:{content:[{type:'text',text:'合成回复'}]}}}, {type:'turn/end',data:{reason:{kind:'completed'}}}) }, whenIdle: async()=>{}, cancel(){} }
   return { agent, dispose:async()=>{disposed++} }
  },
  async resume(opts) { assert.ok(opts.resumeSessionId); return agents.create(opts) },
 }
 const ctx = { agents, agentPresets:{mount:async(_ctx,id)=>{assert.equal(id,'fish-chat')}}, agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'stub'})}, sessions:{flush:async()=>{}}, webServer:{register(r){route=r;return()=>{route=null}}} }
 const off = registerSay(ctx,{token:()=> 'synthetic-test-token',dataDir:dir})
 return { off, dir, get disposed(){return disposed}, get calls(){return calls}, get restrictions(){return restrictions}, async request(body,token='synthetic-test-token',method='POST') {
  const req=Readable.from([Buffer.from(typeof body==='string'?body:JSON.stringify(body))]); req.method=method; req.headers={authorization:`Bearer ${token}`}
  let status, value; await route.handler(req,{writeHead(s){status=s},end(t){value=JSON.parse(t)}}); return {status,value}
 } }
}
test('say rejects credentials, methods, malformed JSON and live input',async()=>{
 const f=await fixture()
 assert.equal((await f.request(event(),'wrong')).status,401)
 assert.equal((await f.request(event(),undefined,'GET')).status,405)
 assert.equal((await f.request('{')).status,400)
 assert.equal((await f.request(event({mode:'live'}))).status,403)
 assert.equal(f.calls,0); await f.off()
})
test('say requires scoped identity and blocks secrets',async()=>{
 const f=await fixture()
 assert.equal((await f.request(event({account:''}))).status,400)
 assert.equal((await f.request(event({text:'token: abcdefghijklmnop'}))).status,400)
 assert.equal(f.calls,0); await f.off()
})
test('say drives native handle, denies tools, persists duplicate outcome',async()=>{
 const f=await fixture()
 const one=await f.request(event()); const two=await f.request(event())
 assert.equal(one.status,200); assert.equal(one.value.delivered,false)
 assert.deepEqual(two,one); assert.equal(f.calls,1); assert.equal(f.restrictions,1)
 await f.off()
})


test('相同事件ID内容变化返回409，不重新驱动模型',async()=>{
 const f=await fixture()
 await f.request(event())
 const conflict=await f.request(event({text:'被替换的内容'}))
 assert.equal(conflict.status,409)
 assert.equal(conflict.value.error,'event-id-content-conflict')
 assert.equal(f.calls,1)
 await f.off()
})
test('失败挂起且重试不重复执行，不泄漏内部错误',async()=>{
 const f=await fixture({fail:true})
 const failure=await f.request(event())
 assert.equal(failure.status,503)
 assert.doesNotMatch(JSON.stringify(failure),/synthetic-private-error/)
 assert.equal((await f.request(event())).status,409)
 assert.equal(f.calls,1)
 await f.off()
 const restarted=await fixture({dir:f.dir})
 assert.equal((await restarted.request(event())).status,409)
 assert.equal(restarted.calls,0)
 await restarted.off()
})
test('成功结果重启后仍去重，账号作用域独立',async()=>{
 const f=await fixture()
 const first=await f.request(event())
 await f.off()
 const restarted=await fixture({dir:f.dir})
 assert.deepEqual(await restarted.request(event()),first)
 assert.equal(restarted.calls,0)
 assert.equal((await restarted.request(event({account:'another-fixture'}))).status,200)
 assert.equal(restarted.calls,1)
 await restarted.off()
})
test('null及数组请求安全拒绝',async()=>{
 const f=await fixture()
 for(const body of [null,[],42]) assert.equal((await f.request(body)).status,400)
 assert.equal(f.calls,0)
 await f.off()
})


test('存储路径不可写时响应503且不驱动模型',async()=>{
 const root=await mkdtemp(path.resolve('data/test-say/storage-failure-'))
 const f=await fixture({dir:root})
 await mkdir(path.join(root,'say-ledger-v1.json.tmp')) // 模拟临时账本写入失败，不依赖当前用户权限。
 const r=await f.request(event())
 assert.equal(r.status,503)
 assert.equal(f.calls,0)
 assert.equal((await f.request(event({eventId:'ev-2'}))).status,429)
 await f.off()
})
test('Agent在followup失败后也会释放，不遗留后台句柄',async()=>{
 const f=await fixture({followupFail:true})
 assert.equal((await f.request(event())).status,503)
 assert.equal(f.calls,1)
 assert.equal(f.disposed,1)
 await f.off()
 assert.equal(f.disposed,1)
})


test('卸载等待在途创建清理后才释放账本锁',async()=>{
 let releaseCreation, markStarted
 const creationGate=new Promise(r=>{releaseCreation=r})
 const started=new Promise(r=>{markStarted=r})
 const f=await fixture({creationGate,started:markStarted})
 const request=f.request(event())
 await started
 let unloaded=false
 const unloading=f.off().then(()=>{unloaded=true})
 await Promise.resolve()
 assert.equal(unloaded,false)
 await assert.rejects(()=>fixture({dir:f.dir}),/EEXIST/)
 releaseCreation()
 assert.equal((await request).status,503)
 await unloading
 assert.equal(f.disposed,1)
 const fresh=await fixture({dir:f.dir})
 assert.equal((await fresh.request(event())).status,409)
 assert.equal(fresh.calls,0)
 await fresh.off()
})

test('群聊未点名沉默且不调模型，点名才回复',async()=>{
 const f=await fixture()
 const quiet=await f.request(event({scene:'group',eventId:'g-quiet'}))
 assert.equal(quiet.status,200); assert.equal(quiet.value.silent,true); assert.equal(f.calls,0)
 const spoken=await f.request(event({scene:'group',eventId:'g-mention',mentioned:true}))
 assert.equal(spoken.status,200); assert.equal(spoken.value.response,'合成回复'); assert.equal(f.calls,1)
 await f.off()
})
