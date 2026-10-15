# WC-AR-05 REVIEW 阶段独立评审报告

- **日期**：2026-10-15
- **评审者**：REVIEW 阶段独立子代理（全新上下文，未参与实现）
- **Fixed point**：`9c81570`（= 当前 HEAD；本批全部改动位于工作区未提交状态 + 3 个未跟踪新文件，`git log 9c81570..HEAD` 为空，与 baseline_dirty=[] 一致）
- **评审范围**：`git diff 9c81570`（25 个文件，+687/−167）+ 未跟踪的 `packages/data-governance/src/egress.ts`、`apps/workbench/test/fixtures/{hang-forever,grandchild-crawler}.mjs`
- **规格源**（按优先级逐字阅读）：`.flow/proposal.md` ＞ `.flow/prd.md`（含 GRILL 决议附录）＞ `.flow/tasks.md`（T1–T7）

## Verdict：**PASS**

无 blocking 发现。6 条 non-blocking 发现（2 条安全/行为判断项 + 4 条代码质量与覆盖判断项）。声明的验证证据与实际复跑结果**完全一致**，tasks.md 七个切片的证据陈述逐条核实**无虚假**。

---

## 复跑验证（亲自执行）

命令：仓库根 `pnpm test && pnpm typecheck && pnpm build` → **exit 0**。

| 包 | 测试数 | 结果 |
|---|---|---|
| data-governance | 8/8 | 全绿（含新增出口守卫参数化用例） |
| firecrawl-scraper | 27/27 | 全绿 |
| api-connector | 20/20 | 全绿 |
| cninfo-reports | 14/14 | 全绿 |
| workbench | 82/82 | 全绿 |
| **合计** | **151/151** | 0 fail / 0 skipped / 0 cancelled |

typecheck 5 包全过（含 workbench 双 tsconfig），vite build 成功（66 modules）。与声明证据（151/151，各包计数）逐项吻合。基线核算：fixed point 处测试计数 7+26+16+13+76 = 138（用 `git grep -c '^test\('` 于 9c81570 复核），+13 增量与 tasks.md 各切片证据链（7→8、16→17→20、13→14、26→27、76→77→81→82）自洽。

---

## Spec 轴

对照 proposal 已定决策 1–7、PRD 实现决策 1–9、GRILL Round1/Round2 决议、T1–T7 验收标准，逐项核对结果：

| 规格项 | 结论 | 证据 |
|---|---|---|
| 决策1 任务级超时（默认 60min + timeoutMs 覆盖，先发结构化 error 事件再终止） | ✓ | `runner.ts:28,91-102`（emit 先于 terminate）、`task-params.ts:77-82`（正整数校验）、`routes/tasks.ts` 三分支透传、`runner.ts:209` |
| 决策2 进程组终止（detached + 负 pid + ESRCH 容错 + SpawnHandle.pid） | ✓ | `runner.ts:37,71-78,109`；测试断言孙进程 ESRCH（`runner.test.ts` 进程组用例，waitPidGone 轮询） |
| 决策3 共享出口守卫（全部地址族） | ✓ | 见下方对抗探针；参数化用例 21 拦截+3 协议+6 放行与 tasks.md T1 声明逐一吻合 |
| 决策4 校验期接线 + baseUrl 豁免 | ✓ | `task-params.ts:49-56`（urls 守卫、baseUrl 不查）、`validation.ts:19-22`、`main.ts:41-58`；豁免语义与 PRD“非采集目标”一致 |
| 决策5 重定向逐跳重检（manual、5 跳、303/301/302 改写、每跳计 budget） | ✓ | `engine.ts:59-99`；测试覆盖 302→127.0.0.1 跨跳变私网、downloadUrl 直击 169.254.169.254、303 POST→GET |
| 决策6 argv 消除 + dispatch 断言反转 | ✓ | `runner.ts:187-189` 仅 env 注入；全仓 grep 无 `--api-key` argv 生产路径（firecrawl CLI 解析按规格保留）；`runner-dispatch.test.ts:130-131` 断言已反转 |
| 决策7 重启脱敏假密钥标 failed | ✓ | `queue.ts:63-76`，中文文案与 GRILL Q6 逐字一致，persist 照抄既有模式 |
| 决策8/9 范围排除 | ✓ | headers 未动、状态机未动、无 ChannelRegistry、无 SIGINT 关停清理 |
| GRILL R2-Q3 取消/超时并发无双终态 | ✓（一处日志层瑕疵见 N4） | `queue.ts:139-146` 先置 canceled 再 cancel；reducer 仅迁移 running/queued（`reducer.ts:88-94`） |

