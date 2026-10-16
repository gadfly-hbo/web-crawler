# UI Contract — WC-AR-06 工作台体验与回归包

**Verdict: PASS** —— 四个 UI-GATE 待裁决点全部给出明确裁决（§0）；全部面/状态可从 proposal.md 与 prd.md 直接推导，无规格外扩展，无 BLOCKED 项。

- 阶段：dev-flow UI-GATE（提案决策 7）
- 起草日期：2026-10-16
- 输入（按序完整读取）：`.flow/proposal.md`（决策 1-7）、`.flow/prd.md`（决策 1-11 + Diff Gate 1-8 + GRILL G1-G11）、`~/.agents/ui-design/DESIGN.md`、`apps/workbench/web/src/styles/tokens.css`、`apps/workbench/web/src/styles/app.css`、`views/new-task/ScenarioSelector.tsx`、`views/new-task/ProductPricePicker.tsx`、`views/TaskList.tsx`、`views/components/UniversalManifestCard.tsx`、`views/new-task/StageBar.tsx`；佐证源码：`shared/task-params.ts`、`shared/task.ts`、`views/NewTask.tsx`、`views/new-task/reducer.ts`、`views/TaskDetail.tsx`、`crawlers/rss-collector/src/domain/validation.ts`、`crawlers/rss-collector/src/collector.ts`、`packages/data-governance/src/egress.ts`
- 视觉契约：项目无 DESIGN.md，`tokens.css` + `app.css`（Xanthil 橘 accent 体系）即设计契约，优先于用户级基线的绿色默认与字号默认；本合同不引入任何新 token、新组件库或新样式体系（提案约束「沿用既有 UI 形态与设计语言」）
- 实现边界：本合同只约束 web 前端体验层纯加法（PRD Solution）；不实现生产代码

---

## 0. UI-GATE 四待裁决点（先行结论，红队留证对应）

### 裁决① RssPicker 字段面细节 —— PASS（钉死于 §3）

- 卡片骨架镜像 ProductPricePicker（eyebrow + card-h + 说明段 + 字段），但字段区用项目 `.fld` 表单体系（TimeTypePicker/ScopePicker 先例），不用 product 的 bootstrap 式 inline 样式
- eyebrow「场景配置」｜ card-h「公开 RSS 资讯采集」｜ 说明段见 §4 术语表
- **Feed URL 清单**：`<textarea id="f-rss-urls" rows="5">`，等宽字体（`--font-mono`），每行一个；label 右侧实时计数「已输入 N 个有效 Feed」（口径沿 product：非空且非 `#` 的行数，不做 URL 格式校验）
- **placeholder（钉死）**：
  ```
  https://news.example.com/feed.xml
  https://blog.example.org/atom.xml
  ```
- **条目上限（可选）**：`<input id="f-rss-limit" class="input-short" type="number" min="1">`，镜像 cninfo limitText 语义（trim 空 → undefined；非空 → `Number()` 原样透传，非法值交 `validateRssParams` 中文报错，G11）
- **不露出**：deadlineMs（PRD 决策 2 开放问题落定）、sleepMs、mock、apiKey、baseUrl、连通性测试、环境变量状态（均为 product 专属）
- 错误只在 submit 后展示（G11，与 product 同时机）；编辑 urls 或 limit 任一字段即整单清空错误（沿 product `SET_PRODUCT_URLS_TEXT` 先例）；错误清单复用既有 `.form-errors` 红底 `<ul>`（提案约束）

### 裁决② 任务列表分区/页签空态与顺序 —— PASS（隐藏空类目 + 类型声明序）

- **顺序**：「全部」恒第一位，其后按 `TaskCategory` 声明序固定为 **cninfo → product-price → weather → api → rss**；tab 与「全部」视图分区同序；label/icon 一律取 `CATEGORY_LABELS` 单源
- **空态**：某类目任务数为 0 → 该类目 **tab 隐藏** 且「全部」视图对应分区不渲染（确认 PRD 决策 5 倾向，对齐现 api tab `length > 0 &&` 行为）；任务总数为 0 → 整个 tab 行不渲染，走既有 `.empty` 整页空态
- 「全部 (N)」计数含预览任务（现状语义不动）；「⏳ 待确认的临时预览」区保留现状，RSS 任务恒不出现于该区（N5）
- **不采纳**「商品/财报/RSS/气象/API」排序：那是场景库 G9 卡序，不迁移到任务列表。理由：顺序与分区必须同源于 G3 纯函数 `partitionTasks` 的 `Record<TaskCategory, …>` 迭代序；在 TaskList 内另排一套显示顺序 = 重新引入本批要消灭的硬编码分区形态，且第七类来源接入时又要人工记得调序
- **后果披露（Findings F1，MED）**：数据驱动使三个既有 tab 文案收敛为 `CATEGORY_LABELS`——「上市公司财报」→「A股财报」、「城市气象数据」→「城市气象」、「通用 API」→「通用API」（分区标题同）。这是决策 5「由五类目数据驱动生成」的必然推论；如用户不接受此文案收敛，需回退为 TaskList 内显示名映射并放弃「防第七类来源再漏」目标（请明示，否则按本裁决执行）

