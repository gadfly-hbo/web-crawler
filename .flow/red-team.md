# Red-Team: WC-AR-05 执行治理增量（runner 超时/进程组 + 私网拦截 + argv 凭据消除）

> 红队执行方式：全新上下文只读子代理（explore），按 strategy-red-team 技能方法论执行；仅持有提案与技能文件路径，独立核验。基线实跑 138/138 与提案一致。

**基线验证（只读，未改任何文件）**：`pnpm test` 全绿 —— data-governance 7 + firecrawl-scraper 26 + api-connector 16 + cninfo-reports 13 + workbench 76 = **138 pass / 0 fail**，与提案约束 7 所述一致。

## 一、承重 claim 逐条核验（steelman → attack）

| # | 提案 claim | 核验结果 | 证据 |
|---|---|---|---|
| 1 | runner 无任何超时（runner.ts:29-73） | **属实** | `spawnRunner` 全函数无定时器；仅 `cancel` 有 SIGTERM→宽限(500ms 默认)→SIGKILL，`apps/workbench/server/runner.ts:26-73` |
| 2 | 只杀直接子进程（runner.ts:64-73） | **属实，但收益是前瞻性的** | `child.kill()` 只及直接子进程（runner.ts:68,70），spawn 未 `detached`（runner.ts:29-32）。**全仓爬虫源码无任何 `child_process` 调用**（grep 零命中）——当前生产路径不存在孙进程；`--import tsx` 也是进程内加载。该缺口只在 seam 层面为真 |
| 3 | 全仓无私网拦截 | **属实** | `validateWebScraperParams` 仅正则查 `https?://`（`apps/workbench/shared/task-params.ts:47-51`）；api-connector 仅 `new URL()` 格式校验、**连协议白名单都没有**（`crawlers/api-connector/src/domain/validation.ts:10-18`）；grep 全仓无私网/回环守卫 |
| 4 | argv 明文 `--api-key`（runner.ts:154） | **属实，且修复近乎零风险** | runner.ts:152-155 同时注入 env 与 argv。env 链路已端到端存在：runner.ts:31 合并 env → `crawlers/firecrawl-scraper/src/adapter.ts:21` 有 `config.apiKey || process.env.FIRECRAWL_API_KEY` 回退。删 argv 不破坏爬虫端 |
| 5 | 范围排除与采纳文档 §8 一致 | **属实** | `docs/AGENT_REACH_ADOPTION.md:164` 行确无 localStorage 治理；`SettingsModal.tsx:72-73` 明文 localStorage 亦核实存在 |

**Steelman（提案最强的形态）**：这是"在引入新联网渠道（WC-AR-04 RSS）之前先补治理"的顺序正确的包；四个缺口有三个（超时、argv、私网）在代码层面实证为真；开放问题恰好预告了我大部分攻击点（超时默认值、实施层、rebinding、进程组语义）。这是一个克制、范围窄、验收可测的提案。

**Attack（打 steelman 本身）**：提案的真实叙事是"凭据不再经 argv / 出口有门禁"，但同一威胁模型下 **api-connector 是更大的洞**（见 kill-assumption #1）；"对所有爬虫统一生效"的私网拦截对 cninfo 是空集、对 web-scraper 拦不住真实抓取方（Firecrawl 服务端）；进程组终止修的是一个今天不存在的泄漏路径。

## 二、Top Kill-Assumptions（按 影响×可能性×可测试性 排序）

### 1. 「凭据 argv 消除」的威胁模型只覆盖 web-scraper，api-connector 同类泄漏被漏掉
- **Claim**：决策 4（argv 无密钥）达成"凭据治理"目标。
- **Fails if**：api-connector 的 `request.headers`（可含 `Authorization`/`Cookie`，`server/routes/tasks.ts:38-45` 原样放行任意字符串头）随 `--config-json JSON.stringify(task.params)` 整体进 argv（`server/runner.ts:113-114`）——`ps` 可见，且**落盘 tasks.json 完全不脱敏**（`server/queue.ts:81-88` 只对 web-scraper apiKey 脱敏），比 web-scraper 现状更差。这已不是假设，是已验证的代码事实。
- **Kill criterion**：若 PRD 拒绝把「api-connector headers 的 argv/落盘泄漏」纳入本批或记录显式排除理由，则提案标题"凭据 argv 消除"名不副实，验收 4 只是一半真相 → 应改写 claim 或扩验收。
- **Cheapest test**：一行命令 `grep -l Authorization data/workbench/tasks.json`；或单测断言 `buildCrawlerSpawnSpec(apiParams)` 的 argv 不含 headers 值（现在会失败）。

