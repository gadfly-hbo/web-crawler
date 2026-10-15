# Agent-Reach 能力吸收：采纳评审与融合方案 v1.0

> **结论：采纳报告推荐的路线 B（经审查的接入知识 + web-crawl 原生适配器），Agent-Reach 不作为运行时依赖。** 吸收的是"渠道接入"的方法与边界，不是工具本身。Firecrawl 主线、三爬虫分发架构、data-governance 治理底座全部保留不动。

| 文档项 | 内容 |
|---|---|
| 版本 | v1.1，采纳评审 / ADR / 候选工作包（合并报告 §17.2 六项输出）；v1.1 按 WC-AR-02 红队结论修订 §5 契约表 |
| 日期 | 2026-10-15 |
| 输入 | 《Agent-Reach 仓库研究与 web-crawl 产品融合方案 v1.0》（外部研究报告，下称"报告"） |
| 评审对象 | 本仓库实际源码、测试与流程文档（现状核对于 2026-10-15 完成） |
| 性质 | 设计采纳决策，不是开工授权；实施走既有 .flow / 提交流程 |
| 验证状态 | 全仓测试 130/130 通过（2026-10-15 实测：data-governance 4 + firecrawl-scraper 22 + api-connector 16 + cninfo-reports 13 + workbench 75） |

---

## 1. 必须先纠正的基线差异

报告以内部方案 [B01]（`Firecrawl_Web_Data_Analysis_Product_Plan_v1.0.md`，含 §3.3 对象定义、§14 路线、§15 验收）为对照基线。**本仓库不存在该文件**：

- `docs/FIRE_CRAWL_PRODUCT_PLAN.md` 是无版本、无日期的 5 章稿（126 行：愿景/场景/架构/数据流/存储选型），无 §14/§15 编号体系。
- M0–M3 阶段路线实际在 `docs/DEVELOPMENT_PLAN.md`（M0 边界验证 → M1 最小闭环 → M2 证据链与受控 LLM → M3 交付与生态对接）。

本评审所有对照以本仓库实际文件为准。报告引用 B01 章节号的地方，映射到上述两份实际文档，不视为代码事实。

另两条影响采纳的仓库事实：

1. **git 基线未固化**：`docs/`、`crawlers/firecrawl-scraper/`、`packages/` 未跟踪，`apps/workbench` 大量已修改未提交。任何增量工作的回归基线当前不可复现，见候选包 WC-AR-00。
2. **Agent-Reach / RSS / Jina / Exa / 渠道注册表概念全仓零命中**（代码、配置、文档），本方向为纯新增，无既有实现可复用。

## 2. 现状对照：报告假设 vs 实际代码

### 2.1 数据面（firecrawl-scraper + data-governance）

报告 §7.1 的七个契约对象，实际落地情况：

| 概念 | 状态 | 实际实现 |
|---|---|---|
| `WebAcquisitionPort` | ✅ 同名存在 | `crawlers/firecrawl-scraper/src/port.ts:60`（`getCapabilities`/`scrape`，8 类错误码，provider 三选一 `firecrawl_cloud/firecrawl_self_hosted/mock_adapter`） |
| `SourceSnapshot` | ✅ 功能等价 | `SnapshotMetadata` + `SnapshotStorage`（`packages/data-governance/src/storage.ts:5,23`）：content.md/html + SHA-256 `content_hash` + 双时间戳，`.tmp`+rename 原子落盘。注意：不保存 rawHtml/字节级原始响应 |
| `ExtractedRecord` | ⚠️ 商品专用 | `ExtractedProductRecord`（`crawlers/firecrawl-scraper/src/extractor.ts:8`），字段为品牌/标题/价格/品类 |
| `FieldEvidence` | ✅ 同名存在 | `packages/data-governance/src/evidence.ts:6`：行号+字符偏移+原文片段定位，SQLite 索引（`EvidenceIndexStore`），LLM 路径含 `hallucination_unverified` 置信度归零（`llm-extractor.ts:198`） |
| `DatasetVersion` | ❌ 仅字符串 | `datasetVersion = "v1.0-" + 时间戳`（`pipeline.ts:138`），无版本注册/不可变发布机制 |
| `AnalysisRun` | ❌ 不存在 | 最接近 `runProductAnalysisPipeline` + `PriceAnalysisReport`；规划的 DuckDB/Parquet 分析层未落地 |
| `DeliveryManifest` | ✅ 同名存在 | `packages/data-governance/src/manifest.ts:23`：schema/质量指标/文件级 SHA-256/防篡改核验 `verifyDeliveryPackage`（:181）。**缺口：限制声明（caveats）只在 analysis_summary.json，不在 manifest 本体** |