### 裁决③ manifest limitations 区块视觉形态 —— PASS（卡内常显列表，指标后、折叠外）

- **位置**：UniversalManifestCard 指标网格（数据资产版本/采集产出总数/有效样本率/生成引擎）之后、「查看数据指纹」折叠区之外——**常显**，不放进二级折叠
- **形态**：沿卡内自有 slate 语系（`#e2e8f0` 上分隔线 + 12px 中文列表），标题「⚠️ 限制声明 (manifest limitations)」（沿卡内「📑 …指纹清单」「📋 …(Schema 契约)」中英对照命名式），`<ul>` 逐条渲染 `manifest.limitations[]`
- **无 limitations**：整个区块不渲染、不占位、无「暂无限制声明」类文案（PRD 决策 7）
- 理由：用户故事 3「知道数据能信什么、不能信什么」+ 用户级基线「成果：结论先行，随后呈现证据、适用范围、限制」——限制声明是一级交付信息，藏进「查看数据指纹」折叠会让最需要被看见的内容默认不可见

### 裁决④ 无预览场景 StageBar 形态 —— PASS（推荐并裁定：两段式变体）

- RSS 表单 StageBar = 「**1 选择范围（current）→ 2 开始采集（todo）**」；product / cninfo / weather 现有三段式**逐字不动**
- 理由：
  1. 三段式第三段恒 todo 只是「无效」，而第二段「预览确认」恒 todo 是「虚假」——它在导航层宣称一个永不发生的阶段，与 PRD 决策 4「不出现『预览数量』」及提案已拒绝替代方案「不做 RSS 预览模式」直接矛盾（§5-N1 的按钮禁令同理适用于阶段胶囊）
  2. 两段式是直采路径的最小诚实模型；序号连续（1→2）无跳号困惑
  3. 实现成本最小：StageBar 为纯展示组件，加一个变体入参（如 `direct?: boolean`）即可，既有三场景渲染零改动，不触 reducer 语义（PRD 决策 6）

---

## 1. Surfaces（本批用户可见的全部界面面）

| # | Surface | 内容 | 现状 | Trace |
|---|---------|------|------|-------|
| S1 | 场景库 RSS 卡（新建任务 stage 1 · ScenarioSelector 卡网格） | 五卡网格，G9 序：商品样板 → 财报固化 → **RSS（新增，第 3 位）** → 气象 → 定制。RSS 卡：title「公开 RSS 资讯采集」、badge「只读 Feed · PoC」（category crawler → `chip chip-ok`）、描述含「任务即白名单、不抓正文」（全文见 §4）；选中态 = accent 边 + accent-soft 底 + 1px 外环（既有 `.scenario-card.active`） | 其余四卡零改动（文案逐字保留） | PRD D1；G4；G9；提案 D3/D7 |
| S2 | RssPicker 表单（新建任务 stage 1，RSS 卡选中时出现在场景卡下方） | 见裁决①与 §3；上方 StageBar 为两段式（裁决④）；表单下方 `btn btn-primary`「开始 RSS 采集」 | 新增 | PRD D2/D3；G2；G11；提案 D3 |
| S3 | 任务列表五类目分区与页签（TaskList） | tabs + 「全部」分区由五类目数据驱动（裁决②）；卡片结构沿用 `renderCard`（chip + 标题 + StatusChip + counts + meta，running 加进度条） | 替换三分区硬编码；补 product-price 与 rss | PRD D5/D6；G3；提案 D4；Diff Gate 1 |
| S4 | 任务详情 manifest 限制声明区块（UniversalManifestCard 内） | 见裁决③；渲染条件沿用现状 `cat !== 'product-price' && status === 'succeeded'` | 新增区块；卡其余部分零改动 | PRD D7；提案 D4；Diff Gate 7 |

不在本批新增任何页面、路由或弹窗；App.tsx 既有「采集条件 / 边界声明」rss 分支（已存在）零改动。

## 2. Click paths（入口、动作与结果状态）

### CP1 主成功路径

