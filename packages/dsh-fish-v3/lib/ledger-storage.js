/** 本机入站账本独占锁与fsync写入。不抢占崩溃残留锁，不提供跨服务器fencing。 */
import {constants,openSync,closeSync,writeFileSync,fsyncSync,renameSync,unlinkSync,readFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

export function acquireLedgerLock(dataDir) {
 mkdirSync(dataDir,{recursive:true,mode:0o700})
 const file=path.join(dataDir,'say-ledger.lock')
 const nonce=randomUUID()
 const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
 try {writeFileSync(fd,JSON.stringify({pid:process.pid,nonce}));fsyncSync(fd)} finally {closeSync(fd)}
 let released=false
 return ()=>{
  if(released)return
  const current=JSON.parse(readFileSync(file,'utf8'))
  if(current.nonce!==nonce)throw Error('账本锁归属已变化，拒绝删除')
  // 删除的绝对路径固定为本次已成功创建并校验nonce的锁文件。
  unlinkSync(file);released=true
 }
}
export function writeLedger(file, value) {
 const temporary=file+'.tmp'
 const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW,0o600)
 try {writeFileSync(fd,JSON.stringify(value));fsyncSync(fd)} finally {closeSync(fd)}
 renameSync(temporary,file)
 const directory=openSync(path.dirname(file),constants.O_RDONLY|constants.O_DIRECTORY)
 try {fsyncSync(directory)} finally {closeSync(directory)}
}