其他关键事实：

- **预算门禁**：`BudgetGate` fail-closed 双重检查（`packages/data-governance/src/budget.ts:33-85`，默认 50k tokens / $0.20 / 50 次调用），已接入 LLM 抽取器与 api-connector；**workbench 服务端无任何预算控制**。
- **LLM 抽取**：仓库内唯一 provider 是 `MockLlmProvider`（零网络调用），`ControlledLlmExtractor` 未接入主管线——**当前默认路径无外部 LLM 数据出站**，与报告 §10 的数据流关切一致，是既有优势。
- **事件协议**：6 类 NDJSON 事件（`events.ts:13`），runner 逐行转发、SSE 回放+实时推送，链路完整。

### 2.2 控制面（workbench）

报告 §5 假设的"本地任务服务拥有唯一控制权"已基本成立，且 seam 比报告预期的更干净：

- **多源分发已实现**：`SourceType = 'cninfo' | 'api-connector' | 'web-scraper'`（`apps/workbench/shared/task-params.ts:18`），`buildCrawlerSpawnSpec`（`apps/workbench/server/runner.ts:81-169`）按类型映射到三个爬虫 CLI（`node --import tsx <crawler>/src/main.ts --json`）。**新增一个渠道 = 扩一处校验 + 一个 spawn 分支 + 一个爬虫包**，不需要报告 §5.2 的 ChannelRegistry 插件架构。
- **任务状态机**：6 态 `queued/running/succeeded/partial/failed/canceled`（`shared/task.ts:4`），reducer 事件驱动，tasks.json 原子持久化，重启中断任务标 failed。报告 §8.4 假设的 DRAFT→AWAITING_APPROVAL→… 十余态审批流**不存在也不需要**（本地单用户工作台），不照搬。
- **取消**：SIGTERM → 5s 宽限 → SIGKILL（`runner.ts:64-73`），只杀直接子进程。

三个与报告验收用例直接相关的缺口：

| 缺口 | 证据 | 对应报告用例 |
|---|---|---|
| 凭据三重暴露面：CLI argv 明文 `--api-key`、浏览器 localStorage 明文、服务端仅存 process.env 重启即失 | `runner.ts:154`、`SettingsModal.tsx:72`、`routes/settings.ts:40-52` | §10.2、A11 |
| runner 无任务级超时、无进程组/树终止 | `runner.ts:29-73` | A02 |
| 无网络出口门禁：无私网/回环地址拦截，适配器子请求不受控 | 全仓无对应代码 | A10 |

### 2.3 流程状态

`.flow/` 上一轮"统一数据治理底座"周期已 DONE（6/6 任务完成，state.json 记录 2026-10-06）。当前处于周期间隙，适合以新提案进入下一轮。

## 3. 采纳决策（adopt / adjust / reject / defer）

| 报告建议 | 决策 | 依据 |
|---|---|---|
| 路线 B：审查知识 + 原生适配器 | **采纳** | 与现有三爬虫分发架构天然吻合，控制权留在 workbench |
| Firecrawl 主线保留 | **采纳（现状即如此）** | 主线已实现且 22 项测试覆盖，mock/云/自托管三模式 |
| 吸收渠道选型与操作知识 | **采纳，版本化快照** | 知识以本仓库文档形式固化并标注来源提交，不装 SKILL.md、不自动信任上游最新版 |
| AgentReachBridge（doctor 诊断桥） | **调整：暂缓建设** | 首个新渠道 RSS 用本机 fetch，doctor 提供不了"操作级验证"；桥本身是纯成本。触发条件：出现需检测外部 CLI/环境状态的真实渠道再评审 |
| 渠道注册表 ChannelRegistry | **调整：不建独立架构** | `SourceType` + `buildCrawlerSpawnSpec` + 场景模板已是事实上的静态注册表，够用 |
| 契约增量 schema_version 1.1 | **调整：以可选字段扩展现有类型** | 仓库尚无 schema_version 概念；直接在 TaskParams/SnapshotMetadata/Manifest 加可选字段，旧任务零影响，避免版本协商机制过早引入 |
| 任务状态机扩展 block_reason | **调整：仅加阻塞原因字段，不建审批态** | 本地单用户无审批角色；错误分类沿用既有 8 错误码 + 6 态 |
| A01–A20 验收用例 | **采纳适用子集**（见 §7） | 部分用例依赖暂缓的能力（诊断桥、云后端回退），标记不适用 |
| RSS 作为首个新增渠道 | **采纳为 PoC 候选** | 公开只读、无凭据、无登录态、复用 data-governance 全链，是验证"新来源进入既有治理链"的最小路径 |
| 凭据/出站治理先行 | **采纳，列为前置工作包** | 三个暴露面是引入任何带凭据渠道前的债务 |
| 社交登录态渠道、Jina/Exa、完整 Fork、平台商城 | **defer** | 与报告一致，后续独立范围变更 |
| 原样安装 SKILL.md / 统一 `agent_reach.search()` SDK / Agent-Reach 运行依赖 / 运行时安装上游工具 | **拒绝** | 与报告 §1.2 一致；本仓库现状（零命中）也说明无此必要 |

