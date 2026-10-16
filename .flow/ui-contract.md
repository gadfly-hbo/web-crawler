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