1. 侧栏「新建采集任务」→ stage 1（既有入口不动）
2. 点 RSS 场景卡 → 卡转 active，RssPicker 出现于场景卡下方；错误清单清空（`SET_SCENARIO` 既有先例）
3. Feed URL 清单逐行输入（`#` 注释行与空行忽略），可选填条目上限
4. 点「开始 RSS 采集」→ 前端 `validateTaskParams` 经既有 sourceType 分发自动走 `validateRssParams`（PRD D3，无需新校验代码）：
   - 0 错误 → `api.createTask(params, false)` → 成功 → toast「采集任务已开始」（既有文案复用）→ `onCreated` 跳转任务详情（running）
   - 任务进入任务列表 📡 RSS 资讯 分区；running 态卡片有进度条（`companyIndex / totalCompanies`，RSS collector 逐 Feed 发 company 事件，进度语义与 cninfo 同构）
5. 采集完成 → succeeded：详情页出现 UniversalManifestCard，含限制声明区块（RSS manifest 恒有 limitations，PRD D7）

### CP2 次级结果

- **表单校验错误清单**（submit 后）：`.form-errors` 红底 `<ul>` 位于 StageBar 之下、场景卡之上（NewTask 既有位置）；前端校验与服务端 400 校验错误同位同形态（`startCollect` 既有行为：server errors → `SET_ERRORS` + stage 停 1）。错误字符串逐字见 §4
- **空列表**：任务总数 0 → tab 行不渲染 + `.empty` 整页空态（「还没有采集任务」+「新建第一个采集任务」按钮，现状文案零改动）
- **RSS 任务各态卡片**（列表内，五态齐备）：
  - running：queue chip「运行中」+ dot-queue + 进度条 + counts；meta「采集任务 · 运行中」
  - succeeded：ok chip「已完成」；meta「采集任务 · 已完成」
  - partial：warn chip「部分失败」；counts 失败 ≥1
  - failed：fail chip「失败」；meta「采集任务 · 失败」
  - canceled：muted chip「已取消」
- **限制声明区块有无两态**：RSS succeeded → 有（4 条固定 + 条件性截断声明）；api/cninfo succeeded → 无（manifest 暂无 limitations 数据，区块不渲染，下一批爬虫补数据后自动出现、UI 零改动）；running/failed/partial/canceled → 整卡不渲染（manifest 仅完成时落盘）

### CP3 显式失败态

- **校验失败**：CP2 错误清单（前端 400 语义与服务端 400 同视觉，用户无感区分）
- **采集失败终态**：列表 failed 卡（fail chip + counts 失败 N）；详情页 FailureList（既有组件，不在本批范围）；无 manifest 卡
- **manifest 缺失**：`manifest.limitations` 缺失 → 区块不渲染；manifest 拉取失败或无 `manifestVersion` → 整卡 return null（既有行为不动）

## 3. Affordances（控件、键盘与可达性）

| 控件 | 规格 | Trace |
|------|------|-------|
| Feed URL 清单 | `<textarea id="f-rss-urls" rows="5">`，`.fld` 体系样式 + `--font-mono`，可见 label（htmlFor），placeholder 见裁决①，hint「每行一个 URL；# 开头为注释行；最少 1 个、最多 5 个。」；label 右侧计数「已输入 N 个有效 Feed」 | PRD D2/D3；G2；G11 |
| 条目上限 | `<input id="f-rss-limit" class="input-short" type="number" min="1">`，label「条目上限（可选）」，hint「每个 Feed 保留前 N 条（1-500），留空默认 50。」；默认 50 = `DEFAULT_ENTRIES_PER_FEED` | PRD D2；G11 |
| 开始按钮 | `<button className="btn btn-primary">开始 RSS 采集</button>`，位于 RssPicker 卡之下（与 product「开始采集与中位数分析」同位）；直调 `startCollect()`，无预览 | PRD D4；提案 D3 |
| 场景卡 | 既有 `<button type="button" class="scenario-card">`，可聚焦可键盘选中 | 现状 |
| 键盘/焦点顺序 | 自然 DOM 序：场景卡组（G9 序）→ Feed URL textarea → 条目上限 input → 开始按钮；焦点环 `--focus-ring`（`.fld input/textarea:focus`、`.btn:focus-visible` 既有规则） | 现状 |
| 可达性 | 沿用项目现有表单可达性水平：原生控件、可见 label + htmlFor、错误为红底文字清单；不新增 aria 属性（项目现无此层，本批不引入测试基建外的可达性改版） | PRD Testing（无 React 测试基建，UI 验收 = vite build + 本合同对照） |

新增 CSS 仅一处选择器补全：`.fld textarea`（复用 `.fld input` 同款 token 值 + 等宽字体），属既有体系内补全，非新样式体系。

