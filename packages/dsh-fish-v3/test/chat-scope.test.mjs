import {test} from 'node:test'
import assert from 'node:assert/strict'
import {setupChatScope,CHAT_TOOLS} from '../lib/chat-scope.js'

test('聊天setup覆盖局部persona、绑定范围并拒绝工程工具',async()=>{
 const sections=[],defs=[],guards=[],cleanup=[],agent={id:'synthetic-agent'}
 let mask
 const ctx={effect(fn){const off=fn();cleanup.push(off);return off},systemPrompt:{section(s){sections.push(s);return()=>{}}},tools:{
 definitions(){return [{name:'bash'},{name:'plugin_manager'}]},restrict(f){mask=f;return()=>{}},
 register(d){defs.push(d);return()=>{}},guard(g){guards.push(g);return()=>{}}
 }}
 const writes=[]
 const memory={append:async(r)=>{writes.push(r);return{id:'test'}},recall:async()=>[],listByType:async()=>[],list:async()=>[]}
 setupChatScope(ctx,agent,{scope:'fixture:private:one',memory,config:{},dataDir:'/unused'})
 assert.match(sections[0].text,/大肥鱼/)
 assert.equal(sections[0].name,'deployment:persona-prefix')
 assert.deepEqual(mask.deny,['bash','plugin_manager'])
 for(const name of ['bash','write','plugin_manager','fish_browse','schedule_create'])assert.ok(guards[0]({name}))
 for(const name of CHAT_TOOLS)assert.equal(guards[0]({name}),undefined)
 await defs.find(d=>d.name==='fish_remember').execute({text:'合成事实'},{agent})
 assert.equal(writes[0].scope,'fixture:private:one')
 for(const off of cleanup.reverse())if(typeof off==='function')off()
})
