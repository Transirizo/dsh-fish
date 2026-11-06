# 验证入口与证据边界

## 单元/模块安全回归

```bash
node --test packages/dsh-fish-v3/test/*.test.mjs
```

当前109个用例涵盖调用者记忆范围、凭据轮换、独立聊天setup、配置校验、持久去重、未知结果、锁、卸载竞态、快照恢复拒绝路径。

## 离线桩模拟（非原生DSH验收）

```bash
node packages/dsh-fish-v3/sim/offline.mjs
```

该入口只验证模块逻辑，不证明DSH原生会话、真实模型、平台或外发成功。

## 原生DSH回环诊断（真实模型，可消耗提供方额度）

前置：存在仅供诊断、已安装当前插件源码的兼容DSH profile，默认模型可用；不要指定正在运行的工程profile。

```bash
node packages/dsh-fish-v3/sim/native-dsh.mjs fish-v3 3083
```

此脚本不创建/改写profile、不重启当前GUI；在回环端口启动临时原生DSH，使用独立合成数据及进程内合成凭据，覆盖健康、鉴权、真实平台模式拒绝、私聊模型回合、持久去重、内容冲突与群聊隔离。结束后停止子进程。报告在gitignored data/native-dsh/run-*/report.json，启动日志含本次GUI访问凭据，必须按私有诊断数据保留。

脚本核对健康dataDir必须等于本次随机run目录，避免端口被占用时误测其他实例；不匹配立即失败，不发送模型请求。

## 结果分类

单元PASS不能替代原生回合PASS；原生合成回合PASS也不能替代QQ/NapCat收发、主机权限隔离或真实发送授权验收。行为质量必须独立评分，不能用生成模型自评代替。

## 待验证

实际ENOSPC/断电、跨服务器单活、完整实例迁移、平台账号链、OS/文件/网络/Remote管理面隔离、生产GUI受控更新。