**对抗性探针（亲自执行，egressBlockReason 实跑）**：127/8、10/8、172.16/12（含上下边界）、192.168/16、169.254/16（含 169.254.169.254 元数据端点）、0.0.0.0/8、十进制 2130706433、十六进制 0x7f000001、八进制 0177、短格式 127.1/0x7f.1、localhost/*.localhost/大小写、`::1`/`::`/`fc00::/7`/`fd12::`/`fe80::`（含 zone-id）、`::ffff:127.0.0.1`/`::ffff:10.0.0.1`、`0.1.2.3` 全部拦截；file:/data:/ftp: 拒绝；`127.0.0.1@evil.com`、`127.0.0.1.evil.com`、`{{page}}` 模板放行——与 GRILL Q5 清单一致。发现一个清单外缺口（N1）。

**虚假证据猎查**：tasks.md 七条勾选的证据（文件、用例名、计数、日期）全部与实际代码和本次复跑吻合；T3 证据文字准确描述了实际新增的 3 个用例，未夸大（301/302 POST→GET 已实现但未测，见 N6）。

## Standards 轴

仓库无 `AGENTS.md`/`CONTRIBUTING.md`/`CODING_STANDARDS.md`（仅 `.editorconfig`，工具强制项按技能规则跳过），故 Standards 轴仅适用 smell 基线。新增代码风格（中文注释、错误文案、测试命名）与各包既有惯例一致。发现：一处死代码分支含潜在 bug（N3）、一处无效别名/无用解构（N5）、一处魔法字符串重复（N5）。无 Duplicated Code/Shotgun Surgery 级别问题——守卫单一落点（egress.ts）被三处正确复用，正是规格要求的形态。

---

## Findings（按严重度排序；本批无 blocking）

### N1（non-blocking，安全加固判断项）尾随点 `localhost.` 绕过出口门禁字面检查
- **证据**：`packages/data-governance/src/egress.ts:122-124` —— 判定仅 `host === 'localhost' || host.endsWith('.localhost')`。实跑：`egressBlockReason('http://localhost./')` 返回 `null`（hostname 保留尾随点 `localhost.`，WHATWG URL 对非 IP 主机不去点；对照 `http://127.0.0.1./` 因 URL 将 IP 规范化为 `127.0.0.1` 而被拦）。
- **归属**：spec（GRILL Q5 地址族枚举未含尾随点形态）/ implementation。
- **分类理由**：规格冻结清单未列此形态，不构成 spec 轴未命中；且是否解析到回环依赖平台 resolver（DNS 解析已在 PRD 记为已知限制），可利用性环境相关。但它是新门禁自身“识别回环”契约的字面缺口，修复代价一行。
- **Recheck 判据**：host 归一化时剥尾随点（`host.replace(/\.$/, '')`）后，`egressBlockReason('http://localhost./')` 与 `egressBlockReason('http://foo.localhost./')` 返回拦截原因。

### N2（non-blocking，行为回归判断项）每跳计费后预算上限未随之调整，合法多附件任务会中途熔断
- **证据**：`crawlers/api-connector/src/engine.ts:202`（`maxCalls: maxPages + 5`，本批未改）与 `engine.ts:75,77`（guardedFetch 每跳 `checkAndReserve`/`recordUsage`）、`engine.ts:292`（附件下载也走 guardedFetch）。旧代码分页独占预算、下载不计；现在下载与重定向跳数全部计入，maxPages=50 时约 55 次调用后剩余附件全部以 `[BudgetGate] 熔断` 失败（旧版本可全部成功）。另：分页处预算熔断原先在 try 外抛出 → error 事件 + 整体 failed；现在被 `engine.ts:212-219` 捕获为 queryError → 有产出的任务终态可能从 failed 降为 partial。
- **归属**：implementation（每跳计费本身是 GRILL Q4 明令，规格未约束上限公式——两者组合产生的缺口）。
- **Recheck 判据**：以 maxPages=2、单页 10 个附件跑引擎，全部下载成功（或上限已按 页数+预计附件量 重新定容），且分页期预算熔断的事件分类与预期一致。

### N3（non-blocking，死代码 + 潜伏 bug）`::ffff:` 点分 mapped 专用分支不可达，且若可达会丢失 0xffff 标记组
- **证据**：`packages/data-governance/src/egress.ts:56-63` —— 该分支仅在 `new URL` 输出点分形式 hostname 时可达；实跑证明 `new URL('http://[0:ffff:...]')` 系列一律规范化为十六进制（如 `[::ffff:7f00:1]`），故分支死代码。且其重构 `[...head.slice(0, 6), hi, lo]` 会把 groups[5] 置 0，导致 `egress.ts:92-94` 的 mapped 判定（要求 groups[5]===0xffff）永不命中——当前行为正确纯靠 URL 规范化路径兜底。
- **归属**：implementation（Speculative Generality：与运行时解析器重复实现了一个永远不会被喂到的形态）。
- **Recheck 判据**：删除该分支（或修正为 `[...head.slice(0, 5), 0xffff, hi, lo]`）后全部测试仍绿、`::ffff:` 探针仍全部拦截。

### N4（non-blocking，判断项）超时回调不检查 canceled，取消后仍可能追加一条“任务超时”日志行
- **证据**：`apps/workbench/server/runner.ts:92-100` —— 回调仅查 `exited`；用户刚 cancel（canceled=true、子进程未退出）时仍 emit 超时 error 行。无状态污染：`queue.ts:139-142` 先置 `canceled`，`reducer.ts:88-94` 的 error 事件仅迁移 running/queued，故无双终态（GRILL R2-Q3 的状态语义守住）；但“不产生双重事件”在日志流上未完全满足，窗口 = cancel 到子进程退出之间（默认宽限 5s）。
- **归属**：implementation。
- **Recheck 判据**：回调首行加 `if (canceled) return` 后，取消后立即触发超时的用例不再输出“任务超时”行。

### N5（non-blocking，smell 基线判断项）三处小型代码异味
- `runner.ts:89` `const cancel = terminate;` 无意义别名（直接返回 `cancel: terminate` 即可）；
- `egress.ts:88,97` 解构 `[g0, g1]` 后 `void g1` 压制未用变量（只解构 g0 即可）；
- `queue.ts:71,76` 错误文案字面量既写又以 `'脱敏密钥'` 子串反查作为 persist 条件（魔法字符串耦合，改动文案即静默失配）。
- **归属**：implementation。**Recheck 判据**：别名/解构清理后 diff 为零行为变化；persist 条件改用同一常量。

### N6（non-blocking，覆盖缺口判断项）四处规格已实现但无负向用例
- 5 跳重定向上限（`engine.ts:71,96-98` 抛错路径无测试）；301/302 POST→GET 改写（仅 303 有用例，`engine.test.ts:341-375`）；重启脱敏判定 mock:true 任务不豁免（GRILL Q6“mock 不豁免”——实现正确，`queue.ts:64-69` 无 mock 分支，但测试只构造了 mock:false 用例）；每跳计 budget 的断言缺失。tasks.md 证据文字本身未夸大这些点。
- **归属**：verify。**Recheck 判据**：四项各补一条断言（6 连跳报“重定向次数超过上限”、301 POST→GET、mock:true+脱敏 key 标 failed、redirect 第二跳 checkAndReserve 被调）。

---

## 核实为无问题的重点猎查项

argv 无密钥（grep 全仓，`--api-key` 仅存于 firecrawl CLI 解析与反转后的测试断言）；超时先事件后终止、terminate 幂等（`canceled || exited` 门）、killGroup 负 pid + ESRCH try/catch；guardedFetch 每跳先守卫后请求、首跳与 downloadUrl 首跳均检查；`pnpm-lock.yaml` 已同步（+3 行 workspace link）；workbench `data-governance: workspace:*` 依赖 + exports `./egress` + index re-export 机械前置全部就位；cninfo 豁免 env 仅测试文件设置、生产默认守卫开启（`main.ts:41` `!== '1'` 才守卫）；diff 范围外无顺手改动；既有取消三测（SIGTERM/SIGKILL 升级/spawn 失败）不回退；timeoutMs 经 API→normalizeParams→makeCrawlerRunner 端到端贯通（api.test.ts 透传用例 + 400 负向用例）。

## 轴总结

- **Standards 轴**：3 条发现（N3 死代码+潜伏 bug、N5 三处异味、无文档化标准违反）；轴内最重 = N3。
- **Spec 轴**：3 条发现（N1 门禁字面缺口、N2 预算上限与每跳计费的组合回归、N6 覆盖缺口），无规格未命中；轴内最重 = N2。
- **复跑 verify**：`pnpm test && pnpm typecheck && pnpm build` exit 0；测试 151/151（governance 8 + firecrawl 27 + api-connector 20 + cninfo 14 + workbench 82），与声明证据一致。