## 4. ADR：Agent-Reach 接入边界

**ADR-001（拟）：Agent-Reach 作为知识输入，不作为运行时依赖**

- **决策**：采用路线 B。Agent-Reach 的渠道目录、后端选型、操作文档作为"接入知识资产"吸收进本仓库文档（标注来源提交 `94f06c1` 与核对日期），不引入其 Python 包、不安装其 Skill、不在任务链路中调用其任何命令。
- **控制权**：任务/权限/路由/执行/标准化/证据/发布七项控制权全部保留在 workbench（TaskQueue + Runner seam）与 data-governance（快照/证据/manifest/预算）。新增渠道一律表现为"一个爬虫包 + 一处 spawn 分支"。
- **诊断桥**：暂缓。若未来建设，必须满足报告 §8.3 约束：默认关闭、宿主总 deadline、进程树终止、输出上限、缓存、禁用后主线无影响（A01 用例）。
- **供应链**：吸收的知识标注版本；新增第三方依赖（如未来 XML 解析库）必须锁定版本并单独评审；运行时禁止自行安装/升级任何上游工具（对应 A19）。
- **退出机制**：由于 Agent-Reach 不进运行时，"退出"= 删除知识文档，零代码影响。每个新增渠道可单独关闭（移除 SourceType 分支与场景入口），已冻结数据集读取不受影响。
- **前置条件**：固化 git 基线（提交当前未跟踪的 docs/、crawlers/firecrawl-scraper/、packages/），否则上述一切回归不可复现。

## 5. 契约增量（最小集）

原则：只加可选字段，全部落在既有类型上；不新建平行对象；旧任务/旧快照/旧 manifest 零破坏。

| 位置 | 增量 | 时机 |
|---|---|---|
| `apps/workbench/shared/task-params.ts` | `TaskParams` 联合层增加可选 `schemaVersion?: string`（挂载方式 `(A\|B\|C) & { schemaVersion?: string }`，不动其他包 domain 类型，先例：同文件 `CninfoTaskParams`）；新增 `SourceType = 'rss'`（WC-AR-04 落地时） | WC-AR-02/04 |
| `packages/data-governance/src/storage.ts` | `SnapshotMetadata` 增加可选 `response_type?: string`（内容文件形态，如 `feed_xml`/`markdown`，随接口现行 snake_case 命名）与 `truncated?: boolean`；**不加 `backend`**——既有 `provider` 字段承载后端标识（取值含 `firecrawl_cloud`/`firecrawl_self_hosted`/`mock_adapter`/未来 `rss_local`），落盘缺失的根因是采集引擎透传缺口，修复透传即可 | WC-AR-02 |
| `packages/data-governance/src/manifest.ts` | `DeliveryManifest` 增加可选 `limitations?: string[]`（把 analyzer 的 caveats 升格进 manifest，解决 §2.1 缺口）与 `operations?: { backend: string; toolVersion?: string }[]`（从快照 `provider` 去重聚合；旧快照无 provider 时 `operations` 键不存在，而非 `[]`） | WC-AR-02 |
| 兼容性验证 | 新增回归：无新字段的旧 JSON 照常解析；`verifyDeliveryPackage` 对含新字段的 manifest 照常校验 | WC-AR-02 |

