#!/usr/bin/env node
/** 实际DSH回环验收：不创建/修改profile，必须显式指定已装此bundle的诊断profile。 */
import {spawn} from 'node:child_process'
import {mkdir,mkdtemp,writeFile,readFile,open} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import path from 'node:path'

const profile=process.argv[2], port=Number(process.argv[3]??3083)
if(!profile||!Number.isInteger(port)||port<1024||port>65535){console.error('用法：node sim/native-dsh.mjs <已安装插件的诊断profile> [回环端口]');process.exit(2)}
const root=path.resolve('data/native-dsh')
await mkdir(root,{recursive:true,mode:0o700})
const run=await mkdtemp(path.join(root,'run-'))
const state=path.join(run,'state'), token=randomBytes(32).toString('hex')
await writeFile(path.join(run,'overlay.yml'),`- id: dsh-fish-v3\n  config:\n    dataDir: ${JSON.stringify(state)}\n    ingressCredentialRef: DSH_FISH_DIAGNOSTIC_TOKEN\n    sendingEnabled: false\n    proactiveEnabled: false\n`,{mode:0o600})
const log=await open(path.join(run,'boot.log'),'w',0o600)
const child=spawn('dsh',['--profile',profile,'--patch',path.join(run,'overlay.yml'),'--host','127.0.0.1','--port',String(port),'--no-open'],{env:{...process.env,DSH_FISH_DIAGNOSTIC_TOKEN:token},stdio:['ignore',log.fd,log.fd]})
const exit=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',()=>resolve({code:127}))})
const checks=[]
function check(name,pass){checks.push({name,pass});console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)throw Error(name)}
const url=`http://127.0.0.1:${port}/dsh-fish-v3`
async function send(body,auth=token){const r=await fetch(url+'/say',{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(75000)});return{status:r.status,result:await r.json()}}
let ok=false
try {
 // 只对启动就绪做有界探测；不轮询模型任务或后台job。
 const deadline=Date.now()+20000
 let health
 while(Date.now()<deadline){try{health=await fetch(url+'/health',{signal:AbortSignal.timeout(500)});if(health.ok)break}catch{};await new Promise(r=>setTimeout(r,200))}
 check('诊断DSH健康',health?.ok===true)
 const healthValue=await health.json()
 check('诊断实例身份与独立数据目录',healthValue.dataDir===state)
 const body={mode:'simulation',account:'fixture',scene:'private',channel:'native',sender:'合成测试员',eventId:'native-1',text:'这是一条合成测试。只回复“原生回合通过”，不要调用工具。'}
 check('错误凭据拒绝',(await send(body,'invalid')).status===401)
 check('真实平台模式拒绝',(await send({...body,mode:'live'})).status===403)
 const first=await send(body)
 check('真实DSH模型回合',first.status===200&&first.result.response.length>0&&first.result.delivered===false)
 check('重复事件不重跑',JSON.stringify(await send(body))===JSON.stringify(first))
 check('内容冲突拒绝',(await send({...body,text:'替换内容'})).status===409)
 const group=await send({...body,scene:'group',channel:'group',eventId:'native-group'})
 check('群聊会话隔离',group.status===200&&group.result.sessionId!==first.result.sessionId)
 const ledger=JSON.parse(await readFile(path.join(state,'say-ledger-v1.json'),'utf8'))
 check('账本持久完成',Object.values(ledger.events).filter(e=>e.status==='completed').length===2)
 ok=true
} catch(err){console.error('验收失败：',err.message)} finally {
 child.kill('SIGTERM')
 const ended=await Promise.race([exit,new Promise(resolve=>{const t=setTimeout(()=>resolve(null),5000);t.unref()})])
 if(!ended){child.kill('SIGKILL');await exit;ok=false;checks.push({name:'优雅关闭',pass:false})}
 await log.close()
 await writeFile(path.join(run,'report.json'),JSON.stringify({profile,port,ok,checks,realPlatform:false,externalDelivery:false},null,2),{mode:0o600})
 console.log(`诊断报告：${path.join(run,'report.json')}（私有运行输出，不入Git）`)
}
process.exitCode=ok?0:1