## 4. Terminology（用户可见字符串钉死表）

**新增字符串（全部为本合同钉死，实现不得偏离）**

| 位置 | 字符串 | Trace |
|------|--------|-------|
| S1 卡 title | 公开 RSS 资讯采集 | PRD D1（兼任务固定名，PRD D2） |
| S1 卡 badge | 只读 Feed · PoC | PRD D1 |
| S1 卡 description | 粘贴 1-5 个公开 RSS/Atom Feed URL 直接开始采集。任务即白名单、不抓正文，条目元数据带原文证据落盘。 | PRD D1（必含「任务即白名单、不抓正文」；G4 断言对象） |
| S2 eyebrow / card-h | 场景配置 ｜ 公开 RSS 资讯采集 | 裁决① |
| S2 说明段 | 输入获准采集的公开 RSS/Atom Feed URL 列表（每行一个，1-5 个）。任务即白名单：只读拉取条目元数据，不抓正文与附件。 | 裁决① |
| S2 字段 label/hint/计数 | Feed URL 清单 ｜ 已输入 N 个有效 Feed ｜ 每行一个 URL；# 开头为注释行；最少 1 个、最多 5 个。 ｜ 条目上限（可选） ｜ 每个 Feed 保留前 N 条（1-500），留空默认 50。 | 裁决① |
| S2 placeholder | https://news.example.com/feed.xml ⏎ https://blog.example.org/atom.xml | 裁决①（G11 example 域） |
| S2 按钮 | 开始 RSS 采集 | PRD D4 |
| S3 tab/分区（rss） | 📡 RSS 资讯 | `CATEGORY_LABELS` 既有定义（零新标签） |
| S4 区块标题 | ⚠️ 限制声明 (manifest limitations) | 裁决③ |
| S4 区块条目 | manifest.limitations[] 原文逐条（RSS 四条固定 + 截断条件第五条，见 §8） | PRD D7 |

**复用字符串（既有，零改动）**：预览按钮之外的全部既有文案——toast「采集任务已开始」；counts「下载/跳过/失败」；meta「采集任务 · {状态}」；状态标签 运行中/已完成/部分失败/失败/已取消（`STATUS_LABELS`）；chip 语义色对（`STATUS_TONES`）；空态「还没有采集任务」等；StageBar 段名「选择范围」「开始采集」；tab「全部 (N)」；App.tsx 边界声明 rss 分支「数据来自任务中批准的公开 RSS Feed，只读取不写入，仅保存在本机 data/ 目录。」。

**校验错误字符串（逐字来自 `validateRssParams`，前端与服务端同源，本合同零改写）**：
- `Feed URL 列表不能为空（1-5 个）`
- `Feed URL 数量超过上限 5`
- `` `URL 格式不合法: ${u}` ``
- `` `Feed URL 重复: ${trimmed}` ``
- `` `${egressReason}: ${trimmed}` ``（egress 文案如「目标地址指向内网/回环，已被出口门禁拦截」「仅支持 http/https URL」）
- `` `limit 应为 1-500 的整数` ``

不得发明新标签、不得改名既有标签（S3 三个 tab 文案收敛为 `CATEGORY_LABELS` 是裁决②的显式裁定与披露，见 F1）。

## 5. Negative cases（禁止路径）

- **N1**：RSS 表单不得出现「预览数量」按钮、不得进入 stage 2 / PreviewPanel、StageBar 不得出现「预览确认」胶囊（裁决④两段式）
- **N2**：任务列表不得保留 财报/气象/API 三分区硬编码形态；product-price 与 rss 任务不得在「全部」视图不可见
- **N3**：manifest 无 limitations 时区块不得渲染、不得占位、不得出现「暂无限制声明」类空态文案
- **N4**：不得新增页面、路由、弹窗、UI 框架或新 token/样式体系（提案约束 + PRD Out of Scope「UI 视觉改版」）
- **N5**：RSS 任务不得出现在「⏳ 待确认的临时预览」区（服务端钳 dryRun=false）
- **N6**：RssPicker 不得露出 deadlineMs / sleepMs / mock / apiKey / baseUrl / 连通性测试 / 环境变量状态（product 专属）
- **N7**：不得做平台级 Feed 域名白名单配置面（提案已拒绝；任务即白名单）
- **N8**：RSS 场景卡不得插在 G9 序之外的位置（不得首位、不得在 weather 之后）
- **N9**：不得改动 `CATEGORY_LABELS` / `STATUS_LABELS` / 既有四场景卡文案 / `.form-errors` 样式 / UniversalManifestCard 既有区段
- **N10**：空类目 tab 不得常显（裁决②）；任务总数为 0 时不得渲染 tab 行

