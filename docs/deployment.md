# 部署

## 独立 profile 部署（已实现并验证）

### 1. 创建 profile

```bash
mkdir -p $DSH_HOME/profiles/fish-v3
# 写入 package.json / cordis.yml / cordis.patch.yml / pnpm-workspace.yaml
# package.json:
#   dependencies: { "dsh-fish-v3": "link:/path/to/packages/dsh-fish-v3" }   # 开发；生产用 file: tarball
#   dsh.profile.bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-fish-v3"]
# cordis.patch.yml 至少配默认模型：
#   - id: agent-default-model
#     config: { provider: deepseek-official, model: deepseek-v4-pro }

dsh plugin --profile fish-v3 install
```

### 2. 验证组合

```bash
dsh --profile fish-v3 --dump-config          # 组合树含 dsh-fish-v3、模型、无旧版
dsh --profile fish-v3 --dump-config-schema   # 我的 Config 字段已投影（设置页据此生成表单）
```

### 3. 启动与健康检查

```bash
dsh --profile fish-v3 --port 3081 --no-open   # 独立端口，避免与 web profile 的 3080 冲突
curl http://127.0.0.1:3081/dsh-fish-v3/health  # {"ok":true,...,"groupMode":...,"sendingEnabled":...}
```

### 4. 配置（设置页）

DSH 从插件的 Config schema **自动生成设置表单**（`SettingsForms` autoGenerate）。用户在
`http://127.0.0.1:3081/?token=…` 的 Plugins 设置里改 groupMode / sending / proactive / net 等，
底层写 profile 的 cordis.patch.yml → 插件重载 → 配置生效。

## 状态

- 已实现并验证：独立 profile 创建、启动、健康检查、配置覆盖生效。
- 生产注意：用 `file:` tarball 替代 `link:`（快照不可变）；端口与默认模型按部署取值。
- 未验证：浏览器端设置页渲染（机制与 schema 已核实，页面需在浏览器确认）、真实 QQ 桥接。
