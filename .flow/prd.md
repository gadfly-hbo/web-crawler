# PRD — WC-AR-06 工作台体验与回归包

- 规格 precedence：`.flow/proposal.md` ＞ 本文件；红队 `.flow/red-team.md`（GO-WITH-CONDITIONS）的 C1–C5 已逐条吸收并标注 KA 编号。
- 发布方式：仓库未配置 issue tracker，PRD 落盘 `.flow/prd.md`（既有降级惯例）。

## Problem Statement

RSS 渠道（WC-AR-04）后端全链已就绪，但工作台上用户看不见也用不了：场景库没有 RSS 卡片、表单没有 Feed 输入、任务列表分区硬编码遗漏了商品与 RSS 两类任务、任务详情看不到 manifest 限制声明。同时，采纳文档承诺的 A01/A18/A19 三项常规回归断言尚未固化为测试。

## Solution

工作台体验层纯加法：RSS 场景卡 + Feed 表单（直采路径，无预览）；任务列表改为类目驱动的通用分区（补齐商品与 RSS）；任务详情 manifest 卡增限制声明区块（有则显示）。回归包：A01（不装 Agent-Reach 可跑）与 A19（无隐式安装/外呼）固化为仓库级断言，A18 以「采集链路不变」层级固化 mock 商品样板的 workbench 级 spawn 冒烟（分析链路显式递延至 F6 修复批）。

## User Stories

1. 作为运营人员，我想在场景库点选「公开 RSS 资讯」卡片并粘贴 Feed URL 直接开始采集，以便不用 API 工具就能用上新渠道。
2. 作为运营人员，我想在任务列表按类目分区（财报/商品/气象/API/RSS）找到我的全部历史任务，以便商品和 RSS 任务不再「创建后消失」。
3. 作为数据消费者，我想在任务详情看到交付 manifest 的限制声明（如"发布时间不做估算"），以便知道数据能信什么、不能信什么。
4. 作为平台维护者，我想让 A01/A18/A19 成为每次全量测试自动执行的永久断言，以便"不装外部 agent 工具、无隐式外呼、样板不回归"从口头承诺变成门禁。

## Implementation Decisions

### RSS 场景放开（C5：五触点绑定为同一完成判据）

1. **数据**：`ScenarioId` 增 `'rss'`；`COLLECTOR_SCENARIOS` 增 RSS 卡（title「公开 RSS 资讯采集」、badge「只读 Feed · PoC」、category crawler、描述含"任务即白名单、不抓正文"）。
2. **表单态与映射**（两处静默回落陷阱必须同时闭合）：表单态增 `rssUrlsText`（换行分隔，默认空）与 `rssLimitText`（可选）；`SET_SCENARIO` 增 rss→`'rss'` 映射；`getTaskParams` 增 rss 分支——`{sourceType:'rss', name:'公开 RSS 资讯采集', urls: 换行解析+trim+去空+去 # 注释行（沿商品样板先例）, limit: 可选正整数}`。**deadlineMs 不露出**（CLI 默认 60s 足够，开放问题落定）。
3. **RssPicker 组件**：镜像 ProductPricePicker 形态——Feed URL 文本域（每行一个，placeholder 示例）、条目上限可选输入、既有 `form-errors` 中文错误清单；校验经 `validateTaskParams` 已有分发自动生效。
4. **直采路径**：沿 product 先例——stage 停 1，按钮「开始 RSS 采集」直调 `startCollect()`，不出现「预览数量」（RSS 无 dry-run，服务端钳 false）。StageBar 形态裁决留给 UI Contract。

### 任务列表类目驱动分区（C2：本批必做，含 product-price）

5. **通用分区**：TaskList 的 tabs 与 sections 由五类目（cninfo/product-price/weather/api/rss）数据驱动生成（替换三分区硬编码），防第七类来源再漏；空态规则统一为「该类目无任务时隐藏对应 tab」（对齐现 api tab 行为，最终裁决留 UI Contract）；卡片 chip 不动（已正确）。
6. **可测性**：分区计算提为纯函数（输入 tasks，输出各类目过滤结果），workbench 测试文件单测覆盖五类目各一任务样例。

### 限制声明展示（C3：落点限定）

7. **UniversalManifestCard 增 limitations 区块**：manifest 含 `limitations` 时渲染为列表（无则整个区块不渲染，不占位）。**验收措辞限定**：仅 rss 任务详情有内容（rss manifest 恒有 limitations）；商品任务路由到 ProductPriceDashboard 不渲染该卡——落点补齐与 cninfo/api 补 limitations 数据均递延（后者归下一批爬虫小改）。既有静态边界声明（App.tsx 四来源文案）保留不动。

### A 用例固化（C1/C4）

