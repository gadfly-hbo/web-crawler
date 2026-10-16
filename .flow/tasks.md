# WC-AR-06 任务分解（tracer-bullet 垂直切片）

基线：194/194 全绿（2026-10-16 实跑确认，governance 10 + firecrawl 27 + api-connector 20 + rss 32 + cninfo 14 + workbench 91）。

- [x] T1. RSS 场景五触点 + RssPicker 表单 + StageBar 两段式（C5/G1/G2/G9/G11 + UI 裁决①④）
- [x] T2. 任务列表五类目数据驱动分区（C2/G3 + UI 裁决②）
- [x] T3. UniversalManifestCard 限制声明区块（C3 + UI 裁决③）
- [x] T4. A01/A19 回归断言 + fixture 域名修正（C4/G6/G7/G8/G10）
- [x] T5. A18 mock 商品样板 workbench 冒烟 e2e（C1/G5）
- [x] T6. VERIFY 全量门禁

---

## T1. RSS 场景五触点 + RssPicker 表单 + StageBar 两段式

### What to build

UI 裁决①④ + G1/G2/G9/G11 的完整落地：①`ScenarioId` 增 `'rss'`、`COLLECTOR_SCENARIOS` 按 G9 序（第 3 位）增卡（卡面三字段按合同 §4 逐字）；②shared 增 `SCENARIO_SOURCE_TYPES: Record<ScenarioId, SourceType>` 显式映射（custom-request→api-connector 转显式），reducer `SET_SCENARIO` 索引取值；③表单态增 `rssUrlsText`/`rssLimitText`（types.ts + initialNewTaskState），`getTaskParams` 增 rss 分支（换行解析+trim+去空+去 # 注释行、空数组透传不回填、limit trim 空→undefined 非空→Number 透传）；④RssPicker 组件（.fld 体系 + textarea 等宽 + placeholder/label/hint/计数按合同裁决①逐字）；⑤NewTask.tsx 条件渲染 + 「开始 RSS 采集」直采按钮（stage 停 1 直调 startCollect）；⑥StageBar 增 `direct?: boolean` 变体（两段式，既有场景零改动）；⑦`.fld textarea` 选择器补全。校验零新代码（validateTaskParams 已分发）。

### Acceptance criteria

- [ ] getTaskParams rss 分支纯函数测试：换行/注释/空行解析、空数组、limit 边界（NaN/越界透传）
- [ ] COLLECTOR_SCENARIOS rss 卡字段级断言（G4：id/title/badge/category/描述含「任务即白名单、不抓正文」，序=第 3 位）
- [ ] SCENARIO_SOURCE_TYPES 覆盖全部五 ScenarioId（TS Record 编译期保证 + 测试断言 rss→'rss'）
- [ ] vite build 过（UI 层编译验证）；既有 194 用例零回退

### Blocked by

None - can start immediately

---

## T2. 任务列表五类目数据驱动分区

### What to build

UI 裁决② + G3：`views/` 下新建纯 ts 模块 `partitionTasks(tasks): { preview: TaskRecord[]; byCategory: Record<TaskCategory, TaskRecord[]> }`；TaskList 改造——tabs 与「全部」视图 sections 由五类目数据驱动（顺序=TaskCategory 声明序 cninfo/product-price/weather/api/rss；空类目隐藏 tab 与分区；任务总数 0 走既有 .empty）；label/icon 单源 `CATEGORY_LABELS`（F1 文案收敛按已批准合同执行）；「⏳ 待确认的临时预览」区与「全部 (N)」计数语义不动；卡片 renderCard 零改动。

### Acceptance criteria

- [ ] partitionTasks 纯函数测试：五类目各一任务 + preview 任务 → 五分区正确、preview 单列
- [ ] 空类目不产生分区（byCategory 值为空数组时视图不渲染——纯函数返回全量，视图层过滤）
- [ ] vite build 过；既有用例零回退

### Blocked by

None（与 T1 可并行；同文件无交集）

---

## T3. UniversalManifestCard 限制声明区块

### What to build

UI 裁决③：UniversalManifestCard 的 ManifestData 接口增 `limitations?: string[]`；指标网格之后、「查看数据指纹」折叠区之外常显「⚠️ 限制声明 (manifest limitations)」列表（沿卡内 slate 语系：#e2e8f0 分隔线 + 12px）；无 limitations 整块不渲染不占位；渲染条件（cat !== 'product-price' && succeeded）与其余区段零改动。

### Acceptance criteria

- [ ] 代码对照合同 §0-裁决③ 与 §4 逐字（区块标题、列表形态、无则不渲染）
- [ ] vite build 过；卡片其余区段 diff 为零

### Blocked by

None（与 T1/T2 可并行）

---

## T4. A01/A19 回归断言 + fixture 域名修正

### What to build

