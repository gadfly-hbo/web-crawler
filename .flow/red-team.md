# 红队评审报告 — WC-AR-06 工作台体验与回归包

- **日期**：2026-10-16
- **评审对象**：`.flow/proposal.md`（WC-AR-06 提案，唯一被评审物）
- **方法**：`strategy-red-team` 技能——先 steelman 再攻击，排名 = 影响 × 可能性 × 验证成本
- **证据基线**：main @ 2f6a931 工作区（仅 `.flow/proposal.md` 为本批改动）；所有攻击点附仓库文件行号；含一次仅写 `/tmp` 的 CLI 探针实证（已清理）

## Verdict：GO-WITH-CONDITIONS

核心路线成立：提案声称的全部「前置已备」经代码核实**全部属实**（见 What's Well-Reasoned）。但有一个交付物（A18）在「零改动约束 + 既有 F6 缺陷」夹击下当前无有意义的实现路径，一个「开放问题」（TaskList 缺口）实为本批必做项而非可选。无 kill 判据被现有证据整体满足，不 KILL。

**进入 PRD/GRILL 前必须裁决的条件：**

1. **C1（A18 断言层级）**：在「降级断言」「包级断言」「把 F6 修复纳入为决策 6 显式例外」三选一并写入 PRD（见 KA1）。
2. **C2（TaskList 分区转必做）**：开放问题 1 的答案是否定的——不可递延，且必须同时补 `product-price` 与 `rss`（见 KA2）。
3. **C3（limitations 落点限定）**：manifest limitations 展示只对 rss 与商品类任务有内容，cninfo/api 任务本批无零改动数据来源——验收措辞不得写成「对所有来源生效」（见 KA3）。
4. **C4（A19 白名单先行）**：静态扫描必须带预定义 allowlist，否则第一天就红（见 KA4）。
5. **C5（场景接入五触点完整性）**：PRD 把 reducer/getTaskParams/types/NewTask/直采按钮列为同一任务完成判据（见 KA5）。

---

## Top Kill-Assumptions（按排名）

### KA1（排名 1）：A18「mock 商品样板端到端不变」可在不改爬虫的前提下固化为有意义的端到端断言

- **Claim**：决策 5 —— A18 固化为「mock 商品样板端到端不变」的永久回归；决策 6 —— 不改四爬虫行为。
- **Steelman**：`apps/workbench/test/rss-e2e.test.ts` 已证明该模式可行——TaskQueue + `makeCrawlerRunner` 真实 spawn CLI、mock 数据零网络、断言事件流/终态/manifest 落盘。照搬到 firecrawl-scraper（`--mock`）似乎是一天的活。handoff 也说「已有测试事实」。
- **攻击与实证**：workbench 级的商品样板真实 spawn e2e **今天不存在**（`apps/workbench/test/evidence-api.test.ts:13-17` 用 dummyRunner；api/queue 测试均不 spawn）。若补上它并断言分析产物，会立即撞上 WC-AR-04 handoff 记录在案、本批声明不修的 **F6 布局地雷**，且我已实证其效应：
  - `apps/workbench/server/runner.ts:207-209`：workbench 对商品任务默认传 `--analyze`；
  - `crawlers/firecrawl-scraper/src/main.ts:199`：analyze 读 `<outDir>/snapshots`；
  - `packages/data-governance/src/storage.ts:33-35`：`getSnapshotsDir()` 返回 baseDir 本身，引擎把快照写在 `<outDir>/snap_*/` 顶层；
  - `crawlers/firecrawl-scraper/src/pipeline.ts:51-52`：readdir 异常被吞 → 按零快照继续。
  - **探针实证**（`node --import tsx src/main.ts --json --mock --analyze --baseline 'Brand A' --urls <样板9URL>` 写 `/tmp`）：退出码 0，**`totalRecords: 0`、`brandSummaries: []`**，无 `snapshots/` 目录，快照落在顶层 `snap_*`。即今天经 workbench 跑 mock 商品样板，任务「成功」但中位数分析恒为空。
  - 三难：断言分析内容 → 今天必红；放宽到只断言「succeeded + 事件流 + 快照落盘」→ 把空分析这一缺陷行为固化为「样板不变」，给 F6 背书；修 F6 → 改 firecrawl-scraper，违反决策 6。