### 2. 超时默认值会误杀合法长任务（或形同虚设）
- **Claim**：任务级超时到达→走取消路径→failed。
- **Fails if**：cninfo 合法任务（多公司 × sleepMs 1000 × 多报告类型）可跑数十分钟以上，默认值过小则正常采集被杀；过大则 A02 验收在测试时限内不可触发。本机 `data/workbench/tasks.json` 仅 3 条历史、最长 5 秒——**没有任何时长数据可校准默认值**。
- **Kill criterion**：PRD 若定死一个无依据的全局常量且不可按任务覆盖 → 本项治能空转，退回开放问题。
- **Cheapest test**：用现有 fixtures 模式加 `hang-forever.mjs` + `timeoutMs: 200` 的单测（与 runner.test.ts:63-73 的 SIGKILL 升级测试同构，该测试实测 135ms，不 flaky）。

### 3. 「私网拦截对三个爬虫统一生效」按字面不可测/不可达
- **Claim**：验收 3 要求拦截对 cninfo/api-connector/web-scraper 统一生效。
- **Fails if**：(a) **cninfo 无用户可控 URL**（origin 来自 `CNINFO_ORIGIN` 环境变量，测试 `crawlers/cninfo-reports/test/json-mode.test.ts:91` 可证），对它"生效"是空集，验收无法按字面构造；(b) **web-scraper 的实际抓取方是 Firecrawl 服务**（adapter.ts:70-79 只是 POST 到 `baseUrl/v1/scrape`），workbench 期拦截 URLs 只是输入过滤，拦不住云端代抓；自托管场景 `baseUrl` 本身就可能合法地指向私网（api.test.ts:318 就用 `http://localhost:3002` 测试），对它做私网拦截会破坏正当用例；(c) api-connector 引擎用默认 `fetch`（`engine.ts` 的 `fetchFn` 注入、redirect 默认 follow），**公网 URL 302 跳私网即可绕过预检**——开放问题列了 DNS rebinding 却漏了更廉价的 HTTP 重定向。
- **Kill criterion**：PRD 若不明确「实施层（校验期 vs 运行时）× 重定向 × baseUrl 是否豁免」三件事，验收 3 无法收敛成可测断言。
- **Cheapest test**：在 `validateApiConnectorParams` 层加纯函数单测（127.0.0.1/192.168.x/localhost/`[::1]`/十进制 IP 变体），三层结构上可行——三个爬虫 package.json 均已依赖 `data-governance` workspace 包，共享守卫有现成落点。

### 4. 重启后 queued 的 web-scraper 任务会带着脱敏假密钥执行
- **Claim**：范围排除说无需处理 apiKey 持久化。
- **Fails if**：服务重启时 `secretKeys`（内存态，queue.ts:25,84）丢失，但 **queued 任务保持 queued 会被重新 pump**（queue.ts:56-63 只把 running 标记为 failed），此时 `execParams.apiKey` 是脱敏串 `abc****wxyz` → 注入 env → 爬虫 401，错误信息完全无法溯源。
- **Kill criterion**：若决定不改，须在提案记录该已知边缘；若改，最小方案是重启时把带脱敏 key 的 queued 任务标 failed。
- **Cheapest test**：queue.test.ts 的重启恢复模式（176-194 行）加一个带 apiKey 的 queued 任务即可复现。

