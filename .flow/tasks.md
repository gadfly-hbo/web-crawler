# WC-AR-05 任务切片（tasks.md）

> 来源：`.flow/prd.md`（含 GRILL 决议附录）。Tracer-bullet 垂直切片，每片端到端可验证。无 issue tracker，按 dev-flow 降级规则落盘本文件。切片自批准（auto 模式），批准理由见 state.json history。

## 清单

- [x] 1. data-governance 出口守卫：`egressBlockReason` 严格解析器 + exports 注册 + 参数化测试 —— 证据：新建 src/egress.ts + exports./egress + index re-export；`pnpm --filter data-governance test` 8/8（新增参数化用例覆盖 21 拦截 + 3 协议拒绝 + 6 放行含 userinfo/模板形态），2026-10-15
- [x] 2. 校验期接线：web-scraper urls 与 api-connector request.url 调守卫（含 workbench 依赖前置） —— 证据：workbench 加 data-governance 依赖 + validateWebScraperParams/validateApiConnectorParams 接守卫；api-connector 17/17、workbench 77/77（各 +1 新用例，含 baseUrl 豁免断言），2026-10-15
- [x] 3. api-connector 引擎重定向逐跳重检：两条 fetch 改 manual + downloadUrl 首跳 + budget 每跳 —— 证据：engine.ts 新增 guardedFetch（守卫+manual 逐跳+303/301/302 方法改写+每跳计入预算）；`pnpm --filter api-connector test` 20/20（+3：302 跳私网拦截、downloadUrl 直击私网拦截、公网 303 跟随且 POST→GET 改写），2026-10-15
- [x] 4. cninfo origin 守卫 + `CNINFO_ALLOW_PRIVATE_ORIGIN` 豁免 + 既有 e2e 适配 —— 证据：main.ts 校验期守卫 CNINFO_ORIGIN/STATIC_ORIGIN；两个 e2e 文件加豁免 env；`pnpm --filter cninfo-reports test` 14/14（+1 正向拒绝用例），2026-10-15
- [x] 5. web-scraper apiKey argv 消除 + runner-dispatch 断言反转 —— 证据：runner.ts 删除 `--api-key` argv 注入保留 env；dispatch 断言反转 + 新增 adapter env 回退用例；workbench 77/77、firecrawl 27/27，2026-10-15
- [x] 6. runner 超时 + 进程组终止 + timeoutMs 贯通（TaskParams/normalizeParams/makeCrawlerRunner） —— 证据：runner.ts detached+killGroup+超时 error 事件+共享 terminate；新增 hang-forever/grandchild fixtures；TaskParams 联合层 timeoutMs + 校验 + normalizeParams 三分支透传；`pnpm --filter workbench test` 81/81（+4：超时、孙进程、timeoutMs 校验、API 透传；既有取消三测不回退），2026-10-15
- [x] 7. 重启脱敏假密钥 queued 任务标 failed —— 证据：queue.ts init 恢复时含 `****` 的 queued web-scraper 任务标 failed（中文原因+persist）；`pnpm --filter workbench test` 82/82（+1 用例含正常 queued 不受影响断言），2026-10-15

---

## 1. data-governance 出口守卫

**Blocked by**: None
**User stories**: 4

### What to build

新文件 `src/egress.ts`，导出 `egressBlockReason(url: string): string | null`（返回中文拦截原因或 null 放行）：`new URL` 归一（先做 `{{...}}` 模板占位替换）→ 协议白名单仅 http/https（其余含 file:/data:/ftp: 拒绝，文案"仅支持 http/https URL"）→ host 解析（剥 `[]`、去 `%25` zone-id、识别十/十六/八进制/短格式 IPv4、IPv6 含 `::ffff:` mapped、`fc00::/7`、`fe80::/10`、`::`、全段 `0.0.0.0/8`，及 localhost/`*.localhost`/`127/8`/`10/8`/`172.16/12`/`192.168/16`/`169.254/16`）→ 命中返回"目标地址指向内网/回环，已被出口门禁拦截"。package.json exports 注册 `"./egress"`，index.ts re-export。

### Acceptance criteria

- [ ] 参数化用例覆盖全部地址族 + 公网对照 + userinfo 欺骗形态（`http://127.0.0.1@evil.com/` 不误拦）+ 模板 URL（`{{page}}` 归一后可解析）
- [ ] 非 http/https 协议拒绝；空 host 拒绝
- [ ] 既有 governance 测试保持全绿

## 2. 校验期接线

**Blocked by**: 1
**User stories**: 4

### What to build

workbench package.json 新增 `data-governance: workspace:*` 依赖；`validateWebScraperParams` 对 `urls` 逐项调守卫；api-connector `domain/validation.ts` 对 `request.url` 调守卫（模板归一在守卫内完成）。baseUrl 豁免（非采集目标，自托管合法私网）。

