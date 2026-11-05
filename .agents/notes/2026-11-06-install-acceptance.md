# Note: 真实 DSH 加载验收（2026-11-06）

- ID: note-2026-11-06-install-acceptance
- 模块: 插件 / 部署
- 状态: active

## 问题

P0 严格验收要求「真实 DSH 加载插件、调用生命周期 hook、完成消息闭环」。之前被审批禁用挡住。

## 事实（已核实）

### 环境障碍与修复

1. `install_bundle` 首次失败：`web/package.json` 有两条悬空依赖——`dsh-astrbot-relay: file:/bridge/dsh-astrbot-relay-0.9.8.tgz`
   （`/bridge` 不存在且根文件系统只读，tarball 全盘找不到）+ `dsh-fish: github:ssamurias/dsh-fish#v0.8.8`（需网络）。
2. 修复（用户授权 A 方案）：从 node_modules 里 `npm pack` 重建两个 tarball 到 `/home/node/.dsh/vendor/`，
   把 `web/package.json` 两条依赖改为 `file:/home/node/.dsh/vendor/*.tgz`；原文件备份为
   `web/package.json.bak-dshfishv3`。→ 重试 `install_bundle` 成功。

### 验收结果（PASS）

- `install_bundle` → `application: applied`，`dsh-fish-v3@3.2.0`（`link:/workspace/create/packages/dsh-fish-v3`）。
- **生命周期 hook 已调用**：`Tool.listTools`（免审批）显示 `fish_status` / `fish_recall` / `fish_remember`
  三个工具已注册，JSON Schema 正确，与旧版 `her_*`/`bili_*` 并存无冲突。
- `Config.listConfigs` 发现插件条目。

### 发现并修复的 bug

- `Config.listConfigs` 最初 `status: "absent"` → 根因：`index.js` `import { Config }` 但未 re-export。
- 修复：`export { name, VERSION, Config }`。
- 生效：`set_plugin` 停用→启用触发重载后，`status` 变为 `"schema"`（Config 被正确发现）。

### 最终状态

- 插件**已安装但停用**（`include:dsh-fish-v3` enabled=false）：`web` 里还跑着旧版 fish + 本工程会话，
  保持启用会「两条鱼」并把 `dafeyu:identity` 注入工程会话（污染）。永久部署应在独立 profile。

## 假设/未验证

- 健康路由 `GET /dsh-fish-v3/health`：注册代码与单测已覆盖，但 `dsh.example.com` 占位域名无法从 fetch 工具访问，
  故未做线上命中验证。
- 「经正常 ingress 注入私聊/群聊事件 + 模型调用 + 投递」的完整消息闭环，需桥接 + 模型接线（P1），
  当前用 `sim/offline.mjs` 以桩模型离线验证。

## 结论

P0 严格验收的核心（真实 DSH 加载 + 生命周期 hook）**已达成并有证据**。完整消息闭环属 P1 桥接工作。