## 6. Trace links（面/状态 → 决策映射）

| 面 / 状态 | PRD | 提案 | GRILL / Diff Gate |
|-----------|-----|------|-------------------|
| S1 RSS 场景卡（含卡序、卡面字段） | D1 | D3、D7 | G4、G9 |
| S2 表单态（rssUrlsText/rssLimitText、SET_SCENARIO 映射、getTaskParams rss 分支） | D2 | D3 | G1、G2、G11；Diff Gate 5 |
| S2 RssPicker 组件形态 | D3 | D3、约束「form-errors」 | G11 |
| S2 直采路径 + 按钮文案 | D4 | D3（无 dry-run）、已拒绝替代方案 | — |
| S2 校验错误清单 | D3 | 约束 | G2、G11 |
| S3 五类目分区/页签 + 空态/顺序 | D5 | D4 | G3；Diff Gate 1、6（裁决②本合同落定） |
| S3 分区纯函数 | D6 | — | G3 |
| S4 limitations 区块（有/无两态） | D7 | D4 | Diff Gate 7（裁决③本合同落定） |
| StageBar 两段式 | D4（「StageBar 形态裁决留给 UI Contract」） | 已拒绝替代方案 | 裁决④本合同落定 |
| 不改四爬虫/协议/reducer 语义 | — | D6 | — |
| UI-GATE 前置 | — | D7 | — |

## 7. Artifacts（工件文件清单与 artifact format）

| 文件 | 内容 |
|------|------|
| `.flow/ui-contract.md` | 本合同（逐字落盘） |
| `.flow/ui/index.html` | 可视化原型：覆盖 §1 全部面与状态——场景库五卡（RSS 第 3 位 active）、RssPicker 默认/校验错误两态、任务列表五分区（五态 RSS 卡 + 空类目隐藏演示 + 六 tab 对照条 + 整页空态）、manifest 限制声明区块有无两态、StageBar 两段/三段对照 |

**artifact format 声明**：single-page HTML ｜ 渲染工具 = 无（纯静态，浏览器直接打开）｜ 无 JS、无外部资源、无网络请求 ｜ token 值自 `tokens.css` 逐字内联，卡片/表单形态按 `app.css` 与组件源码手工复刻 ｜ 原型批注层（navy 虚线框）为合同标注，非产品 UI。

## 8. Data fidelity（样例数据披露）

- 本原型全部任务样例（标题派生形式「RSS 采集 · 公开 RSS 资讯采集」、counts、进度、manifest 指标数值 147 条/100.0% 等）与 Feed URL（一律 example 域族）为**合成数据**。理由：功能未实现；真实数据形态以 rss-e2e 落盘产物为准
- **真实数据**：S4 限制声明 4 条为 `crawlers/rss-collector/src/collector.ts`（limitations 数组）逐字复制——「冻结样本范围的手写 RSS/Atom 解析器，未覆盖命名空间等真实世界变体」「不抓取条目正文与附件（需要时另立任务走 web-scraper）」「发布时间不做估算，原文缺失即 null」「跨 Feed 转载条目不去重」；第 5 条「部分 Feed 传输截断：已保留完整条目、丢弃未闭合尾部，详见快照 metadata.truncated」仅在任一 Feed 传输截断时附加（G10）
- 校验错误字符串为 `validateRssParams` / `egress.ts` 源码原文；既有四场景卡、tab「全部」、空态、StageBar 段名等文案为现有源码逐字复制

## 9. Findings（严重度降序）

- **F1 · MED** — S3 三个既有 tab 文案随数据驱动收敛为 `CATEGORY_LABELS`（上市公司财报→A股财报、城市气象数据→城市气象、通用 API→通用API；分区标题同）。与「不得改名既有标签」存在表面张力；裁决=接受收敛（单一标签源是「防第七类来源再漏」的前提）。若用户不接受，需回退为 TaskList 显示名映射并接受未来新类目再漏的风险——需用户明示
- **F2 · MED** — 全部 RSS 任务标题恒为「RSS 采集 · 公开 RSS 资讯采集」（任务名由 PRD D2 固定 + `summarizeTask` 既有行为），多条 RSS 任务在列表内标题不可区分，仅靠状态/计数区分。本批不改 `summarizeTask`（shared 代码、超 PRD 范围）；建议后续批在 rss 分支附 Feed 数或首 host
- **F3 · LOW** — manifest 卡仅 succeeded 且非 product-price 任务渲染（TaskDetail 既有条件）：running/failed 的 RSS 任务详情看不到限制声明。与「manifest 仅完成时落盘」一致，非缺陷，披露防误判
- **F4 · LOW** — TaskList view-desc「新建任务后先预览数量，确认范围无误再正式开始」对商品/RSS 直采路径不再全真。本批保持原文零改动（最小 diff；对预览场景仍真）；措辞调整属新 PRD 需求，不默默扩范围
- **F5 · LOW** — 「已输入 N 个有效 Feed」计数口径沿 product 先例（非空非 # 行数，不校验 URL 格式）——「有效」一词沿既有措辞；如嫌误导可后续批改「已输入 N 行」
- **F6 · INFO** — UniversalManifestCard 自身使用 inline slate 配色而非 tokens.css 变量（现状）；限制声明区块沿卡内语系实现，不做半迁移混搭；token 统一化归未来视觉批（PRD Out of Scope）

