# PRD — WC-AR-04 RSS 适配器 PoC

- 规格 precedence：`.flow/proposal.md` ＞ 本文件；红队报告 `.flow/red-team.md`（GO-WITH-CONDITIONS）的条件已逐条吸收进实现决策并标注 KA 编号。
- 发布方式：本仓库未配置 issue tracker，PRD 落盘 `.flow/prd.md`（沿用本流程既有降级惯例）。

## Problem Statement

工作台目前只有三个固化数据源（cninfo 财报、api-connector、web-scraper 商品样板）。要验证平台的可扩展性主张——"新增一个公开只读来源能走完 快照 → 抽取 → 证据 → manifest → 工作台展示 的完整治理链"——需要一个最小但真实的新渠道实验。RSS 是最合适的选择：公开、只读、零凭据、零 LLM、零新依赖，且能直接复用 WC-AR-05 刚交付的出口门禁、任务超时与进程组终止治理。

## Solution

新增 `crawlers/rss-collector` 爬虫包：输入一批已批准的公开 Feed URL，逐个拉取原文并存为带哈希与双时间戳的 XML 快照，规则式抽取条目的 title/link/published/summary 四字段并生成可回验原文的字段级证据，最终产出 records/evidences/manifest 交付包。workbench 以纯加法接入：新 sourceType `rss` 的参数校验、任务分发与展示，但场景入口默认收起（不在场景清单露出），放开留给 WC-AR-06。

## User Stories

1. 作为数据工程师，我想提交一个包含最多 5 个公开 Feed URL 的采集任务，以便用最小配置验证新渠道接入。
2. 作为数据工程师，我想让每个 Feed 原文以 XML 快照形式落盘（含 SHA-256 哈希与请求/接收双时间戳），以便事后审计与防篡改核验。
3. 作为数据工程师，我想让每个条目的 title/link/published/summary 都携带指向 Feed 原文行号与字符偏移的证据，以便任何字段值可回验原文。
4. 作为数据工程师，我想让原文没有的字段显式记为 null 加缺失原因（尤其禁止估算发布时间），以便下游不会把猜测当事实。
5. 作为数据工程师，我想让任务自动生成 manifest（含 schema、质量指标、limitations 与关键文件校验和），以便交付包可用既有防篡改工具核验。
6. 作为工作台用户，我想在任务列表看到 RSS 任务的逐 Feed 进度、失败清单与如实的终态分级（全部成功=succeeded、部分失败=partial、全部失败=failed），以便不用看日志就知道结果。
7. 作为安全负责人，我想让所有 Feed URL（含重定向后的每一跳）都经过出口门禁拦截私网/回环目标，以便爬虫不能被诱导访问内网。
8. 作为安全负责人，我想让凭据类风险在新渠道为零（无凭据、argv 无任何密钥），以便新增渠道不引入新的暴露面。
9. 作为平台维护者，我想让 Feed 拉取次数受预算门禁限制（每 Feed 一次配额、重定向每 Feed 最多 5 跳），以便失控任务自动熔断。
10. 作为平台维护者，我想让 RSS 任务受任务级超时保护（到点先发结构化 error 事件再终止进程组），以便挂起任务不占住串行队列。
11. 作为平台维护者，我想让上游 Feed 内容（标题、摘要、链接）只作为不可信数据处理、永不执行，以便 A09 类诱导攻击无效。
12. 作为平台维护者，我想让结构漂移的 Feed（未知标签、缺字段、截断）保留原文并如实标注缺失，以便 A14 类情况不产生脑补数据。
13. 作为平台维护者，我想让出口门禁修复尾随点主机名绕过（`localhost.`），以便门禁的"识别回环"契约没有字面缺口。
14. 作为验收人，我想在不安装任何外部 agent 工具的情况下全程运行与测试 RSS 采集，以便验证 A01/A19 的零依赖主张。

## Implementation Decisions

### 新包 rss-collector（照抄三爬虫模式）