### Acceptance criteria

- [ ] 私网/回环 URL（127.0.0.1、192.168.x、localhost、`[::1]`、十进制变体）在两类校验期被中文错误拒绝
- [ ] 既有 api-connector/workbench 测试全绿（公网域名用例不受影响）

## 3. api-connector 引擎重定向逐跳重检

**Blocked by**: 1
**User stories**: 5

### What to build

引擎两条 fetch（分页请求、附件下载）改 `redirect: 'manual'` 自行跟随：每跳先 `egressBlockReason`（Location 用 `new URL(loc, currentUrl)` 相对解析，downloadUrl 首跳同样检查），上限 5 跳，303→GET、301/302 POST→GET，每跳计入 budgetGate；命中拦截按既有错误分类路径报错。

### Acceptance criteria

- [ ] 本地 server 302→`127.0.0.1` 被拦（分页与下载各一用例）
- [ ] downloadUrl 直指私网（无重定向）被拦
- [ ] 既有 api-connector 16 项测试全绿

## 4. cninfo origin 守卫 + 豁免

**Blocked by**: 1
**User stories**: 4

### What to build

cninfo CLI 校验期对 `CNINFO_ORIGIN` 与 `CNINFO_STATIC_ORIGIN` 调守卫；显式豁免 env `CNINFO_ALLOW_PRIVATE_ORIGIN=1` 时跳过（先例：http.ts:28 的 env override 惯例）；既有两个 e2e 测试文件（json-mode.test.ts、snapshot.test.ts）的 env 各加豁免行。

### Acceptance criteria

- [ ] 私网 origin 无豁免 → CLI 拒绝并中文报错（正向用例）
- [ ] 豁免 env 设置时既有 e2e 全绿（cninfo 13 项不回退）

## 5. web-scraper apiKey argv 消除

**Blocked by**: None
**User stories**: 6

### What to build

`buildCrawlerSpawnSpec` web-scraper 分支删除 `--api-key` argv 注入，保留 env 注入；爬虫 CLI `--api-key` 解析不动（直用路径不变）；adapter 的 env 回退（adapter.ts:21）行为不变。改写 runner-dispatch.test.ts:110-136：断言 argv 不含密钥值且 env 含 `FIRECRAWL_API_KEY`。

### Acceptance criteria

- [ ] spawn argv 不含 apiKey 明文（断言）；env 含密钥（断言）
- [ ] 爬虫端经 env 读取密钥的功能路径测试通过
- [ ] 既有 dispatch/queue 测试全绿

## 6. runner 超时 + 进程组 + timeoutMs 贯通

**Blocked by**: None（1 不阻塞；守卫与超时独立）
**User stories**: 1、2、3

### What to build

spawn 加 `detached: true`；终止改 `process.kill(-pid, sig)`（ESRCH try/catch 容错）；`SpawnHandle` 暴露 pid。新增任务级超时：`DEFAULT_TASK_TIMEOUT_MS = 60min`，`spawnRunner` 接 `timeoutMs` opts；到点先发结构化事件 `{"type":"error","message":"任务超时（N ms），已终止子进程"}` 再走进程组终止；done 不 reject；与取消共用同一终止函数、并发幂等。`TaskParams` 联合层加 `timeoutMs?: number`（正整数校验）；`normalizeParams` 三分支透传（仅 typeof number）；`makeCrawlerRunner` 传入。PRD 已知限制记录 Ctrl-C 行为 delta（detached 后爬虫成孤儿，关停清理留作后续小改）。

### Acceptance criteria

- [ ] `hang-forever` fixture + `timeoutMs: 200` → 任务 failed、task.error 含"超时"、fixture 进程不存活
- [ ] 孙进程 fixture（写 pidfile + ready 行）→ cancel 后孙进程 ESRCH
- [ ] 既有取消三测（SIGTERM/SIGKILL 升级/spawn 失败）不回退
- [ ] timeoutMs 经 API 入口透传生效（normalizeParams → runner）

## 7. 重启脱敏假密钥标 failed

**Blocked by**: None
**User stories**: 7

### What to build

queue init 重启恢复时：`sourceType==='web-scraper'` 且 status queued 且 `params.apiKey` 含 `****` → failed，`error: '检测到重启前残留的脱敏密钥，密钥不随服务重启保留，请重新提交任务'`；照抄 init 既有 running→failed 模式（queue.ts:56-65）+ persist；mock 不豁免。

### Acceptance criteria

- [ ] 重启恢复用例：带脱敏 apiKey 的 queued 任务 → failed 且 error 文案正确；正常 queued 任务不受影响
- [ ] 既有 queue 测试全绿

---

## 依赖与顺序

T1 →（T2、T3、T4）∥ T5 ∥ T6 ∥ T7。执行顺序：1 → 2 → 3 → 4 → 5 → 6 → 7。