## 10. Recheck 判据（一行）

浏览器打开 `.flow/ui/index.html`：场景库五卡序=商品/财报/**RSS(active)**/气象/定制且 RSS 卡面三字段与 §4 逐字一致；RssPicker 上方为两段式 StageBar 且全页无「预览确认」「预览数量」字样；错误态四条文案与 `validateRssParams`/egress 源码逐字一致；任务列表 tab 序=全部/A股财报/商品标价分析/(气象隐藏)/通用API/RSS 资讯 且空类目不出现；manifest 卡 rss 态有限制声明 4 条列表、api 态区块整体不存在——全部命中即 PASS。

---

## 增量补记（递延项收敛批，2026-10-16）

**Verdict: PASS** —— 唯一 UI 增量（S5）可从 PRD 决策 5 + 提案决策 2 + G6 等价性证明直接推导：两态覆盖完备（有 manifest 完整卡 / 无 manifest 404 静默兜底）、零新字符串、唯一行为增量 = product-price ∧ succeeded，无规格外扩展，无 BLOCKED 项。

- 阶段：dev-flow UI-GATE 增量补记（PRD 决策 5「细节经 UI-GATE 增量补记确认」）
- 性质：对已批准合同的 append-only 补记；既有 §0-§10 一字不动，S4 / 裁决③ / N3 / §4 术语表继续有效，本补记仅将 S4 面的类目覆盖扩展至 product-price
- 输入（按序完整读取）：`.flow/proposal.md`（决策 2）、`.flow/prd.md`（决策 5 + GRILL G6）、`.flow/ui-contract.md`（已批准合同）；代码事实：`apps/workbench/web/src/views/TaskDetail.tsx:241-246`（现行渲染条件）、`views/components/UniversalManifestCard.tsx`（卡结构 / limitations 区块 / 404 静默兜底）、`views/components/ProductPriceDashboard.tsx`、`web/src/styles/tokens.css`；佐证源码：`crawlers/firecrawl-scraper/src/analyzer.ts:148-176`、`crawlers/firecrawl-scraper/src/pipeline.ts:152-185`、`crawlers/firecrawl-scraper/src/main.ts:197-202`、`apps/workbench/server/runner.ts:204-209`、`apps/workbench/server/routes/evidence.ts:248-256`
- 基线：baseline_dirty=[]（补记起草于实现之前）

### A0. 增量裁决 —— PASS（先行结论）

TaskDetail 详情主栏（detail-main）第二渲染块条件由 `cat !== 'product-price' && task.status === 'succeeded'`（TaskDetail.tsx:244）放宽为 `task.status === 'succeeded'`——PRD Diff Gate 5 预裁（「succeeded 全类目」）的最终落定。效果：product-price ∧ succeeded 任务在 **ProductPriceDashboard 之后**、「📁 产出文件」卡**之前**渲染 UniversalManifestCard 原样实例；JSX 块位置不动，UI 侧恰 1 行条件放宽、无其他改动。位置裁「之后」：manifest 卡是全类目统一的交付资产层，置于场景专属分析面（Dashboard）之下、通用文件面（产出文件）之上，与四类目「分析面 → 交付面 → 文件面」分层一致——提案决策 2 留给 UI-GATE 的落点开放问题在此落定。

### A1. Surface 增量

| # | Surface | 内容 | 现状 | Trace |
|---|---------|------|------|-------|
| S5 | 商品任务详情 manifest 卡（= S4 面向 product-price 的类目扩展） | product-price ∧ succeeded 任务详情：ProductPriceDashboard 之后渲染 UniversalManifestCard 完整卡——卡头（🛡️ / Delivery Manifest v{manifestVersion} / SHA-256 徽标 / 导出 ZIP / 查看数据指纹）＋ 指标网格（数据资产版本 / 采集产出总数 / 有效样本率 / 生成引擎）＋ **限制声明区块（裁决③形态：指标网格后、折叠区外、常显）** ＋ 指纹折叠（默认收起） | product-price 被排除，卡不渲染（仅 Dashboard） | PRD D5；提案 D2；G6 |

