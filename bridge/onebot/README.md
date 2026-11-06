# 大肥鱼 OneBot 桥（NapCat）

独立进程，**不在 DSH 插件里**。只做协议转换与发送授权，不持有模型、记忆或身份。

```text
NapCat（HTTP 上报）→ 桥（签名校验、允许名单、去重、群聊 @ 过滤）
                    → DSH /say（v3 或上游 dsh-fish，真实模型）
                    ↓
NapCat（HTTP API send_*_msg）← 桥（发送闸：开关、冷却、日上限）
```

## 两种后端

桥同时支持两种 `/say`，由 `FISH_PROTOCOL` 选择，默认 `auto`（先看 URL，再问 `/dsh-fish-v3/health` 与 `/dsh-fish/whoami`）。
**本仓库的 `deploy/` 脚本现在默认装上游、用 `dsh-fish`；v3 只留给旧栈和回滚。**

| | v3（现状，默认） | 上游 `@ssamurias/dsh-fish` 0.9.x |
|---|---|---|
| 入站 | `POST /dsh-fish-v3/say` | `POST /dsh-fish/say` |
| 鉴权 | `FISH_SAY_TOKEN`（Bearer，DSH 凭据 `DSH_FISH_INGRESS_TOKEN`） | DSH 会话 cookie（桥用 `browser-session` 密钥离线铸造） |
| 群聊未 @ | 交给插件 `groupMode` 判，插件返回 silent | **桥侧丢弃**（`FISH_GROUP_REQUIRE_AT`，默认开） |
| 回话来源 | 接口同步返回 `response` | `herReply` / `said`；普通聊天正文需读会话落盘（上游 issue #51） |
| 发送总开关 | DSH 设置页 `sendingEnabled`（`auto` 跟随） | 上游没有全局开关；`auto` 按 dry-run，要真发显式 `FISH_SEND_ENABLED=true` |

## 状态

| 项 | 状态 |
|---|---|
| OneBot v11 消息事件解析（私聊/群、@识别、过滤自身） | 已实现，单测 |
| 允许名单（空=全拒）、上报 HMAC-SHA1 签名校验 | 已实现，单测 + e2e |
| 事件去重（NapCat 重投不二次发送，状态落盘） | 已实现，单测 + e2e |
| 群聊未@沉默 | v3 插件侧；上游桥侧过滤。单测 |
| 发送闸：默认 dry-run；冷却 3s；日上限 50；结果未知不重发 | 已实现，单测 |
| 接上游 dsh-fish：cookie 鉴权、入参映射、回话兜底 | 已实现，单测；**真实 QQ 未实测** |
| 全链路：假 NapCat ⇄ 桥 ⇄ 真实 DSH 真实模型（v3） | **6/6 PASS**（`sim/e2e.mjs`） |
| 真实 NapCat / 真实 QQ 账号（v3） | **已验证**，私聊真发 |

## 运行

所有配置走环境变量，不要放在命令行参数里：

| 变量 | 说明 |
|---|---|
| `FISH_SELF_ID` | 机器人 QQ 号（必填） |
| `FISH_ACCOUNT` | 账号标识（会话/去重作用域，默认等于 `SELF_ID`） |
| `FISH_ALLOWLIST` | `private:QQ号,group:群号`，逗号分隔；**不设置＝信任 NapCat 已过滤（全放行）**；设了才过滤 |
| `FISH_PROTOCOL` | `auto` / `v3` / `dsh-fish`，默认 `auto` |
| `FISH_SAY_URL` | v3 默认 `http://127.0.0.1:3080/dsh-fish-v3/say`；上游填 `http://127.0.0.1:3080/dsh-fish/say` |
| `FISH_SAY_TOKEN` | v3 必填，与 DSH 凭据 `DSH_FISH_INGRESS_TOKEN` 相同（≥32 字节） |
| `FISH_DSH_HOME` | 上游用：DSH 的 home（默认 `~/.dsh`），用来读 `.credentials.yaml` 和 `sessions/` |
| `FISH_DSH_SECRET` | 上游用：直接给 `client-connection/browser-session` 的 base64url 密钥（替代读文件） |
| `FISH_DSH_CREDENTIALS_FILE` | 上游用：凭据文件路径，默认 `$FISH_DSH_HOME/.credentials.yaml` |
| `FISH_DSH_COOKIE` | 上游用：直接给一个现成的 `dsh-auth-…=v1…` cookie（替代铸造） |
| `FISH_DSH_REPLY` | 上游用：`session`（默认，读会话落盘兜底）或 `api`（只认 `/say` 返回） |
| `FISH_DSH_SESSIONS_DIR` | 上游用：sessions 目录，默认 `$FISH_DSH_HOME/sessions` |
| `FISH_OWNER_QQ` | 上游用：主人 QQ；私聊里非主人的按外客处理（不填＝所有私聊都算主人） |
| `FISH_CHANNEL_PREFIX` | 上游用：房间前缀，默认 `qq` → `qq-group:<群号>` / `qq:dm:<QQ号>` |
| `FISH_GROUP_REQUIRE_AT` | 上游用：群聊未 @ 是否丢弃，默认 `true`；v3 默认 `false` |
| `FISH_LISTEN` | 默认 `127.0.0.1:6199`，填到 NapCat 的 HTTP 上报地址 |
| `FISH_INBOUND_SECRET` | 与 NapCat 上报 secret 一致（强烈建议） |
| `NAPCAT_API` / `NAPCAT_TOKEN` | NapCat HTTP API 地址与 access token |
| `FISH_SEND_ENABLED` | `true`/`false` 显式；不设或 `auto`：v3 跟随 DSH 设置页，上游按 dry-run |
| `FISH_STATE_FILE` | 去重状态文件，默认 `/app/bridge-state.jsonl`；重启后恢复已处理事件，避免重发 |

