import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { registerSay } from '../lib/say.js'

await mkdir(path.resolve('data/test-say'), { recursive: true })
const event = (over = {}) => ({ mode: 'simulation', account: 'fixture', channel: 'one', scene: 'private', eventId: 'ev-1', sender: '合成人物', text: '你好', ...over })
async function fixture() {
 const dir = await mkdtemp(path.resolve('data/test-say/case-'))
 let route, calls = 0, restrictions = 0
 const agents = {
  get() {},
  async create(opts) {
   calls++
   opts.setup({ tools: { definitions: () => [{name:'bash'}], restrict: (f) => { assert.deepEqual(f.deny,['bash']); restrictions++; return () => {} }, guard: () => () => {} }, effect: (f) => f() })
   const events = []
   const agent = { status:'idle', session: { get seq(){return events.length}, eventAt(i){return events[i]} },
    followup() { events.push({type:'assistant/message', data:{message:{content:[{type:'text',text:'合成回复'}]}}}, {type:'turn/end',data:{reason:{kind:'completed'}}}) }, whenIdle: async()=>{}, cancel(){} }
   return { agent, dispose:async()=>{} }
  },
  async resume(opts) { assert.ok(opts.resumeSessionId); return agents.create(opts) },
 }
 const ctx = { agents, agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'stub'})}, sessions:{flush:async()=>{}}, webServer:{register(r){route=r;return()=>{route=null}}} }
 const off = registerSay(ctx,{token:()=> 'synthetic-test-token',dataDir:dir})
 return { off, get calls(){return calls}, get restrictions(){return restrictions}, async request(body,token='synthetic-test-token',method='POST') {
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