限制声明数据闭环归属澄清：商品 manifest 的 `limitations` 来自 firecrawl 既有透传 `limitations: report.caveatsAndLimits`（pipeline.ts:180），4 条为 analyzer 恒定产出（analyzer.ts:158-163）——**不属本批 PRD 决策 4**（决策 4 只为 cninfo/api 补传参数，商品不需要）；F6 修复使指标数值真实非零（见 A7）。本补记只做展示闭环，不动数据链。

### A2. 状态覆盖（两态 + G6 等价性）

**态 A · 有 manifest → 卡片完整渲染**：`analyze:true`（runner.ts:207 默认透传 `--analyze`）且 `succeeded>0` → main.ts:198 进 pipeline → manifest.json 落盘（pipeline.ts:185）→ `/api/tasks/:id/manifest` 200 → 完整卡渲染；limitations 区块随 `manifest.limitations` 非空出现（裁决③形态；无则区块不渲染、不占位——N3 对商品任务原样生效）。

**态 B · 无 manifest → 卡片静默不渲染（无空壳）**：`analyze:false`（runner 不传 `--analyze`）或 `succeeded=0`（main.ts:198 短路）→ 无 manifest.json → 路由 404（evidence.ts:254-255）→ 卡内 `!res.ok → null` ＋ `if (!manifest) return null`（UniversalManifestCard.tsx:45/60）→ 整卡不存在：无空壳、无加载占位、无错误提示。此路径下 `analysis_summary.json` 同缺 → Dashboard `!report → null`，两卡同缺席。product 预览任务（dryRun ∧ succeeded）同走此兜底（预览无落盘文件），与现状 Dashboard 对预览的空表现同路径——零新增可见差异。

**G6 等价性（零行为变化证明）**：`cat !== 'product-price' && status === 'succeeded'` → `status === 'succeeded'` 对**非 product 类目严格等价**——cninfo/weather/api/rss 的 queued/running/partial/failed/canceled 改前改后均不渲染（status 枚举六值全覆盖），succeeded 改前改后渲染同一卡；唯一行为增量 = product-price ∧ succeeded（S5）。与 F6/决策 4 互为独立验收与回滚单元（KA-5 批次纪律）。

### A3. 术语（零新字符串）

本增量不引入任何新用户可见字符串。卡片全部文案复用 UniversalManifestCard 既有文本：卡头「标准化交付资产规范 (Delivery Manifest v{…})」「由统一底座 data-governance 自动签发 · 全文件 SHA-256 防篡改」「SHA-256 签名已就绪」「📦 导出标准化交付包 (ZIP)」「查看数据指纹 ▼」、指标四标签（数据资产版本/采集产出总数/有效样本率/生成引擎）、区块标题「⚠️ 限制声明 (manifest limitations)」——均见既有合同 §4 与组件源码。商品任务的 limitations 条目内容为 manifest 数据（firecrawl caveats 原文）经数据通道呈现，非 UI 硬编码；UI 端不得改写、增删或截断。

### A4. 增量负面清单（编号接续既有 N1-N10）

- **N11**：partial/failed/canceled（及 queued/running）的 product-price 任务不得渲染 UniversalManifestCard——非 succeeded 恒不渲染（G6）
- **N12**：不得改动 ProductPriceDashboard 本身（内嵌 manifest 面板、「⚠️ 业务解释与口径边界」、导出按钮组、品牌表/价格带/样本明细）与既有两渲染块的先后位置语义——仅放宽第二块的 product-price 排除；卡恒在 Dashboard 之后、「📁 产出文件」之前，不得对调
- **N13**：不得新增组件、product 专用变体卡、路由或弹窗——复用 `<UniversalManifestCard taskId={task.id} />` 原样实例
- **N14**：无 manifest 时不得出现空壳卡、骨架占位、加载态或错误提示——404 静默兜底是唯一路径；不得在前端硬编码或兜底伪造 caveats
- **N15**：不得引入新 token/样式体系，不得改 UniversalManifestCard 既有区段与 slate 语系（沿既有 N9 与合同发现 F6/INFO：不做 token 半迁移）

### A5. Trace links（增量）