`apps/workbench/test/adoption.test.ts`（PRD 决策 9-11 + G6/G7/G8/G10）：**A01** 三断言——全仓 pnpm-lock 文本不含 `agent[-_]?reach`；各 package.json scripts 无 postinstall/preinstall；全部 7 个 importers 的 deps∪devDeps 依赖名并集 ⊆ 内联基线 Set（读各 package.json，失败信息列出新增名）。**A19** 静态扫描——从仓库根动态发现 `**/test/**` 全文本文件（.ts/.tsx/.mjs/.xml/.json 等，排除 node_modules/.git/data/out/dist/.flow），提取 `https?://` 主机名，经归一化（小写/去尾点）后须命中：后缀规则（.example/.example.com/.localhost）、IP 字面量解析豁免（点分/整数/十六进制/八进制 → 回环/私网/0.0.0.0/公网边界段 11.0.0.1 与 172.15.0.1）、6 个显式条目（purl.org/www.w3.org/api.firecrawl.dev/evil.com/11.0.0.1/172.15.0.1，各带注释）、无点非 IP token 忽略（模板串残片）。**fixture 修正**：`httpbin.org`→`httpbin.example.com`（api-connector cli.test.ts）、`mysite.com`→`mysite.example.com`（firecrawl 测试）。

### Acceptance criteria

- [ ] A01 三断言绿且故意注入假依赖名时红（自验：临时加一条再撤，或断言逻辑覆盖足够）
- [ ] A19 扫描当前全仓零失败（对齐 G7 盘点的 60+ 主机名）；扫描器自文件天然过 allowlist（注释说明）
- [ ] fixture 修正后 firecrawl/api-connector 各自测试仍绿

### Blocked by

None（与 T1-T3 可并行）

---

## T5. A18 mock 商品样板 workbench 冒烟 e2e

### What to build

G5 三裁决：`apps/workbench/test/product-smoke-e2e.test.ts`——TaskQueue + makeCrawlerRunner 真实 spawn firecrawl-scraper CLI（mock 样板 9 URL、`--mock --analyze` 由 spawn 分支默认注入，零网络无需豁免 env）；断言：终态 succeeded（done.summary.failed=0 → classifyDone）、事件流完整（JSON.parse 内联解析：start/scraping×9/snapshot_saved×9/done，不断言 counts——reducer 方言差异）、快照落盘按 F6 现状布局（顶层 `snap_*` 目录 ×9，断言旁注 `TODO(F6)`：修复批改为 snapshots/ 断言）、manifest.json 落盘；**显式标注不覆盖分析内容**（F6 地雷在案：analyze 读空目录 totalRecords=0，注释引用 handoff）。waitForTerminal 辅助复制（不提取）。

### Acceptance criteria

- [ ] e2e 绿：succeeded + 事件流 + 9 快照 + manifest
- [ ] 测试文件含 TODO(F6) 标注与「不覆盖分析内容」声明
- [ ] 既有用例零回退

### Blocked by

None（与 T1-T4 可并行）

---

## T6. VERIFY 全量门禁

### Acceptance criteria

- [ ] `pnpm test && pnpm typecheck && pnpm build` 三段 exit 0，基线 194 + 新增全绿
- [ ] 记录 verify_command/timeout 与各包计数入 state

---

## 完成证据（2026-10-16）

- **T1**：new-task-rss.test.ts 4/4 绿（getTaskParams rss 分支换行/注释/空数组/limit NaN 透传、rss 卡字段级断言 G4、卡序第 3 位 G9、SCENARIO_SOURCE_TYPES 五键 G1）；workbench 95→；typecheck（含 web tsconfig）过；vite build 过。实现：task-params（ScenarioId/rss 卡/映射表/CATEGORY_ORDER）、types/reducer（rssUrlsText/rssLimitText/SET_RSS 分支）、RssPicker.tsx、NewTask 条件渲染+直采按钮、StageBar direct 两段式、.fld textarea 样式。
- **T2**：task-partition.test.ts 3/3 绿（五类目各归其区含 weather 细分、preview 单列、空数组五键恒存在）；TaskList 改为 CATEGORY_ORDER 数据驱动 tabs/sections、空类目隐藏、label 单源 CATEGORY_LABELS（F1 收敛按已批准合同执行）；build 过。
- **T3**：UniversalManifestCard 增 limitations?: string[] + 指标网格后常显列表（slate 语系、无则整块不渲染）；typecheck+build 过，其余区段零改动。
- **T4**：adoption.test.ts 2/2 绿——A01 三断言（lock 无 agent-reach 模式、7 个 package.json 无 postinstall/preinstall、依赖名并集 ⊆ 15 名基线）；A19 扫描 51 个 test 文本文件零违规（规则化 allowlist：后缀 .example/.example.com/.localhost、点分数字与 IPv6 括号经 egressBlockReason 判类【评审 F-1 修复：非公网放行、公网仅 11.0.0.1/172.15.0.1 边界清单，注入 8.8.8.8 探针实证拒绝】、无点整数/十六进制 token 现状整体放行【评审 R2-1 记录递延】、剥 userinfo/端口/模板串残片、4 显式条目带注释）；fixture 修正 httpbin.org→httpbin.example.com、mysite.com→mysite.example.com（firecrawl 27/27、api-connector 20/20 仍绿）。红灯修复记录：repoRoot 少退一级、端口吞入主机名两轮。
- **T5**：product-smoke-e2e.test.ts 1/1 绿——真实 spawn firecrawl mock 样板（零网络），succeeded + start/scraping×9/snapshot_saved×9/done 事件流 + 顶层 snap_*×9（TODO(F6) 标注）+ manifest 1.0.0。
- **T6 / VERIFY**：`pnpm test && pnpm typecheck && pnpm build` 三段 exit 0，**204/204**（governance 10 + firecrawl 27 + api-connector 20 + rss 32 + cninfo 14 + workbench 101；基线 194 + 新增 10），实测约 11s。
