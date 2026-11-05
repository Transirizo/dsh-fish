import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resolveIngressToken} from '../lib/ingress-credentials.js'

test('凭据每次重新解析支持轮换，无缓存',async()=>{
 let current='a'.repeat(32), calls=0
 const credentials={resolve:async(ref)=>{assert.equal(ref,'DSH_FISH_TEST_TOKEN');calls++;return{value:current,source:'synthetic'}}}
 assert.equal(await resolveIngressToken(credentials,'DSH_FISH_TEST_TOKEN'),current)
 current='b'.repeat(32)
 assert.equal(await resolveIngressToken(credentials,'DSH_FISH_TEST_TOKEN'),current)
 assert.equal(calls,2)
})
test('禁止引用不相关凭据',async()=>{
 let called=false
 assert.equal(await resolveIngressToken({resolve:async()=>{called=true}},'OPENAI_API_KEY'),undefined)
 assert.equal(called,false)
})
test('凭据缺失、失败、过短或超长时默认拒绝',async()=>{
 for(const value of [undefined,'','short','a'.repeat(513)]) assert.equal(await resolveIngressToken({resolve:async()=>({value})},'DSH_FISH_TEST_TOKEN'),undefined)
 assert.equal(await resolveIngressToken({resolve:async()=>{throw Error('synthetic secret error')}},'DSH_FISH_TEST_TOKEN'),undefined)
 assert.equal(await resolveIngressToken(undefined,'DSH_FISH_TEST_TOKEN'),undefined)
})
