# Red-Team: WC-AR-04 RSS 适配器 PoC（.flow/proposal.md）

- **日期**：2026-10-15
- **模式**：主代理内联红队（降级）——fresh 子代理两次 429（5 小时用量上限）后被停止，按 dev-flow 技能降级路径内联执行；对抗距离弱于结构性子代理，已在 history 记录，DONE 总结将披露。
- **被评审对象**：`.flow/proposal.md`（WC-AR-04：新包 crawlers/rss-collector 走通快照→抽取→证据→manifest→工作台全链）。
- **证据基础**：仓库代码逐点实证（下列各条均附 file:line）。

## Verdict：**GO-WITH-CONDITIONS**

无 kill 判据被现有证据满足——方案的复用主张大部分真实成立（见 Well-Reasoned）。但两条"照抄即可"的复用主张与代码事实**不符**，必须在 PRD 阶段修正语义，否则会以错误接口开工。

---

## Top Kill-Assumptions（按 影响×可能性×验证成本 排序）

### KA1：Claim——"events 对齐 firecrawl-scraper 6 类协议后，workbench reducer 可直接消费"
- **Steelman**：queue.onLogLine 对任意 `{"type":...}` 行都会解析并喂 applyEvent，未知事件类型安全跳过（`queue.ts:226-234`、`reducer.ts:99-100` default 分支），所以"能跑不崩"确实成立，firecrawl web-scraper 今天就是这么接的。
- **Attack**：reducer 消费的是 **cninfo 事件词汇表**（`start/company/file/queryError/preview/done/error`，`reducer.ts:20-101`），不是 firecrawl 词汇表（`start/scraping/snapshot_saved/scrape_failed/done/error`，`firecrawl-scraper/src/events.ts:13-32`）。两者只有 `start/done/error` 同名。更尖锐的是 `classifyDone`（`reducer.ts:7-18`）：非 dryRun 任务"有产出"判据是 `summary.downloaded + summary.skipped`——firecrawl 的 ScrapeSummary 只有 `succeeded/failed`（`events.ts:5-11`），即**今天 web-scraper 任务只要有任一 URL 失败就落 'failed' 而非 'partial'**（produced 恒 0）。RSS 若照抄 firecrawl 协议与 summary 形状，会继承同一缺陷：部分 Feed 失败 = 整任务 failed，违反"如实分级"的产品语义，且"工作台展示"验收（部分失败显示 partial）不成立。
- **Fails if**：RSS 事件照抄 firecrawl 形状（done.summary 用 total/succeeded/failed），部分 Feed 失败时任务终态显示 failed 而非 partial。
- **Evidence to get this week**：已取——上列 file:line 即证据；另可跑一次 mock web-scraper 多 URL 任务（一成一败）观察终态。
- **Kill criterion**：不适用（未满足 kill——修复是设计层面的）；但 PRD 不修正此语义即开工 = 实现期必然返工。
- **Cheapest test**：workbench 侧端到端用例——两个 Feed 一成一败，断言终态 `partial` 且 counts/failures 如实。
- **处置条件**：PRD 必须钉死 RSS 事件词汇表与 done.summary 形状，二选一并写明理由：(a) done.summary 采用 cninfo 兼容字段（downloaded/skipped/failed/matched/outDir），reducer 零改动直接消费（推荐，PoC 成本最低）；(b) 加法扩展 reducer 支持 rss 事件。逐 URL 进度走日志行（与 web-scraper 同水准）即可，不在本批扩 reducer。