1. **包结构**：`main.ts`（CLI 入口 + parseArgs 纯函数）、`domain/`（参数类型 + validateRssParams，镜像 api-connector/domain 惯例，供 workbench 复用）、`events.ts`（事件类型 + NDJSON 解析器）、`feed-parser.ts`（纯函数解析器）、`collector.ts`（采集编排）。package.json exports 与 tsconfig 照抄 firecrawl-scraper；依赖仅 `data-governance: workspace:*`，devDeps 仅 tsx/typescript/@types/node——**零新外部依赖**（KA4/A01）。pnpm workspace 的 `crawlers/*` glob 自动纳入。
2. **CLI**：`--urls`（逗号分隔，1–5 个）、`--limit`（条目上限，默认 50）、`-o/--out-dir`、`--json`（NDJSON 模式）、`--deadline-ms`（整任务级软超时，默认 60000，KA5）。参数校验失败 → 输出 error 事件 + 非零退出（对齐 cninfo/api-connector 行为）。
3. **事件协议（KA1 裁决，理由必读）**：提案钉的规范内容是"6 类事件协议 + workbench reducer 可直接消费"（括号里的 firecrawl 类型名清单是描述性举例——且与 firecrawl 实际代码不符，实际叫 `scrape_failed`）。红队证明这两句按字面不能同时成立：workbench reducer 说的是 cninfo 事件方言，firecrawl 形状的 done.summary 会让部分失败任务误判 failed。**裁决：RSS 事件保持 6 类分类学（start / 单条进度 / 单条保存 / 单条失败 / done / error），类型名采用 workbench reducer 已消费的方言**——`start`（totalCompanies=Feed 数）、`file`（status downloaded/failed，code=域名、name=Feed 标题）、`queryError`（拉取级失败：门禁拦截/超时）、`done`、`error`；done.summary 采用 CrawlSummary 兼容形状（companies=Feed 数、matched=条目总数、downloaded/skipped/failed=Feed 级计数、bytes、outDir）。reducer 零改动、既有任务类型零行为变化，"可直接消费"从口号变成被端到端测试证明的事实。
4. **dry-run**：RSS PoC 不提供 dry-run；workbench 创建 rss 任务时 dryRun 标志忽略（按正式采集执行）。

### 采集与治理链

5. **出口门禁（A10，复用 WC-AR-05）**：CLI 校验期逐 URL 过 `egressBlockReason`（含 `localhost.` 尾随点修复后，见决策 14）；运行期 fetch 采用 manual 重定向逐跳守卫（模式照抄 api-connector guardedFetch：每跳先守卫后请求、每 Feed 限 5 跳、303/301/302 方法改写）。
6. **预算公式（KA3，防 N2 复发）**：`BudgetGate maxCalls = urls.length`——一个 Feed URL 占一次全局配额（无论重定向几跳）；重定向跳数不占全局配额，由每 Feed 5 跳上限约束。断言 `callsMade === urls.length` 且带重定向的 Feed 仍成功。
7. **快照（KA2）**：data-governance 的 SnapshotStorage **加法扩展**：`saveSnapshot` 增可选 `xml?: string` 入参 → 产物 `content.xml`、formats 含 `'xml'`、content_hash 覆盖 XML 文本；metadata.files 增可选 `xml` 字段。旧调用（不传 xml）行为逐字节不变（对齐 WC-AR-02 的 response_type/truncated 加法先例）。**禁止**把 XML 塞进 html/markdown 字段（元数据谎言）。
8. **解析器（KA4，保守边界）**：手写字符串解析，冻结样本范围。只处理 5 种 XML 预定义实体（&amp; &lt; &gt; &apos; &quot;）与 CDATA 剥壳；容忍 BOM 与空白。支持 RSS 2.0（item/title/link/pubDate/guid/description）与 Atom（entry/title/href/updated/published/summary）两个冻结变体。未知结构/缺字段 → 该字段 null + missing_reason，原文原样保留；不做 DTD、命名空间展开、外部实体（字符串解析天然免疫 XXE）。**禁止估算发布时间**。
9. **抽取与证据**：每条目四字段 title/link/published/summary → FieldEvidence（extractorType `'parser'`，sourceText 为 Feed 原文，locateSnippet 定位行号/偏移，confidence 1.0 仅当定位命中，否则 0 并记 missing_reason）；recordId 由条目 link/guid 派生稳定哈希。产物：records.jsonl、evidences.jsonl、evidence.sqlite（EvidenceIndexStore）。
10. **交付**：`createAndSaveDeliveryManifest`（sourceType `'rss'`），schema 字段集 = recordId/feedUrl/title/link/published/summary/qualityStatus/missingReason；limitations 至少含"冻结样本范围的手写解析器""不抓取条目正文与附件""发布时间不估算"；operations 记 `{ backend: 'rss_native_fetch' }`。manifest 可被既有 verifyDeliveryPackage 核验。
11. **内容检查（A05）**：响应非 Feed（如挑战页/HTML）→ 该 Feed 标 failed（reason 注明"响应不是合法 Feed"），不当作空 Feed 静默成功。
12. **条目链接不跟随（数据流声明）**：抽取层只读原文字段，任何条目 link 不发起网络请求（由设计保证 + 测试断言 fetch 调用数 == Feed 数）。