> v1.1 修订说明（2026-10-15，WC-AR-02 红队后）：取消 `backend` 新字段——`SnapshotMetadata.provider` 已存在且已持久化（storage.ts:9/:88），取值集合与拟议 `backend` 恒等，不存在分叉场景；`createAndSaveDeliveryManifest` 生产调用方实为 2 个（cninfo、api-connector），firecrawl 管线的 manifest 为字面量构造（pipeline.ts），填充机制需同时覆盖两种构造路径。

报告 §7.3 的 `ChannelCapability`/`OperationRun` 独立存储 **不建**：能力信息以场景模板元数据 + README 表达，运行审计以既有任务日志 NDJSON（`data/workbench/logs/<id>.ndjson`）+ manifest 为准。出现第二个同构渠道后再评估抽象。

## 6. PoC 计划：公开 RSS 只读渠道

**目标**：验证"一个新增公开只读来源如何走完 快照 → 抽取 → 证据 → manifest → 工作台展示 全链"，不装 Agent-Reach，不阻塞主线。

- **新包** `crawlers/rss-collector`，照抄三爬虫既有模式：
  - `main.ts` CLI：`--urls`（逗号分隔的已批准 Feed）、`--limit`（条目上限，默认 50）、`-o/--out-dir`、`--json`、`--deadline-ms`；
  - `events.ts`：对齐 firecrawl-scraper 的 6 类 NDJSON 事件协议（start/scraping/snapshot_saved/failed/done/error），workbench reducer 可直接消费；
  - 采集：原生 `fetch` 拉 Feed 原文 → `SnapshotStorage` 存为 `content.xml` + metadata（含哈希与双时间戳）；**零新依赖**，PoC 手写最小 RSS/Atom 解析（样本格式固定）；正式化时再评估是否引入 XML 库；
  - 抽取：规则式 title/link/published/summary → `FieldEvidence`（`locateSnippet` 定位到 Feed 原文行/偏移）；原文没有的字段 `null + missing_reason`，禁止估算发布时间；
  - 交付：`createAndSaveDeliveryManifest` 生成 manifest + limitations；`BudgetGate` 限 `maxCalls = urls.length`。
- **workbench 接入**：`validateRssParams`（URL 域白名单、`maxFeedRequests ≤ 5`、不跟随条目链接）+ `buildCrawlerSpawnSpec` 增 `rss` 分支 + 场景入口（默认收起，验收后放开）。
- **数据流声明**：仅访问任务中批准的 Feed 域名；无凭据；无 LLM；不抓条目正文与附件（需要时另立任务走 web-scraper）。
- **验收**：
  1. 主线回归：现有 130 测试全绿 + mock 商品样板端到端不变（A18）；
  2. RSS 冻结样本 ≥20 用例：正常 Feed、Atom 变体、合法空 Feed（A06）、超时、截断、私网 URL 拦截（A10，依赖 WC-AR-05）、取消（A13）；
  3. 不装 Agent-Reach 全程可跑（A01）；无隐式安装/联网外目标（A19）。

## 7. 报告 A01–A20 用例适用性

| 用例 | 适用性 | 说明 |
|---|---|---|
| A01 未装 Agent-Reach 主线可跑 | ✅ 纳入常规回归 | 现状即不装，固化为永久断言 |
| A02 诊断永不返回 | ⏸ 暂缓 | 诊断桥暂缓；runner 超时+进程树终止（A02 的通用部分）归入 WC-AR-05 |
| A03 工具正常但网络不通 | ✅ | adapter 已有错误分类，补用例即可 |
| A04 凭据失效 | ✅ 后置 | RSS 无凭据；引入带凭据渠道前必须先过 WC-AR-00 |
| A05 退出码 0 但内容是挑战页 | ✅ | RSS/web 各补内容检查用例 |
| A06 合法空结果 | ✅ | 纳入 RSS PoC |
| A07 截断/部分结果 | ✅ | 纳入 |
| A08 未批准云后端回退 | ✅ | spawn 映射天然无回退，补断言 |
| A09 上游内容诱导执行命令 | ✅ | 抽取层不可信内容原则，补测试 |
| A10 私网/重定向越界 | ✅ | 依赖 WC-AR-05 出口门禁 |
| A11 私有数据拼入查询 | ⏸ | 当前无私有数据联查场景，后置 |
| A12 预算超额 | ✅ 部分 | BudgetGate 已有熔断测试，补 workbench 侧展示 |
| A13 取消/提交状态不明 | ✅ | 取消已有测试；"不重复提交"补断言 |
| A14 输出结构漂移 | ✅ | 解析失败保留原文、不猜字段（extractor 已有此原则，补用例） |
| A15 旧任务走旧后端 | ✅ | 可选字段兼容测试覆盖 |
| A16 重抓产生新观察 | ⚠️ 部分 | 无 DatasetVersion 机制，先保证新运行新目录不覆盖（现状即如此） |
| A17 篡改输出文件 | ✅ | `verifyDeliveryPackage` 已有测试，保持 |
| A18 原两样板回归 | ✅ | 纳入常规回归 |
| A19 无隐式安装/外呼 | ✅ | 纳入 |
| A20 只读渠道请求写入 | ✅ | RSS 无写操作，spawn 模板天然受限，补断言 |