### KA2：Claim——"SnapshotStorage 存为 content.xml + metadata"
- **Steelman**：SnapshotStorage 是通用快照落盘器（`data-governance/src/storage.ts:25-117`），metadata 含哈希与双时间戳，saveSnapshot 原子写（tmp→rename），WC-AR-02 已证明该类型可加法扩展（response_type/truncated 先例）。
- **Attack**：`saveSnapshot` 的内容入参**只有 `markdown?` 与 `html?` 两个具名字段**（`storage.ts:46-47`），产物文件名硬编码 `content.md`/`content.html`，formats 只会 push 'markdown'/'html'（`storage.ts:72-85`）。**不存在任何存 XML 的路径**。提案把"存为 content.xml"写成照抄既有模式，实际需要先做一次 data-governance 的加法扩展（如可选 `xml?` 字段 → `content.xml` + formats 'xml'）。若实现期图省事把 Feed XML 塞进 `html` 字段：files.html='content.html'、formats=['html'] 全是谎言，哈希/格式元数据失真，下游（如未来 pipeline 读 files.html 按 HTML 解析）被污染。
- **Fails if**：PRD 不含 SnapshotStorage 加法扩展工作项，实现只能伪构造（XML 存进 html 字段）或绕开 SnapshotStorage 自写落盘（违背复用主张）。
- **Kill criterion**：不适用（未满足 kill）；但这是提案与代码事实的硬冲突，PRD 必须吸收。
- **Cheapest test**：扩展后单测——saveSnapshot 传 xml 内容，断言产物含 `content.xml`、formats 含 'xml'、content_hash 覆盖 XML 文本、metadata.json 读回一致；旧调用（无 xml 字段）行为逐字节不变。
- **处置条件**：PRD 增加工作项"data-governance storage 加法扩展：可选 xml 内容字段"；禁止 XML 塞 html 字段。

### KA3：Claim——"maxCalls = urls.length 与逐跳重定向预算可以并存"
- **Steelman**：提案两处各自成立——采纳文档 §6 钉了 `BudgetGate 限 maxCalls = urls.length`；WC-AR-05 handoff 要求"如跟随重定向须逐跳守卫（manual + 5 跳上限 + 每跳计 budget）"。
- **Attack**：两者组合自相矛盾：一个 Feed URL 若 302 一次 = 2 次 checkAndReserve，第 2 个 URL 起即 CALLS_EXCEEDED 熔断。这正是 WC-AR-05 评审 N2（每跳计费后上限未定容）在**新包内的复发**——N2 在 api-connector 被判 non-blocking 可以缓，但 RSS 是新建包，带着已知缺陷开张不可辩护。
- **Fails if**：任一批准 Feed URL 发生重定向（公网 Feed 常见 http→https 跳转），后续 Feed 全部预算熔断失败。
- **Kill criterion**：不适用；公式选择是设计自由度，但必须显式钉死。
- **Cheapest test**：单测——2 个 Feed URL，第一个 302 一次，断言两个都采集成功且 callsMade 与公式一致。
- **处置条件**：PRD 钉死预算公式（例：`maxCalls = urls.length × (1 + MAX_REDIRECT_HOPS)`，或重定向跳数不计入 Feed 级配额、单 URL 内部限跳）；api-connector 侧的 N2 修复仍递延不在本批。

### KA4：Claim——"手写最小 RSS/Atom 解析（样本格式固定）零新依赖可行"
- **Steelman**：PoC 验收对象是**冻结样本**，不是任意真实 Feed；RSS2.0/Atom 的 title/link/published/summary 在良构样本里是规则字符串提取；api-connector 已用全局 fetch（Node>=18，本机 v24），零新依赖成立。
- **Attack**：真实 Feed 的 CDATA、命名空间、`&amp;` 等实体、GBK/BOM 会让朴素解析漂移——但 PoC 明确冻结样本，此攻击不达 kill 线。真正的风险是**范围蠕变**：解析器逐渐长出 XML 库的功能。A09（上游内容诱导执行）与 A14（结构漂移保留原文不猜字段）反而是手写字符串解析的天然优势：无 DTD/外部实体解析（XXE 免疫）、无 eval 面。
- **Fails if**：解析器试图覆盖冻结样本之外的格式（范围蠕变），或对解不出原文的字段编造值（违反 null+missing_reason 契约）。
- **Kill criterion**：冻结样本集内解析正确率 < 100%（良构样本全部通过是底线）。
- **Cheapest test**：解析器纯函数单测——正常 RSS、Atom、空 Feed、截断、CDATA、5 种预定义实体；每用例断言 FieldEvidence 偏移可回验（locateSnippet(sourceText) 命中原文）。
- **处置条件**：PRD 钉死解析器边界：只解 5 种 XML 预定义实体 + CDATA 剥壳；未知结构 → 字段 null + missing_reason，原文原样保留；不做 DTD/命名空间展开。