### workbench 接入（全部加法）

13. **参数与分发**：task-params 增 `RssTaskParams`（sourceType 'rss'、name、urls 1–5、limit、deadlineMs 可选）与 SourceType `'rss'`；`validateRssParams`（urls 非空且 ≤5、逐一经出口门禁、limit 正整数 ≤500、deadlineMs 正整数；"URL 域白名单"语义 = **任务即白名单**：仅访问任务中显式批准的 Feed URL，数据流声明与采纳文档 §6 一致）；buildCrawlerSpawnSpec 增 rss 分支（argv 无任何凭据）；queue 的 outDir 映射增 rss → rss-collector 目录；summarizeTask/getTaskCategory/CATEGORY_LABELS 增 rss 类目。workbench 增 `rss-collector: workspace:*` 依赖。**reducer 零改动；COLLECTOR_SCENARIOS 零改动（场景入口默认收起，放开 = WC-AR-06）**。

### 递延项处置（提案逃生条款触发）

14. **N1 修复带入本批**：egressBlockReason 主机名归一化剥尾随点（`localhost.`、`foo.localhost.` 拦截）——红队认定其阻塞本批 A10 验收正确性；**N3 顺带**：删除 `::ffff:` 点分 mapped 死代码分支（行为零变化，防潜伏 bug）。N2（api-connector 预算定容）/N4/N5/N6 维持递延（N2 的防复发已由决策 6 在新包内解决）。

## Testing Decisions

- **好测试标准**：只测外部可观察行为（NDJSON 输出行、落盘文件、终态、进程行为），不测内部实现细节；每个验收点至少一条负向用例。红队要求 **RSS 冻结样本 ≥20 用例**，分布如下（合计 26+，全部本地化，无外网）：
  - **解析器纯函数（10）**：RSS2.0 正常、Atom 变体、合法空 Feed（A06）、截断样本（A07）、CDATA、5 实体解转义、缺 title/link/published（null+missing_reason，A14）、BOM+空白、带注释/未知标签的漂移样本、每用例附 locateSnippet 回验断言（sourceText 偏移命中原文）。
  - **采集编排（8）**：正常采集落盘（content.xml + metadata 哈希 + 双时间戳）、404/500 → failed、deadline 到点 → done 收尾（failed 计入，非外层 kill，KA5）、302→公网 逐跳跟随成功、302→私网 拦截（A10）、校验期私网/`localhost.` URL 拒绝（A10+N1）、挑战页/HTML 响应 → failed 且注 reason（A05）、预算公式（重定向 Feed 成功且 callsMade==urls.length，KA3）+ 条目链接零跟随断言（A12/A20）。
  - **manifest/交付（2）**：manifest 生成含 schema/limitations/operations；verifyDeliveryPackage 核验通过。
  - **CLI（2）**：-h 帮助零退出；非法参数 → error 事件 + 非零退出。
  - **A09（1）**：条目字段含脚本/伪协议内容时作为纯数据保留原样（无执行面）。
  - **workbench（4）**：validateRssParams 单元（>5 URL 拒绝、私网拒绝）；spawn spec 单元（rss 分支 argv 无凭据）；端到端 2 Feed 一成一败 → 终态 partial + counts/failures 如实（KA1 裁决的证明用例）；类目标签。
  - **egress（2）**：N1 探针（`http://localhost./`、`http://foo.localhost./` 拦截）；N3 回归（`::ffff:` 探针全拦截 + 全量旧用例不回退）。