```bash
node bridge/onebot/index.mjs
```

## 接上游 dsh-fish（0.9.x）

1. DSH 里装好 `@ssamurias/dsh-fish` 并重启，确认 `GET /dsh-fish/whoami` 能应答。
2. 让桥拿到鉴权，三选一：
   - 把 DSH 的 home 只读挂给桥，设 `FISH_DSH_HOME`（推荐；`sessions/` 也一起有了）；
   - 从 DSH 的 `.credentials.yaml` 里取出 `client-connection/browser-session` 的 `secret`，设为 `FISH_DSH_SECRET`；
   - 直接把浏览器里的 `dsh-auth-…` cookie 填进 `FISH_DSH_COOKIE`。
3. 配桥：

   ```bash
   FISH_PROTOCOL=dsh-fish
   FISH_SAY_URL=http://127.0.0.1:3080/dsh-fish/say
   FISH_DSH_HOME=/dsh-home
   FISH_DSH_SESSIONS_DIR=/dsh-home/sessions
   FISH_OWNER_QQ=<你的QQ>
   FISH_SEND_ENABLED=true
   ```

4. **最小权限**：挂整个 DSH home 会把里面的模型 API key 也一起给桥。更小的做法是只给
   `FISH_DSH_SECRET`（从 `.credentials.yaml` 里取 `browser-session.secret`），再用
   `FISH_DSH_SESSIONS_DIR` 单独挂 `sessions/`；两种都要保证桥只跑在本机。
5. **如果桥用容器名访问 DSH**（`http://dsh:3080`），DSH 必须放行这个 Host：
   `dsh web --no-open --trusted-host dsh`。否则 `/dsh-fish/*` 的信任栅栏会直接 403 ——
   这不是 cookie 的问题，日志里会明确写 `say-forbidden`。用 `127.0.0.1:3080` 访问则不需要。
6. 回话：上游 0.9.1 的 `herReply` 只含她 `growth_commit` 下来的事件，普通聊天正文不在里面
   （[issue #51](https://github.com/ssamurias/dsh-fish/issues/51)，仍开着）。所以默认
   `FISH_DSH_REPLY=session`：接口没回话时，桥按 `/say` 返回的 `sessionId` 读会话落盘的最后一条
   `assistant/message`。这要求桥能读 `sessions/`（第 2 步的挂载）。上游修好后改成 `api` 即可关掉。
7. `FISH_SEND_ENABLED=auto` 在上游下是 dry-run：上游没有全局「真实平台回复」开关。要真发必须显式 `true`。

## 已知限制

- **回话兜底读的是宿主内部格式**（`session.v*.jsonl.zstd`）。DSH 升级换格式时它会失效；
  日志会出现 `[session-read]`，那时只能等上游修 #51 或改 `FISH_DSH_REPLY=api`（会更少回话）。
- **`auto` 发送在上游下不自动开**：需要显式 `FISH_SEND_ENABLED=true`，这是为了不绕过「默认真实发送关闭」。
- **群聊默认只回 @**：上游 `/say` 没有 `mentioned` 字段，桥侧过滤；要改成每条都进模型，
  设 `FISH_GROUP_REQUIRE_AT=false`（会明显更费 token）。
- **`/say` 的 `mode:live`（v3）需要 DSH 设置里「真实平台回复」开关打开**，否则返回 403。
- 只处理文本段与 @；图片、表情、回复引用被丢弃。
- 不支持 NapCat 反向 WebSocket，只支持 HTTP 上报 + HTTP API。
- 单进程串行；v3 的 `/say` 同一时间只处理一个回合，群里消息多时会返回 busy（429），当前直接丢弃不排队。

## 测试

```bash
node --test bridge/onebot/test/*.test.mjs
node bridge/onebot/sim/e2e.mjs fish-v3 3084   # 需要诊断 profile；会消耗少量模型额度（v3）
```

上游协议的映射、cookie 铸造、会话兜底都有单测（`test/dshfish.test.mjs`）；真实 QQ 链路上游未实测。