8. **A18（C1 裁决：降级断言 + F6 显式递延）**：新增 workbench 级 mock 商品样板 spawn 冒烟 e2e（rss-e2e 同模式；firecrawl `--mock` 零网络无需豁免 env）——断言终态 succeeded、事件流完整（firecrawl 词汇表 start/scraping/snapshot_saved×9/done）、快照落盘、manifest.json 落盘；**显式标注不覆盖分析内容**（F6 布局地雷在案：analyze 读空 snapshots/ 目录、totalRecords=0 为既有缺陷，测试注释留 `TODO(F6)`，修复批补分析断言）。cninfo 样板回归 = 包级既有 14 用例 + workbench parity 用例全绿（不新增真源 e2e）。A18 语义 = 「采集链路不变」。
9. **A01（不装 Agent-Reach 可跑）**：固化三条断言——pnpm-lock 文本不含 `agent[-_]?reach` 依赖；各 package.json 的 scripts 无 `postinstall`/`preinstall` 安装脚本；workbench 依赖名集合 ⊆ 已知基线集合（依赖名级而非版本级，防合法升级误报）。
10. **A19（无隐式安装/外呼）**：测试目录静态扫描——遍历全仓 `test/**`（含 fixtures），提取 `https?://` 主机名，主机 ∉ allowlist 即失败。**allowlist 预定义**（C4）：`example.com`、`*.example.com`、裸 `.example` TLD 变体（brand-a.example 等）、`127.0.0.1`/`localhost`/`[::1]`、私网字面量、`www.w3.org`（XML 命名空间）、`api.firecrawl.dev` 与 `wttr.in`（真实端点 fixture，带注释标注）。**顺手修正两个真实域 fixture**：`httpbin.org`→`httpbin.example.com`、`mysite.com`→`mysite.example.com`（纯测试文件改动，不违反零改动约束）。
11. **落位**：A01/A19 断言放 `apps/workbench/test/adoption.test.ts`（批次名即"工作台回归包"），扫描根 = 仓库根（经 `path.resolve` 推导）。

## Testing Decisions

- **好测试**：只测外部行为（分区纯函数输出、spawn 后终态与产物、扫描结果），不测组件内部渲染细节（无 React 测试基建，UI 层验收 = vite build + UI Contract 对照）。
- **新增用例分布**：
  - task-params：COLLECTOR_SCENARIOS 含 rss 卡（1）；
  - new-task 纯函数：getTaskParams rss 分支（换行解析/去注释/limit 缺省）（1-2）；
  - 分区纯函数：五类目各一任务 → 五分区正确（1）；
  - adoption.test.ts：A01 三断言 + A19 扫描（2-3）；
  - A18 商品冒烟 e2e（1）。
- **先例**：rss-e2e.test.ts（spawn 模式）、COLLECTOR_SCENARIOS includes 断言、parity 测试。
- **全量门禁**：`pnpm test && pnpm typecheck && pnpm build`（build 覆盖 web 前端编译）；既有 194 用例零回退。

## Out of Scope

- F6（firecrawl 快照布局地雷）修复——独立小批；商品面板渲染 manifest 卡；cninfo/api 补 manifest limitations 数据（下一批爬虫小改）。
- RSS 预览模式、平台级 Feed 白名单配置面、UI 视觉改版（沿用既有设计语言）。
- React 组件测试基建引入。

## Further Notes

- 红队 KA1–KA5 与 C1–C5 全部吸收：KA1→决策 8、KA2→决策 5-6、KA3→决策 7、KA4→决策 9-10、KA5→决策 1-4。
- UI Contract 待裁决四点（红队已给证据基础）：rss 表单字段面细节、分区空态/顺序、limitations 区块视觉、无预览场景 StageBar 形态。
- 红队未实跑基线（只读约束）——ISSUES 切分前先跑一次全量门禁取新基线。

## PRD Diff Gate（auto 模式，2026-10-16）

相对 proposal.md 的增量/裁决（未重述一致项）：

1. **TaskList 分区补 product-price（开放问题 1 落定）**：提案将其列为开放问题（"红队核实"），红队裁定为既有缺陷必做——提案逃生条款预先授权。纯增量落定。
2. **A18 断言层级收窄（决策 5 细化）**：「端到端不变」在决策 6（零改动四爬虫）约束下具体化为「采集链路不变 + 分析链路显式递延 F6」——两决策联立的必然推论（红队探针实证分析产物恒空）。**分类：约束下的具体化，非丢弃**；测试内留 TODO(F6) 防背书。突出展示于此，如用户不认可可回退为「修 F6 列入本批」。
3. fixture 域名修正（httpbin/mysite → example 域）——纯增量（测试文件）。
4. A01/A19 断言形态与 allowlist 清单、依赖名级基线（开放问题 4 落定）——纯增量。
5. 表单字段面：urls 换行分隔 + 去 # 注释、limit 露出、deadlineMs 不露、场景固定名（开放问题 2 落定）——纯增量。
6. 分区计算提为纯函数以便测试——纯增量。
7. limitations 区块落点 = UniversalManifestCard（开放问题 3 落定；商品面板递延）——纯增量。
8. A01/A19 落位 apps/workbench/test/adoption.test.ts——纯增量。

