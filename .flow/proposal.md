# 提案（讨论稿固化）— WC-AR-04 RSS 适配器 PoC

来源：`docs/AGENT_REACH_ADOPTION.md` §6「PoC 计划：公开 RSS 只读渠道」+ §7 A 用例适用性 + §8 工作包表（WC-AR-04 行）。
用户指令："继续下一批"（顺序 00→01→(02∥05)→04→06，WC-AR-02/05 已完成并推送，WC-AR-04 依赖已满足）。
固化时间：2026-10-15。

## 已定决策（不可推翻，后续阶段只可细化）

1. **目标**：验证"一个新增公开只读来源如何走完 快照 → 抽取 → 证据 → manifest → 工作台展示 全链"。不装 Agent-Reach，不阻塞主线。
2. **新包** `crawlers/rss-collector`，照抄三爬虫既有模式：
   - `main.ts` CLI：`--urls`（逗号分隔的已批准 Feed）、`--limit`（条目上限，默认 50）、`-o/--out-dir`、`--json`、`--deadline-ms`；
   - `events.ts`：对齐 firecrawl-scraper 的 6 类 NDJSON 事件协议（start/scraping/snapshot_saved/failed/done/error），workbench reducer 可直接消费；
   - 采集：原生 `fetch` 拉 Feed 原文 → `SnapshotStorage` 存为 `content.xml` + metadata（含哈希与双时间戳）；**零新依赖**，PoC 手写最小 RSS/Atom 解析（样本格式固定）；正式化时再评估是否引入 XML 库；
   - 抽取：规则式 title/link/published/summary → `FieldEvidence`（`locateSnippet` 定位到 Feed 原文行/偏移）；原文没有的字段 `null + missing_reason`，禁止估算发布时间；
   - 交付：`createAndSaveDeliveryManifest` 生成 manifest + limitations；`BudgetGate` 限 `maxCalls = urls.length`。
3. **workbench 接入**：`validateRssParams`（URL 域白名单、`maxFeedRequests ≤ 5`、不跟随条目链接）+ `buildCrawlerSpawnSpec` 增 `rss` 分支 + 场景入口（**默认收起**，验收后放开——放开属 WC-AR-06，不在本批）。
4. **数据流声明**：仅访问任务中批准的 Feed 域名；无凭据；无 LLM；不抓条目正文与附件（需要时另立任务走 web-scraper）。
5. **验收（三组全过才算完成）**：
   - 主线回归：现有测试全绿 + mock 商品样板端到端不变（A18）；
   - RSS 冻结样本 ≥20 用例：正常 Feed、Atom 变体、合法空 Feed（A06）、超时、截断、私网 URL 拦截（A10，复用 WC-AR-05 出口门禁 `egressBlockReason`）、取消（A13）；
   - 不装 Agent-Reach 全程可跑（A01）；无隐式安装/联网外目标（A19）。
6. **出口治理复用 WC-AR-05 成果**（handoff 已声明）：采集 URL 校验期过 `egressBlockReason`；如跟随重定向须逐跳守卫（manual + 5 跳上限 + 每跳计 budget）；无凭据故 argv 无密钥问题；超时走 `TaskParams.timeoutMs` 端到端链路（已贯通）。

## 约束与边界

- 增量全部为加法：新 SourceType 分支、新包；不改既有爬虫行为。
- `schemaVersion` 兼容先例（WC-AR-02）：TaskParams 联合层按需增 `RssTaskParams`，不动其他包 domain 类型。
- 场景入口默认收起：UI 上提供入口但不在默认场景清单露出（具体形态在 PRD/GRILL 细化）。
- §7 中标 ✅ 且与 RSS 相关的用例（A05 内容检查、A07 截断、A09 诱导内容不执行、A14 结构漂移保留原文不猜字段、A16 新运行新目录不覆盖、A20 只读无写操作）纳入本批测试覆盖；A02/A04/A11 不在范围。

## 已拒绝/排除的替代方案

- 不引入 XML 解析库（PoC 手写最小解析，样本格式固定；正式化再评估）。
- 不跟随条目链接抓正文/附件（越界即另立 web-scraper 任务）。
- 不装 Agent-Reach、不接诊断桥（WC-AR-03 暂缓）。

## 开放问题（留待红队/PRD/GRILL）

- WC-AR-05 评审递延项 N1–N6（尤其 N2 预算定容、N1 尾随点绕过）是否随本批顺带处置——默认**否**（保持范围聚焦），除非红队认定其阻塞 RSS PoC 正确性。
- RSS 冻结样本的具体来源形态（本地 fixture 文件 vs 内置字符串）与 ≥20 用例的分布。
- workbench 场景入口"默认收起"的具体实现形态（COLLECTOR_SCENARIOS 标志位 vs 环境变量）。
- `--deadline-ms` 与 workbench `timeoutMs` 的语义对齐方式。
- pnpm workspace 新包注册与 tsconfig 路径引用的既有惯例（照抄三爬虫哪一个最近似）。