- **Fails if**：PRD 同时坚持「断言 mock 样板分析内容（如 Brand A/B/C 中位数）」与「零改动四爬虫」。
- **Evidence to get this week**：本报告探针已给出；PRD 阶段只需做断言层级决策。
- **Kill criterion**：若三选一（降级断言 / 仅包级断言（`crawlers/firecrawl-scraper/test/pipeline.test.ts:11` 已有，且其自传 snapshotsDir 恰好绕开 F6）/ 把 F6 修复列为决策 6 显式例外）无法裁决，则 A18 的 workbench 级 e2e 子项砍掉，A18 降级为「包级 pipeline 断言 + workbench spawn 冒烟（显式标注不覆盖分析内容，F6 在案）」。
- **Cheapest test**：15 行 spawn 测试断言 `analysis_summary.json.totalRecords > 0` → 预期失败，即证实冲突（≈30 秒，我已用等效探针完成）。
- **处置建议**：降级断言 + F6 独立小批（handoff 已建议）；A18 措辞从「端到端不变」改为「采集链路不变（事件流/快照/manifest），分析链路待 F6 修复后补强」。

### KA2（排名 2）：TaskList 分区缺口是「可顺带、可递延」的开放问题

- **Claim**：开放问题 1 把 product-price 在任务列表不可见列为「现状疑点，是否顺带补齐」。
- **Steelman**：rss 类目已在决策 4 committed（「任务列表按来源分区展示（含 rss 类目）」）；product 任务并非完全不可达——「数据文件」视图不过滤类目（`apps/workbench/web/src/views/FilesView.tsx:7`），新建后也直达详情页；提案把它列为开放问题而非隐瞒，态度诚实。
- **攻击与实证**：缺口为真且是**既有缺陷而非设计**：
  - `apps/workbench/web/src/views/TaskList.tsx:22-24` 只计算 cninfo/weather/api 三组；`:136-138` 只渲染三个 `renderSection`；`:68-99` tabs 无 product-price/rss 按钮 → 正式态商品任务在「全部」视图与所有 tab 中均不可见（仅 preview 任务例外展示）。
  - 共享层早已支持五类目：`apps/workbench/shared/task-params.ts:128-160`（`TaskCategory` 含 `product-price`/`rss`，`getTaskCategory` 与 `CATEGORY_LABELS` 完备），卡片 chip 也已按类目正确渲染（TaskList.tsx:30-38）——唯独分区/页签漏接。
  - `git log` 证实三分区写法自 `15950a3`（与商品场景同批引入）起未动，属「写了列表再加场景忘了扩列表」的遗漏，不是「商品任务从别处看」的有意设计。
  - 对本批的直接后果：新 RSS 任务创建后回到「采集任务」页即消失——除非实现恰好按决策 4 加了 rss 区。而开放问题的真正风险是实现者照抄硬编码模式「只加一个 rss 数组」，同一处代码继续漏 product-price。
- **Fails if**：实现沿用三分区硬编码模式只增 rss；或本批交付后主列表仍看不到 product-price 任务。
- **Evidence to get this week**：已取得（上述行号）。
- **Kill criterion**：若修复需超出一个小任务范围（如引发既有用例回退）才递延；实测修复 = 两个 filter 数组 + 两个 tab 按钮 + 两个 renderSection（或改为由 `CATEGORY_LABELS` 驱动的通用分区），≈10 行、零既有测试依赖（无测试断言 TaskList 结构），**不满足递延条件**。
- **Cheapest test**：红队已完成；实现后验收 = 建一个 mock 商品任务 + 一个 rss 任务，回到列表页两卡可见且分区正确。
- **处置建议**：转为本批必做（含 product-price），并建议实现为类目驱动的通用分区，防第七类来源再次遗漏；同时统一空态规则（现 api tab 仅在有任务时渲染，TaskList.tsx:90-98，rss/product 应对齐）。

### KA3（排名 3）：「manifest limitations 展示」加上区块就有内容可显

