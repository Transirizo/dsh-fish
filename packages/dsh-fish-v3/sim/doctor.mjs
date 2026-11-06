#!/usr/bin/env node
/** 只读诊断：可选一个仅含本插件字段的JSON配置，不读取全profile/凭据/会话。 */
import {readFile,stat} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {inspectConfig,inspectRuntime} from '../lib/preflight.js'
const root=fileURLToPath(new URL('../',import.meta.url))
const checks=[]
const record=(name,pass,detail)=>{checks.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}${detail?'：'+detail:''}`)}
const v=spawnSync('dsh',['--version'],{encoding:'utf8'})
const version=v.status===0?v.stdout.trim():''
const runtime=inspectRuntime(process.version,version)
record('Node已验证版本范围',runtime.node,process.version)
record('DSH精确已验证版本',runtime.dsh,version||'未检测到')
for(const file of ['index.js','client.js','cordis.patch.yml','lib/say.js','lib/chat-scope.js','lib/ledger-storage.js','icon.svg','locale/zh.json']){
 let exists=false;try{exists=(await stat(path.join(root,file))).isFile()}catch{}
 record('发布文件 '+file,exists)
}
let config={}
if(process.argv[2]){
 try{config=JSON.parse(await readFile(process.argv[2],'utf8'))}catch{record('配置JSON',false,'无法读取或格式错误');process.exitCode=1}
}
const report=inspectConfig(config)
record('插件配置校验',report.ok,report.invalidFields.length?'无效字段：'+report.invalidFields.join(', '):undefined)
for(const warning of report.warnings)console.log('WARN '+warning)
console.log('NOT RUN 主机/网络/Remote管理面隔离；真实平台收发；完整迁移与生产切流。')
if(checks.some(c=>!c.pass))process.exitCode=1
