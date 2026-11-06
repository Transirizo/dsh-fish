import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inspectConfig,inspectRuntime} from '../lib/preflight.js'
test('配置诊断不回显秘密或schema内部错误',()=>{
 const secret='synthetic-do-not-output-secret'
 const out=inspectConfig({biliEnabled:true,ingressToken:secret,netMaxConcurrent:-1})
 assert.equal(out.ok,false)
 assert.deepEqual(out.invalidFields,['biliEnabled','netMaxConcurrent'])
 assert.ok(!JSON.stringify(out).includes(secret))
 assert.ok(out.warnings.length>0)
})
test('未知字段与错误根类型拒绝',()=>{
 assert.equal(inspectConfig([]).ok,false)
 assert.equal(inspectConfig({unknownField:1}).ok,false)
 assert.equal(inspectConfig({groupMode:'balanced'}).ok,true)
})
test('未经验证运行时不报告支持',()=>{
 assert.equal(inspectRuntime('v24.22.2','0.2.2-rc.1').dsh,true)
 assert.equal(inspectRuntime('v24.8.0','0.2.2-rc.1').node,false)
 assert.equal(inspectRuntime('v26.0.0','0.2.2-rc.1').node,false)
 assert.equal(inspectRuntime('v24.22.2','0.3.0').dsh,false)
})