## 8. 候选工作包

| 编号 | 内容 | 依赖 | 验收要点 |
|---|---|---|---|
| WC-AR-00 | **git 基线固化**：提交当前未跟踪/未修改文件 | 无 | `git status` 干净；130 测试在提交点可复现 |
| WC-AR-01 | 本采纳评审 + ADR（本文档） | WC-AR-00 | 评审通过并提交 |
| WC-AR-02 | 契约增量：三个可选字段 + 兼容回归（§5） | WC-AR-01 | 旧 JSON 全兼容；typecheck/test 绿 |
| WC-AR-05 | 执行治理增量：runner 任务级超时 + 进程组终止；URL 私网/回环拦截（对所有爬虫生效）；`--api-key` 从 argv 改为仅 env 注入 | WC-AR-01 | A02 通用部分、A10、argv 不再含密钥；既有取消测试不回退 |
| WC-AR-04 | RSS 适配器 PoC（§6），场景入口默认收起 | WC-AR-02、WC-AR-05 | §6 三组验收全过 |
| WC-AR-06 | 工作台体验与回归包：RSS 场景放开、来源类型/限制声明展示、A 用例固化为测试 | WC-AR-04 | 主线样板 + RSS 样板双回归绿 |
| WC-AR-03 | AgentReachBridge（**暂缓**） | 触发条件满足时另评审 | 届时按报告 §8.3 全部约束验收 |

顺序建议：00 → 01 →（02 ∥ 05）→ 04 → 06。除 00/01 外均可在独立分支进行，任一时刻主线可回归。

## 9. 对报告 §17.3 决策问题的回答

| 问题 | 回答 | 证据 |
|---|---|---|
| Firecrawl 主线真实状态 | **已实现、已测试**（M0 完成；M1 缺 DuckDB/Parquet 分析层；LLM 抽取未接主管线且仅有 Mock provider） | §2.1，130 测试含 22 项 firecrawl-scraper |
| 是否已有统一采集接口与证据对象 | 有：WebAcquisitionPort + FieldEvidence + DeliveryManifest + SnapshotStorage；缺 DatasetVersion 机制与 AnalysisRun | §2.1 |
| 是否有可靠进程/网络隔离 | **部分**：Runner seam 清晰（串行队列、SIGTERM→SIGKILL）；缺超时、进程树终止、出口门禁 | §2.2，WC-AR-05 补齐 |
| 首个新渠道选择与理由 | RSS：公开只读、零凭据、零新依赖、全链复用既有治理 | §6 |
| 诊断桥是否值得运行依赖 | **否**（暂缓）：RSS PoC 不需要；桥自身有阻塞与供应链风险 | §3 |
| 是否具备安全凭据注入 | **否**：argv/localStorage/重启即失三暴露面，WC-AR-00/05 先行治理 | §2.2 |
| 平台数据如何共用字段模型 | 走 data-governance 单一治理链：ExtractedRecord 以"渠道字段集 + 统一证据"表达，不为新渠道建平行体系 | §5 |
| 禁用新增能力如何保证主线回归 | 增量全部为加法（新 SourceType 分支、可选字段）；A01/A18/A19 固化为常规回归 | §7 |

## 10. 未验证项声明

- 未安装、未运行 Agent-Reach，未做任何真实平台采集（与报告附录 B 一致）。
- 报告对 Agent-Reach 源码行为的描述（16 渠道、doctor 语义、Jina 路径等）未在本仓库复核，吸收知识时以来源提交快照为准。
- 本文档所有代码事实基于 2026-10-15 工作区状态；WC-AR-00 提交前该状态不可复现。