- **测试基建复用**：本地 HTTP 假服务器（cninfo/firecrawl 先例）、fetchFn 注入 seam（api-connector engine 先例）、冻结样本以 fixture 文件存 `test/fixtures/*.xml`。
- **模块与先例**：rss-collector 新测试文件对齐三爬虫命名；data-governance 扩展用既有 governance.test.ts 追加；workbench 用既有 task-params/api/runner-dispatch 测试文件追加。
- **全量门禁**：`pnpm test && pnpm typecheck && pnpm build`（新包被 workspace glob 自动纳入 -r 递归）。

## Out of Scope

- WC-AR-06 的全部内容：场景入口放开、来源类型/限制声明展示、A 用例固化为常规回归包。
- 条目正文/附件抓取（需要时另立 web-scraper 任务）；RSS dry-run/preview 模式。
- XML 解析库引入评估（正式化时再议）；真实公网 Feed 的长期漂移适配。
- 递延项 N2（api-connector 预算定容修复）、N4、N5、N6。
- 平台级 Feed 域名白名单配置面（PoC 语义 = 任务即白名单）。
- DNS rebinding 防护（与既有爬虫一致的已声明限制）。

## Further Notes

- 红队 KA1–KA5 与范围裁决（N1/N3 带入）已全部吸收：KA1→决策 3，KA2→决策 7，KA3→决策 6，KA4→决策 8，KA5→决策 2，N1/N3→决策 14。
- 降级声明：本批红队为主代理内联执行（子代理两次 429 限流后被停止），对抗距离弱于结构性独立评审，DONE 总结将披露。
- pnpm-workspace `crawlers/*` glob 自动纳入新包，无需改 workspace 配置；workbench 需 `pnpm install` 刷新 lockfile（新增 workspace 链接）。

## PRD Diff Gate（auto 模式，2026-10-15）

相对 proposal.md 的增量/裁决清单（未重述双方一致项）：