- **Claim**：决策 4 —— 任务详情展示限制声明（manifest limitations 面向用户可见）；决策 6 —— manifest 读取路由已存在则不动。
- **Steelman**：路由确实现成——`apps/workbench/server/routes/evidence.ts:248-264` 原样返回 `manifest.json`；schema 现成——`packages/data-governance/src/manifest.ts:46,178`（可选 `limitations?: string[]`，governance 测试覆盖持久化与缺省省略）；rss manifest 恒有限制声明（`crawlers/rss-collector/src/collector.ts:336-340`）；商品 manifest 也有（探针实测 4 条 caveats）。前端零后端改动即可拿到数据。
- **攻击与实证**：数据面对一半来源是空的、且一个展示位根本不渲染——
  - `crawlers/cninfo-reports/src/engine.ts:335-352` 与 `crawlers/api-connector/src/engine.ts:422-441` 调 `createAndSaveDeliveryManifest` **不传 limitations** → 财报与通用 API 任务的详情区块永远无内容；补数据即改爬虫，违反决策 6。
  - `apps/workbench/web/src/views/TaskDetail.tsx:241-246`：product-price 成功任务路由到 `ProductPriceDashboard`，`UniversalManifestCard` 不渲染 → 商品任务即使 manifest 有 limitations 也看不到，除非另加落点。
  - 开放问题 3「manifest 区块 vs 静态文案」因此不是二选一的口味题：静态边界声明已存在且覆盖四来源（`apps/workbench/web/src/App.tsx:428-436`，含 rss 分支），manifest 区块本批只有 rss/商品两来源有料。
- **Fails if**：验收被理解为「所有来源任务详情均显示 manifest limitations」。
- **Evidence to get this week**：已取得（四个 manifest 构造调用点 + 探针）。
- **Kill criterion**：若 PRD 要求 cninfo/api 也显示 manifest 级 limitations → 本批无零改动路径，该子项砍或改爬虫范围。
- **Cheapest test**：对一个 rss 任务 `curl /api/tasks/:id/manifest | jq .limitations`（rss-e2e 已保证非空）。
- **处置建议**：UI Contract 明确落点 = `UniversalManifestCard` 有则显示 + 商品面板择机补 + 保留既有静态边界声明；cninfo/api 补 limitations 列为递延（一行参数级改动，归下一批爬虫小改）。

### KA4（排名 4）：A19「测试文件无外网 URL」静态扫描可直接落地

- **Claim**：开放问题 4 —— A19 用「静态扫描测试文件的外网 URL」证明无外呼。
- **Steelman**：全仓测试确无真实外呼（本红队全量扫描 6 个包的 test 目录）：主流是 `127.0.0.1`/`localhost` 本地 http server 与 RFC 2606 `example` 族 fixture，与提案预期一致；「本地与 example.com 不算外呼」的直觉方向正确。
- **攻击与实证**：误报面已具体存在，无白名单的扫描第一天就红——
  - `crawlers/api-connector/test/cli.test.ts:19`：`https://httpbin.org/get?page={{page}}`——**真实外部域名**（仅作合法配置 fixture，runCli 只跑 `-h` 与非法配置，从不实际请求，但纯 URL 扫描分不清）；
  - `apps/workbench/test/api.test.ts:410`：`https://api.firecrawl.dev`（baseUrl 字符串 fixture）；
  - `http://www.w3.org/2005/Atom`（XML 命名空间，非网络请求）；
  - firecrawl 测试中 `https://mysite.com/...`（可注册真实域名的 fixture）；
  - `apps/workbench/shared/task-params.ts:206-230`：wttr.in 模板常量（若扫描范围含 shared 则再添一误报）。
- **Fails if**：白名单收敛不了，或为了过扫描把真实域名默默加入白名单而不加标注。
- **Evidence to get this week**：本报告的 URL 清单即基线；PRD 只需定 allowlist。
- **Kill criterion**：allowlist 超过约十条目、或需整文件/整目录豁免 → 放弃静态扫描形态，改为测试内 undici 全局 dispatcher 记录拦截（证明「跑了也没出网」强于「文件里没写」）。
- **Cheapest test**：按本报告清单写 20 行扫描脚本对全仓 test 目录跑一遍，数误报。
- **处置建议**：PRD 预定义 allowlist（`example.com` 及 `*.example.com`、裸 `.example` TLD 变体如 `brand-a.example`/`x.example`、回环/私网字面量、`www.w3.org` 命名空间），并顺手把 `httpbin.org`/`mysite.com` fixture 改成 example 域（纯测试文件改动，不违反决策 6）；A19 的另一半「依赖清单无新增外部包」建议固化为「pnpm-lock importers 依赖名集合 ⊆ 已知基线集合」断言而非逐版本比对，避免未来合法升级触发误报。

### KA5（排名 5）：新场景接入是纯加法，漏改也不会静默出错