### 5. 进程组改动的隐藏耦合面（不致命，但必须在 PRD 显形）
- **Claim**：detached + 负 pid kill 可行（提案已列为开放问题）。
- **Fails if**：忽略三件事——(a) `runner-dispatch.test.ts:110-136` **现有测试断言 argv 含 `--api-key` 与密钥明文**，argv 消除后必红，约束 5 只保了取消测试，漏列这个必须同批改写的测试；(b) `process.kill(-pid)` 对已退出进程组抛 ESRCH，不像 `child.kill()` 返回 false，需 try/catch；(c) `SpawnHandle` 不暴露 pid，验收 1 的"无残留进程"断言需要 fixture 写 pidfile 或扩句柄。服务自身 SIGINT 直接 `process.exit(0)`（index.ts:42-43），不杀在跑爬虫——进程组机制顺手可补服务关停清理，提案未提（可不做，但应记录）。
- **Kill criterion**：无——PRD 把 (a)(b)(c) 写进实现注意即可。

## 三、What's Well-Reasoned

- **四个缺口三个实证为真，行号引用全部准确**（runner.ts:29-73/64-73/154、SettingsModal.tsx:72 逐一核对无误）。提案做过真实的代码勘察，不是纸面推断。
- **argv→env 迁移是本仓最安全的一类改动**：env 链路今天已端到端工作（runner.ts:153 注入 + adapter.ts:21 回退 + runner.ts:31 合并 process.env），CLI 直用 `--api-key` 也不受影响（main.ts:65-66 仍解析）。"env 命名兼容性"这个开放问题实际上已被代码回答。
- **测试基建完全撑得起全部验收**：真子进程 fixtures（fake/slow/stubborn-crawler.mjs）、Runner 接口 fake seam（queue.test.ts:27-51）、waitFor 轮询、毫秒级宽限定时——验收 1/2/4 都有现成同构样板，实测 138 全绿、SIGKILL 用例 135ms 稳定。
- **顺序正确**：私网门禁先于新联网渠道（RSS PoC 明确依赖本包，采纳文档 :129/:145），这是治理先行的正确依赖方向。
- **范围纪律好**：被拒绝方案有记录、排除项与采纳文档 §8:164 逐字对齐、明确"不改状态机不动业务逻辑"。
- **开放问题清单质量高**——超时配置面、实施层、rebinding、进程组语义，四个问题预判了我一半以上的攻击线。

## 四、What I Couldn't Assess

- **PRD/GRILL 产出尚不存在**——kill-assumption #2/#3 的最终裁决在下一阶段，本轮只能钉住问题。
- **真实长任务时长分布**：本机 tasks.json 仅 3 条冒烟级记录（≤5s），无法校准超时默认值，也无法证明"误杀合法任务"实际会发生。
- **自托管 Firecrawl 的私网 baseUrl 部署是否真实存在**：代码支持（adapter.ts:23 `isSelfHosted`），但仓库内无此配置实例，拦截策略对其影响只能假设。
- **macOS/Linux detached+负 pid 在 Linux 上的行为差异**：本机仅 macOS 可实证，开放问题已列，未验证。
- **api-connector 是否曾有用户填过含凭据的 headers**（tasks.json 现有 1 条 api-connector 记录未检查 header 内容——涉及可能的真实凭据，不宜读取展示）。

## Verdict: **GO**

没有任何 kill criterion 被满足到推翻提案的程度：四个缺口主张三个在代码层完全成立（第四个——进程组——在 seam 层成立、收益为前瞻性），全部治理改动在现有结构上可行（env 链路已存在、data-governance 是三爬虫公共依赖、测试基建同构现成），138 基线实测吻合。

**GO 的附带条件（进 PRD 前必须处置，否则验收质量受损）**：
1. kill-assumption #1（api-connector headers 同类泄漏）要么纳入本批、要么在提案记录显式排除理由——当前叙事"凭据 argv 消除"与实际覆盖面不符；
2. 验收 3 对 cninfo 改写为可测表述（如"cninfo 因无用户 URL 输入而结构性豁免"），并把 HTTP 重定向纳入实施层决策（与 rebinding 同级）；
3. 把 `runner-dispatch.test.ts:110-136` 的改写列入约束 5 的"不回退"清单。