1. **事件协议类型名裁决（决策 3）**：提案括号内 firecrawl 类型名清单为描述性举例（且与 firecrawl 实际代码不符——实际为 `scrape_failed` 而非 `failed`）；PRD 保留规范的规范内容（6 类协议 + reducer 可直接消费），类型名落定为 reducer 已消费方言。**分类：对不一致决策的细化裁决，非变更**——提案两句按字面互斥（红队 KA1 证明），裁决满足其目标句。自批准理由记录于此；如用户不认可可回退。
2. SnapshotStorage 加法扩展 xml 字段（红队 KA2 条件，提案未预见的必要前置）——纯增量。
3. 预算公式钉死：maxCalls=urls.length、重定向跳数不占全局配额、每 Feed 限 5 跳（提案开放问题落定，防 N2 复发）——纯增量。
4. deadline-ms 定整任务级、默认 60000（开放问题落定）——纯增量。
5. N1+N3 修复带入本批（提案逃生条款预先授权 + 红队认定 A10 阻塞）——提案内已授权的范围调整。
6. 冻结样本 26+ 用例分布与 fixture 形态（本地 HTTP server + test/fixtures/*.xml）（开放问题落定）——纯增量。
7. 场景入口"默认收起"落定为 COLLECTOR_SCENARIOS 零改动、UI 卡片留 WC-AR-06（开放问题落定）——纯增量。
8. RSS 不支持 dry-run、workbench 忽略其 dryRun 标志（提案未提及）——纯增量。
9. "URL 域白名单"语义 = 任务即白名单（≤5 显式批准 URL；采纳文档数据流声明"仅访问任务中批准的 Feed 域名"的直读）——纯增量澄清。
10. A05 非 Feed 响应检测、A09/A12 断言形态具体化（提案约束段已列方向）——纯增量。

无任何条目变更或丢弃 proposal.md 的已定决策；无需升级。

## GRILL 决议附录

### Round 1（作者盲审子代理 9 包，主代理逐包核验后全采纳，2026-10-15）

主代理对两处新发现做了独立实证（evidence 路由只读 md/html；firecrawl engine 快照布局与消费端不一致）后采纳。无任何包与 proposal 已定决策冲突；无需升级。

- **G1（R1-Q1）normalizeParams 增 rss 分支**（PRD 决策 13 的漏项，POST 创建链路）：钳制 name（缺省 `'RSS Feed 采集'`）、urls（字符串数组 trim+去空）、limit/deadlineMs/timeoutMs（number 透传，越界交 validateRssParams 拒绝）、未知字段丢弃，镜像 web-scraper 分支形态。
- **G2（R1-Q2）/snapshot-content 增 xml 读取**：加法扩展——`format=xml` 显式请求，或 md/html 均不存在时回退读 content.xml；md/html 行为零变化。否则字段级证据指向的 XML 原文在工作台不可回看，击穿"可回验"核心主张。
- **G3（R1-Q3）e2e 门禁豁免通道**：rss CLI 增 `RSS_ALLOW_PRIVATE_ORIGIN=1` 测试豁免（镜像 cninfo 先例，仅绕过私网/回环判定，协议白名单仍生效）；workbench 的 validateRssParams 不加豁免；workbench e2e 直驱 TaskQueue + makeCrawlerRunner 真实 spawn rss CLI（豁免经 env 继承）；保留"无豁免时 CLI 拒绝私网"负向用例。
- **G4（R1-Q4）快照布局钉死 + firecrawl 地雷只标注不修**：RSS 快照落 `outDir/snapshots/<snapshotId>/{content.xml, metadata.json}`（`new SnapshotStorage(path.join(outDir, 'snapshots'))`），records/evidences/evidence.sqlite/manifest 在 outDir 根，manifest.files 增 `snapshotsDir: 'snapshots/'`。已实证 firecrawl engine 写顶层而消费端读 `snapshots/` 子目录（engine.ts:19 vs main.ts:199）——**既有地雷，本批不修**（不改既有爬虫行为），记入 handoff 递延。
- **G5（R1-Q5）事件分界**：按"是否取得 HTTP 响应"分界——门禁拦截/网络错/超时/超跳数 → `queryError`（target=URL）；取得响应但不可用（404/500/A05 非 Feed）→ `file status='failed'`（code=域名、name 无标题时用 host、reason 注明）；成功落盘 → `file status='downloaded'`。每 Feed 拉取前发 `company`（index/total/code=host/name=host，不猜标题）；`start` 恒带 `dryRun:false`。
- **G6（R1-Q6）参数边界一揽子**：urls trim 后精确重复 → 校验报错拒绝（CLI 同）；limit=每 Feed 条目上限；spawn 仅当 params.deadlineMs 定义时传 `--deadline-ms`（缺省 CLI 默认 60s），与 timeoutMs 硬熔断双层独立不自动 clamp；创建 rss 任务时 dryRun 一律钳制落库 false（标题/classifyDone/clearPreviews 三处免特例）。
- **G7（R1-Q7）recordId 与质量口径**：前像优先级 link（绝对化）> guid > 条目原文切片；`recordId = 'rss_' + sha256(前像)`（hex 不截断）；同任务重复 recordId 保留多条（limitations 声明"跨 Feed 转载不去重"）。qualityStatus `'valid' | 'missing_field'`：title 与 link 均非空 → valid，否则 missing_field + `missingReason='FIELD_NOT_IN_FEED:<字段>'`；published/summary 缺失只走字段级 null+missing_reason 不降级；manifest 直传计数，不调 calculateQualityMetrics（避 missing_price 语义污染）。
- **G8（R1-Q8）解析器输入假设**：判型与子标签只认无前缀小写字面标签（`<rss>`/`<feed>`，其余整 Feed failed）；带前缀标签（atom:link/dc:date）按未知标签走漂移路径（字段 null+missing_reason）；Atom link 取第一个 rel 缺省或 alternate 的 href，无匹配取第一个 link，全无 → null；published 只认 RSS pubDate/Atom published，**不回退 updated**；FieldEvidence 的定位 snippet 用**解码前原文切片**（value 才是解码后文本），保证 locateSnippet 逐字命中。
- **G9（R1-Q9）CLI 契约**：`summary.failed > 0` → exit 1（对齐 cninfo/api-connector）；默认（非 --json）模式镜像 api-connector textReporter：逐 Feed 一行 + 结尾摘要，断言无 JSON 行泄漏；逐 Feed 串行、不加 sleep 参数。

### Round 2（主代理 3 包，2026-10-15）

Round 1 后残余缺口的最后落定：

- **G10 截断/空 Feed/条目语义**：截断样本（A07）= 解析器丢弃无闭合标签的尾部不完整条目、保留完整条目、快照 metadata.truncated=true、manifest limitations 注明"Feed 可能截断"；合法空 Feed（A06）= 该 Feed `file downloaded`（matched=0 不是失败）；条目按原文出现顺序、`--limit` 截前 N（每 Feed 口径，G6）；done.summary.bytes = 各 Feed 原文字节总和。
- **G11 事件收尾协议**：校验期失败（参数非法/私网 URL）→ 仅发 `error` 事件 + exit 非零，不发 done（镜像 cninfo/api-connector）；运行期单 Feed 失败不中断后续 Feed，最终必发 done；运行期致命错误（outDir 写失败等）→ error + exit 1，不再发 done。
- **G12 deadline 机制与覆盖语义**：deadline 用 AbortController 实现——到点即 abort 进行中的 fetch（该 Feed 发 queryError，reason='DEADLINE_EXCEEDED'）并阻止启动后续 Feed（未启动的同样 queryError），最终正常发 done 收尾；`--urls` 逗号 join 透传（合法 URL 不含字面逗号，安全）；A16 覆盖语义 = 每次运行快照 id 唯一不覆盖，outDir 级产物按单任务目录语义覆盖写，workbench 场景 taskId 隔离天然满足。

**GRILL 收敛**：Round 2 后无新增开放问题，2 轮收敛。

### 评审周期 1 补记（2026-10-16，REVIEW F1/F2 处置）

- **A13 裁决（修正 Diff Gate 遗记）**：Round 1 后的 PRD 用例分布确实遗漏了 proposal 决策 5 验收枚举中的「取消（A13）」且未在 Diff Gate 记录——属静默丢弃，评审判 blocking 成立。处置：**补用例而非书面豁免**——`apps/workbench/test/rss-e2e.test.ts` 新增「运行中取消」用例（挂起 Feed → 等 start 落日志 → queue.cancel → 终态 canceled、无 done 事件、终态不被改写）。
- **F2 裁决（决策 10 与 G4 冲突的正式裁决）**：决策 10 指名的 `createAndSaveDeliveryManifest` 无法表达 G4 要求的 `files.snapshotsDir` 与 Feed 级 sourceSummary 计数（helper 的 files 映射与 succeeded/failed 推导固定）。**裁决：以 G4 为准，manifest 手工构造**（镜像 firecrawl pipeline 的既有先例），verifyDeliveryPackage 兼容性由测试证明；helper 扩展留待正式化阶段（递延）。