- **Claim**：决策 3/6 —— RSS 场景放开是表单层加法，后端不动。
- **Steelman**：类型层已开闸（`task-params.ts:22` SourceType 含 rss、`:97-99` validateTaskParams 已分发 validateRssParams）；`COLLECTOR_SCENARIOS` 既有断言用 `includes`（`apps/workbench/test/task-params.test.ts:167-172`），加卡零回退；服务端链路全通（见 Well-Reasoned）。
- **攻击与实证**：两处**静默回落**，TS 均不报错，是本批最可能的实现级翻车点——
  - `apps/workbench/web/src/views/new-task/reducer.ts:156-158`：`SET_SCENARIO` 对 `!== 'cninfo-reports'` 的一切场景回落 `api-connector`——rss 场景漏改则 sourceType 错；
  - `reducer.ts:136-147`：`getTaskParams` 无 rss 分支时回落 **cninfo 形参数**——表单看似填了 Feed URL，提交后服务端按 cninfo 任务 spawn。
- **Fails if**：任务清单未把 reducer 映射 / getTaskParams 分支 / types.ts 表单态 / NewTask.tsx 条件渲染与按钮分支 / RssPicker 五触点绑为同一任务的完成判据。
- **Kill criterion**：无（完整性约束，不推翻提案）。
- **Cheapest test**：接入后经 UI 建一个 rss 任务，断言列表标题前缀为「RSS 采集 · 」（`summarizeTask` 已保证，`task-params.ts:108-110`）。
- **处置建议**：PRD 五触点清单化；直采路径直接复用 `NewTask.tsx:142-152` 的 product 先例（stage 停 1、按钮直调 `startCollect()`）；StageBar 是否为无预览场景改两段式留给 UI Contract（现状 product 先例让「预览确认」阶段永远 todo，rss 沿用则同病，见 UI-GATE 节）。

---

## 六项指定核查点逐项裁定

| # | 核查点 | 裁定 | 关键证据 | 处置 |
|---|---|---|---|---|
| 1 | TaskList 分区是否真漏 product-price | **是，既有缺陷非设计** | TaskList.tsx:22-24/136-138/68-99 三分区硬编码；task-params.ts:128-160 五类目齐全仅列表未接；自 `15950a3` 未动；次入口仅 FilesView（FilesView.tsx:7，无类目 chip） | 本批必做，含 product-price 与 rss（KA2） |
| 2 | UniversalManifestCard 是否已展示 limitations；manifest 路由 | **未展示**（本地 `ManifestData` 接口无该字段，UniversalManifestCard.tsx:3-33）；**路由存在**（evidence.ts:248），原样返回落盘 manifest.json（含 limitations 时透传） | 前端加区块即可，零后端改动；但 cninfo/api manifest 无 limitations、商品任务不渲染此卡（KA3） | UI Contract 定落点；cninfo/api 补数据递延 |
| 3 | RssPicker 前端基建 | **全部就绪**：`SET_SCENARIO` 映射待扩（reducer.ts:151-159）；直采先例现成（NewTask.tsx:142-152，product 场景 stage 停 1 直接 startCollect）；StageBar 为硬编码三段（StageBar.tsx:10-14），无预览场景沿 product 先例会有「预览确认」永远 todo 的小瑕疵 | 两处静默回落陷阱（KA5）；`validateRssParams` 复用零成本（shared/task-params.ts:20 已 re-export，package.json 已依赖 `rss-collector: workspace:*`） | PRD 五触点清单 + UI Contract 定 StageBar 形态 |
| 4 | A01/A19 断言形态 | **可行**。A01：全仓 `agent[-_]?reach` 仅命中 3 个文档文件，pnpm-lock 零命中，无任何 postinstall/preinstall 脚本——断言「依赖名/锁文件/安装脚本不含该模式」便宜且真实。A19：静态扫描可行但必须带 allowlist（httpbin.org、api.firecrawl.dev、mysite.com、w3.org 命名空间、wttr.in 为已定位误报面） | KA4；建议 lockfile 依赖集合断言而非 URL 泛扫单打独斗 | C4 写入 PRD |
| 5 | A18 既有覆盖 | **workbench 级真实 spawn 的商品 e2e 不存在**（evidence-api.test.ts:13 dummyRunner；api/queue 测试不 spawn）；包级有 `pipeline.test.ts:11`（mock 端到端，自传 snapshotsDir 绕开 F6）与 engine/adapter 测试；cninfo 侧 workbench 仅 parity 拒绝用例（parity.test.ts）+ 包级 14 用例 | A18 若做 workbench 级 = **新增**（非重命名/补强），且撞 F6（KA1 探针实证 totalRecords=0） | C1 三选一 |
| 6 | 来源类型展示现状与决策 4 重叠 | 卡片 chip **已**按类目渲染（TaskList.tsx:30-38，含 product-price/rss 的 icon+label），TaskDetail 顶栏同（TaskDetail.tsx:62-73）；缺口仅在**分区与页签**。决策 4 与现状是互补而非重复——分区补齐后 chip 与分区天然一致 | App.tsx:397-406 已有 rss 的 Feed 数/条目上限/软超时展示（handoff 所述「rss 分支」在 App.tsx 侧栏，非 TaskDetail） | 分区补齐即闭环，无需动 chip |