### KA5：Claim——"--deadline-ms 与 workbench timeoutMs 双超时不冲突"
- **Steelman**：timeoutMs 在 spawnRunner 层（外层硬杀 + error 事件，`runner.ts:91-102`），deadline-ms 是 CLI 进程内软限（内层自查），分层语义天然不冲突：内层先到 → 正常收尾发 done（failed 计入）；外层先到 → 结构化 error + SIGTERM 进程组。
- **Attack**：唯一冲突窗口是两者数值接近时的竞态（deadline 到点瞬间外层也 kill）——事件流可能 error 行与 done 行并存，reducer 先到先得。低概率、低影响（终态仍是 failed/succeeded 之一，无双终态——reducer 只迁移 running/queued）。
- **Fails if**：deadline-ms 语义定义为"每个 Feed"而 timeoutMs 是"整个任务"，PRD 不写明默认值与单位换算，实现随手各定一套。
- **Kill criterion**：不适用。
- **Cheapest test**：CLI 级用例——deadline-ms 极小值跑挂起 Feed（复用 hang-forever 思路），断言按 deadline 收尾发 done（failed=1）而非被外层 kill。
- **处置条件**：PRD 钉死：deadline-ms 为整任务级（毫秒），默认 60_000；workbench 不传 deadline（用 timeoutMs 外层兜底），或显式对齐数值——二选一写明。

## 范围裁决：递延项 N1–N6 是否带入本批

提案预留了逃生条款："默认否，**除非红队认定其阻塞 RSS PoC 正确性**"。裁决：

- **N1（尾随点 `localhost.` 绕过 egressBlockReason）——带入本批**。理由：RSS 验收 A10 明文含"私网 URL 拦截"，而 `http://localhost./feed.xml` 是一个不会被拦的私网 URL（WHATWG URL 对非 IP 主机保留尾随点，`egress.ts:122-124` 只做字面 `=== 'localhost'` 判断）——新包的出口守卫验收在该输入上不成立，构成对 RSS PoC 正确性的阻塞。修复一行（host 归一化剥尾随点）+ 探针用例。
- **N3（`::ffff:` 点分死代码分支）——顺带带走**。同文件、行为零变化（评审已证分支不可达），删死代码防止未来误触发其潜伏 bug。
- **N2/N4/N5/N6——维持递延**。N2 的 api-connector 侧修复不动（本批只在新包内钉预算公式防复发，见 KA3）；N4/N5/N6 不阻塞 RSS 正确性。

## What's Well-Reasoned

- **复用主张绝大部分真实**（逐点核验）：`SnapshotStorage`（storage.ts:25）、`locateSnippet`/`FieldEvidence`/`EvidenceIndexStore`（evidence.ts:34/6/67）、`createAndSaveDeliveryManifest`（manifest.ts:110，`sourceType` 参数化，天然可传 'rss'）、`BudgetGate`（budget.ts:39）、`buildCrawlerSpawnSpec` 三分支结构（runner.ts:116-203，加 rss 分支是纯加法）、`validateWebScraperParams`+`egressBlockReason` 校验接线先例（task-params.ts:41-64）、`timeoutMs` 端到端链路（WC-AR-05 交付并测试）、`guardedFetch` 逐跳守卫模式（api-connector engine.ts:62，可参考实现）。
- **渠道选择正确**：RSS 公开只读、零凭据、零 LLM——把 WC-AR-05 刚交付的出口门禁/超时/进程组治理用最小变量验证一遍，是 PoC 的正确形状。
- **"默认收起"有清晰落点**：COLLECTOR_SCENARIOS 是静态数组（task-params.ts:149-178），本批不加卡片即"收起"；RSS 任务经 API 创建（POST /api/tasks）可端到端验证，UI 场景卡留给 WC-AR-06"放开"。workbench 需要的加法改动清单明确：TaskParams 增 RssTaskParams、queue.create 的 outDir 三元（queue.ts:111-118）增 rss 分支、summarTask/getTaskCategory 增 rss 分支（task-params.ts:97-137）。
- **零新依赖成立**：Node>=18（根 package.json engines）+ 全局 fetch（api-connector 先例）+ workspace 依赖 data-governance + tsx，无需任何新包。
- **≥20 冻结用例可行**：firecrawl/cninfo 的测试基建（本地 HTTP 假服务器、fetchFn 注入 seam、fixtures 目录）齐备，成本为纯编写。

## What I Couldn't Assess

- 真实公网 Feed 的长期形态漂移（PoC 冻结样本边界外的世界，采纳文档已自我声明）。
- WC-AR-06 放开场景卡时的 UI 表单形态（不在本批）。
- DNS rebinding 对 RSS 的具体威胁面（PRD 已声明不防，与既有爬虫一致）。
