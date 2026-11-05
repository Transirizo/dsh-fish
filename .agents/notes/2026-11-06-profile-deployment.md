# Note: 独立 profile 部署与生产测试（2026-11-06）

- ID: note-2026-11-06-profile-deployment
- 模块: 部署
- 状态: active

## 目标

把 `dsh-fish-v3` 部署到独立 profile（避开旧版 fish/relay 与 `/bridge` 悬空依赖），并验证配置在生产环境生效。

## 步骤与证据（均已执行）

1. 创建 `/home/node/.dsh/profiles/fish-v3/`：
   - `package.json`：`dependencies: { dsh-fish-v3: "link:/workspace/create/packages/dsh-fish-v3" }`，
     `dsh.profile.bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-fish-v3"]`。
   - `cordis.yml`（空）、`cordis.patch.yml`（仅 `agent-default-model → deepseek-official/deepseek-v4-pro`）、
     `pnpm-workspace.yaml`（hoisted）。
2. `dsh plugin --profile fish-v3 install` → 依赖装好。
3. `dsh --profile fish-v3 --dump-config` → 组合树含 `dsh-fish-v3`、模型 `deepseek-v4-pro`、无旧版 fish/relay。
4. `--dump-config-schema` → 我的 Config 字段（dataDir/groupMode/sendingEnabled/netMaxQueriesPerHour…）已投影，
   设置页据此自动生成表单（`SettingsForms` 的 `autoGenerate` 默认 true）。
5. 启动 `dsh --profile fish-v3 --port 3081 --no-open` → 启动成功（`dsh web: http://127.0.0.1:3081/?token=…`）。
6. `GET /dsh-fish-v3/health` → `{"ok":true,...,"groupMode":"balanced","sendingEnabled":false,"proactiveEnabled":false,"memoryCount":3}`。
7. 配置覆盖测试：patch 里加 `groupMode: active` → 重启后健康输出变 `"groupMode":"active"`（已还原为默认）。

## 发现并修复的 bug

- 健康路由原本用 `ctx.get('webServer')`，而 webServer 在插件 apply 时未必就绪 → 路由静默不注册。
  改为把 `webServer` 加进 `inject`、`ctx.webServer.register` 直连。修复后健康端点正常响应。

## 结论

独立 profile 部署 + 配置生效链路（设置页底层 = 写 cordis.patch.yml → 插件重载 → 配置生效）已验证。

## 剩余

- 生产部署用 tarball 替代 `link:`（`file:` 是拷贝快照，源码改动不同步，需 `link:` 才能热同步）。
- 设置页的浏览器端渲染未直接观察（需在 `http://127.0.0.1:3081/?token=…` 打开确认），机制与 schema 投影均已核实。
- 真实 QQ 桥接仍需账号授权。