## UI 范围 × UI-GATE 匹配度

**匹配，不过重也不缺**。四个触点（场景卡、RssPicker 表单、列表分区、limitations 区块）全部是既有组件与设计语言内的加法：场景卡直接由 `COLLECTOR_SCENARIOS` 数据驱动（ScenarioSelector.tsx:22-38，加一条数据即得一张卡）；表单有 ProductPricePicker/WeatherPicker 成熟范式；分区有 renderSection 范式；manifest 卡有现成卡片骨架。无新页面、无新样式体系、无路由变更。`state.json` 已预留 ui-contract.md 工件与最多 2 轮 UI-GATE，流程负担相称。

UI Contract 必须裁决的四个点（本报告已给出证据基础）：① rss 表单字段面——urls 分隔方式、limit 是否露出、deadlineMs 建议不露（CLI 默认 60s，`rss-collector/src/domain/validation.ts:11`）；② 分区/页签的空态与顺序规则（五类目，对齐现有「api tab 无任务则隐藏」还是常显）；③ limitations 展示落点（KA3：manifest 区块仅 rss/商品有料 + 静态边界声明保留）；④ 无预览场景的 StageBar 形态（沿 product 先例的瑕疵 vs 两段式变体）。

## What's Well-Reasoned

提案的**事实性声称经核实全部成立**，这在同类提案中少见：

- 「服务端已备、dryRun 钳 false」：`apps/workbench/server/routes/tasks.ts:128-129` 原文注释即此，rss 参数归一化在 `tasks.ts:35-47`，spawn 分支在 `runner.ts:163-183`，workbench 级两条真实 spawn e2e 已存在（rss-e2e.test.ts:30,100，覆盖取消与 partial 终态、manifest 落盘）。
- 「表单校验直接复用 validateRssParams」：`shared/task-params.ts:97-99` 已接线分发，workbench `package.json` 已声明 `rss-collector: workspace:*`——零新依赖零胶水。
- 「既有 194 用例」：handoff 记录 194/194（分包 10+27+20+32+14+91）；本红队静态对账 workbench 91 = 84 个 `test(` 调用点 + parity 循环生成 7，可对上（未实跑，见下节）。
- A01 的前提「不装 Agent-Reach」是**真现状**而非愿望：依赖、锁文件、安装脚本三面零痕迹，断言成本极低。
- 已拒绝的替代方案（不做 RSS 预览、不做白名单配置面）与代码现状自洽：服务端钳制与「任务即白名单」（validation.ts 头注）都是 WC-AR-04 已落地的既成决策，不是本批新赌注。
- 开放问题的提出方式诚实——四个开放问题中三个（TaskList 疑点、limitations 落点、A01/A19 形态）与本红队独立核实的结果方向一致，说明提案作者对不确定性有正确标记。

## What I Couldn't Assess

- **未实际运行** `pnpm test && pnpm typecheck && pnpm build`：194 基线取自 handoff 记录 + 静态对账；红队只读约束下未复跑全量（含真实 spawn 的 e2e）。任务切分前应跑一次取新基线。
- **dev-flow 技能本体未读**：UI-GATE 机制以 `state.json`（ui_gate_cycles max 2、ui-contract 工件）与提案自述为据，未核对流程定义原文。
- `.flow/prd.md` 为上一批（WC-AR-04）入库产物，未纳入本次评审；本批 PRD 尚未存在。
- A18「cninfo 样板」的包级断言强度只核到存在性（`crawlers/cninfo-reports/test/` 两文件），未逐条评估是否足以承载「样板回归」语义。
- 单模型评审（技能默认未启用 cross-model）；F6 结论虽经探针实证，但「workbench 全链跑商品样板的分析产物为空」未在 workbench 内复现（等效 CLI 探针 + 代码路径已足够支撑结论）。
