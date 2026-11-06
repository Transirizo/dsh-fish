import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, read } from '../lib/config.js'
import { createBudget } from '../lib/budget.js'

test('未实现高风险开关不能仅靠设置为true启用',()=>{
 for(const field of ['biliEnabled','proactiveEnabled']) assert.throws(()=>Config({[field]:true}),field)
 assert.throws(()=>Config({toolsRestrict:false}))
 assert.throws(()=>Config({memoryRetentionDays:1}))
})
test('真实平台回复开关默认关、可显式开启',()=>{
 assert.equal(read(Config({}), 'sendingEnabled', true), false)
 assert.equal(read(Config({sendingEnabled:true}), 'sendingEnabled', false), true)
})
test('联网预算拒绝负数零值无穷和超限配置',()=>{
 for(const value of [-1,0,Infinity,NaN,1001]) assert.throws(()=>Config({netMaxQueriesPerHour:value}))
 assert.throws(()=>Config({netMaxConcurrent:1.5}))
 assert.throws(()=>Config({netMaxBytes:999999999}))
})
test('目录不是伪热更新字段，凭据有secret标记',()=>{
 assert.notEqual(Config.dict.dataDir.meta.volatile,true)
 assert.equal(Config.dict.ingressToken.meta.role,'secret')
 assert.equal(read(Config({}), 'toolsRestrict',false),true)
})
test('动态预算收紧不重置已消费额度或并发计数',()=>{
 let max=3
 const b=createBudget({get maxQueriesPerWindow(){return max},maxConcurrent:0})
 assert.equal(b.acquire().ok,true)
 max=1
 assert.equal(b.acquire().reason,'quota')
 max=2
 assert.equal(b.acquire().ok,true)
 assert.equal(b.stats().count,2)
})
test('运行期非法预算拒绝而不是无限放行',()=>{
 const b=createBudget({maxQueriesPerWindow:NaN})
 assert.equal(b.acquire().reason,'invalid-policy')
})
