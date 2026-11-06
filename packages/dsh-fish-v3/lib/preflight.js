/** 无写入的升级前配置检查，不返回配置值或schema原始错误（其内可能含秘密）。 */
import {Config} from './config.js'
export function inspectConfig(config) {
 if(!config||typeof config!=='object'||Array.isArray(config))return{ok:false,invalidFields:['<root>'],warnings:[]}
 const invalidFields=[]
 for(const [key,value] of Object.entries(config)) {
  if(!Object.hasOwn(Config.dict,key)){invalidFields.push(key);continue}
  try{Config({[key]:value})}catch{invalidFields.push(key)}
 }
 const warnings=[]
 if(config.ingressToken)warnings.push('旧明文入口凭据不再参与鉴权，需要受控迁移')
 if(config.ingressCredentialRef===undefined)warnings.push('未显式设置原生入口凭据引用，加载默认引用；未配置时入口拒绝')
 return{ok:invalidFields.length===0,invalidFields,warnings}
}
export function inspectRuntime(nodeVersion,dshVersion) {
 const [major,minor]=nodeVersion.replace(/^v/,'').split('.').map(Number)
 return{node:major===24&&minor>=9,dsh:dshVersion==='0.2.2-rc.1',verifiedDsh:'0.2.2-rc.1'}
}