无变更/丢弃提案已定决策；无需升级。

## GRILL 决议附录

### Round 1（作者盲审子代理 8 包，主代理核验后全采纳，2026-10-16）

- **G1（Q1）SET_SCENARIO 改显式映射表**：shared 中 `SCENARIO_SOURCE_TYPES: Record<ScenarioId, SourceType>`（约 6 行纯加法），reducer 索引取值——Record 缺键即编译错，在类型层消灭「静默回落」这一类陷阱（非只修 rss 一例）；custom-request→api-connector 的既有隐式行为转显式。
- **G2（Q2）空 urls 透传空数组**：不镜像 product 的样板回填（rss 无样板对应物，替用户指定白名单语义不可接受）；空数组落进既有错误文案「Feed URL 列表不能为空（1-5 个）」。limit 沿 cninfo limitText 先例：`trim() ? Number() : undefined` 原样透传，非法值（NaN/越界）交 validateRssParams 中文报错。
- **G3（Q3）分区纯函数独立 ts 模块**：`views/` 下新建纯 ts（非 .tsx），签名 `partitionTasks(tasks): { preview: TaskRecord[]; byCategory: Record<TaskCategory, TaskRecord[]> }`——preview 分组一并入函数，TaskList 全部数据派生收敛为一次调用；不进 shared（避免 TaskRecord 依赖反向循环与视图逻辑错位）。
- **G4（Q4）rss 卡字段级断言**：新独立用例钉住 PRD 决策 1 卡面（id/title「公开 RSS 资讯采集」/badge「只读 Feed · PoC」/category crawler/描述含「任务即白名单」）；既有 includes 断言不动。
- **G5（Q5）A18 e2e 三缺口**：事件断言用测试内 `JSON.parse` 内联（不新增 firecrawl-scraper 依赖，与 G8 组合无联动）；快照断言按 F6 现状布局（顶层 `snap_*` 目录 ×9）+ `TODO(F6)` 注释——修复批改断言时测试显式红；`waitForTerminal` 复制不提取（两处各 10 行，间接成本高于收益）。另经核验：firecrawl 事件行全过 parseCrawlEvent、`done.summary.failed=0` → classifyDone `succeeded`，counts 恒 0 不做断言。
- **G6（Q6）A19 扫描范围**：全部文本文件（含 .xml/.json fixtures——fixtures 正是可能藏真实端点处）；目录从仓库根动态发现 `**/test/**`（排除 node_modules/.git/data/out/dist——第七个包自动纳入）；删除 wttr.in 死条目（test/** 中只以无 scheme 裸串出现，带 scheme 提取永不命中；如需保留须注明「预置、当前无命中」）。
- **G7（Q7）allowlist 规则化**（PRD 清单第一天就红的修正）：归一化（小写、去尾点）+ 后缀匹配（`.example`/`.example.com`/`.localhost`）+ IP 字面量解析豁免（点分/整数/十六进制/八进制统一 parse 后判回环/私网/0.0.0.0/公网边界段）+ 显式条目仅 6 个各带注释（purl.org/www.w3.org/api.firecrawl.dev/evil.com/11.0.0.1/172.15.0.1——全是 egress 门禁自身测试对象，永不请求）+ 无点非 IP token 忽略（模板串残片如 `feed`）。未触红队 kill 线（显式条目 6 ≤ 10）。
- **G8（Q8）A01 依赖基线恢复全仓语义**（修正 PRD 决策 9 的静默收窄）：断言范围 = 全部 7 个 importers 的 deps∪devDeps 依赖名并集 ⊆ 内联基线集合（实测仅 17 名：workbench 的 hono/@hono/node-server/react/react-dom + 四包共享的 data-governance/@types/node/tsx/typescript + root 的 pnpm 基础上加入 rss-collector/firecrawl-scraper 等 workspace 名——以实现时实测清单为准写入测试）；来源读各 package.json（lockfile 格式随 pnpm 版本漂移）；存储内联 Set（新增合法依赖 = 测试文件里一行显式 diff，失败信息列新增名）。

### Round 2（主代理 3 包，2026-10-16）

- **G9 场景卡顺序**：rss 卡插在 cninfo-reports 之后（crawler 组内第 2 位：商品样板 → 财报固化 → RSS 只读新渠道），weather/custom-request 不动。
- **G10 A19 扫描排除范围钉死**：`**/test/**` 且排除 node_modules/.git/data/out/dist/.flow（.flow 流程文档含真实域名示例文本，非测试对象）。
- **G11 RssPicker 输入边界**：limit 输入镜像 cninfo limitText 形态（trim 空→undefined；非空→Number 透传）；urls 文本域 placeholder 给 example 域示例；错误展示只在 submit 后（与 product 先例同时机，不做实时校验）。

**GRILL 收敛**：Round 2 后无新增开放问题（StageBar 形态、分区空态/顺序、limitations 区块视觉、表单字段细节四点按提案决策 7 留 UI-GATE 裁决），2 轮收敛。