| 面 / 状态 | PRD | 提案 | GRILL |
|-----------|-----|------|-------|
| S5 渲染位置（Dashboard 后、产出文件前）+ 条件放宽恰 1 行 | D5 | D2（落点开放问题落定） | G6 |
| 态 A / 态 B（manifest 有无 → 卡有无） | D5 | D2 | G6（404 静默兜底） |
| limitations 内容来源 = firecrawl 既有 caveats（非决策 4 范围） | D4（对照项） | D2 | — |
| 零新字符串 / 复用既有文案 | — | 约束「沿用既有 UI 形态与设计语言」 | — |

### A6. Artifacts（增量工件）

| 文件 | 内容 |
|------|------|
| `.flow/ui/addendum-product-card.html` | 增量原型：态 A（商品任务 succeeded 详情——Dashboard 摘要复刻块 + 其后 manifest 卡含 4 条限制声明 + 产出文件卡位置锚点）＋ 态 B（两卡同缺席、无空壳）＋ G6 改前/改后等价对照表 |

artifact format 声明沿既有合同 §7：single-page HTML ｜ 渲染工具 = 无（纯静态）｜ 无 JS、无外部资源、无网络请求 ｜ token 值自 tokens.css 逐字内联，卡与 Dashboard 形态按组件源码 inline style 手工复刻 ｜ navy 批注层为合同标注非产品 UI ｜ 既有 `.flow/ui/index.html` 零改动。

### A7. Data fidelity（增量样例披露）

- **合成数据**：任务标题、Dashboard 品牌表数值、manifest 指标（datasetVersion `v1.0-m9x2k4ab`、9 条、88.9%、证据覆盖率 100.0%）为合成——「9 条」对齐 PRD 决策 2 A18 断言（totalRecords === 9）；真实形态以 firecrawl pipeline 落盘产物为准
- **真实数据**：限制声明 4 条为 `crawlers/firecrawl-scraper/src/analyzer.ts:158-163` caveatsAndLimits 数组原文逐字——「网页标价不等于最终成交价，亦不包含优惠券、会员折扣或满减促销。」「采集样本仅代表本次采集页面，不等于全网全渠道全量商品。」「未进行跨品牌完全同款对标匹配，标价差异受配置与规格影响。」「数据严禁直接推导为销量、市场占有率或降价策略。」；生成引擎 `web-crawler/firecrawl-scraper`、manifestVersion `1.0.0` 为 pipeline.ts 真实值
- **F6 关联**：caveats 4 条由 analyzer 恒定产出、不依赖样本数；F6 修复前 manifest 亦会落盘但指标恒 0（快照目录错位 → pipeline 读不到快照 → records 空），修复后指标真实——「真实可见」由 F6（数据侧）+ S5（展示侧）共同构成，两者独立验收，UI-GATE 补记不依赖 F6 已合入

### A8. Findings（增量，严重度降序）

- **FA1 · LOW** — 同页双「📦 导出标准化交付包 (ZIP)」入口与同源 caveats 双呈现：Dashboard 内嵌面板与新增卡各有一个导出按钮（同指 `/api/tasks/:id/delivery-package`）；Dashboard「⚠️ 业务解释与口径边界」（经 analysis_summary.json）与卡片「⚠️ 限制声明 (manifest limitations)」（经 manifest.limitations，pipeline.ts:180 同源透传）将同一 caveatsAndLimits 4 条在同页各渲染一次。语义分工成立（分析口径边界 vs 交付资产限制），是「不动 Dashboard」最小改动的必然结果，功能无冲突；如需收敛为单处，属后续批（超本增量范围）
- **FA2 · LOW** — 卡头副标「由统一底座 data-governance 自动签发」对商品任务不完全准确：product manifest 由 firecrawl-scraper pipeline 自建落盘（pipeline.ts:152-185），不经 data-governance 包。零新字符串约束下不改文案，披露防误判；文案修正属后续批
- **FA3 · INFO** — product 预览任务（dryRun ∧ succeeded）条件放宽后亦尝试渲染卡，但预览无落盘 → 404 静默兜底，无空壳；与现状 Dashboard 空表现同路径，零新增可见差异
- **FA4 · INFO** — Dashboard 内嵌 manifest 面板无 limitations 区块（其数据类型 DeliveryManifestInfo 未含该字段，ProductPriceDashboard.tsx:43-69）；为其补齐属 Dashboard 改动，被 N12 排除

### A9. Recheck 判据（一行）

打开 `.flow/ui/addendum-product-card.html`：态 A 中 manifest 卡紧随 Dashboard 块之后、产出文件卡之前，限制声明 4 条与 `analyzer.ts:158-163` 源码逐字一致，卡头/指标四标签文案与既有 UniversalManifestCard 零差异；态 B 两卡同缺席且无空壳占位；G6 对照表唯一增量行 = product-price ∧ succeeded——全部命中即 PASS。
