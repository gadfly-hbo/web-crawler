# 提案（讨论稿固化）— 递延项收敛批（F6 领衔）

来源：`.flow/handoff.md`（WC-AR-06，2026-10-16）「递延项（按优先级）」清单前四项 + 各批 `review-findings.md` 的 recheck 判据（WC-AR-05 N 系列、WC-AR-06 R2/F 系列）。
用户指令："继续下一批"（采纳文档工作包 00-06 已全部完结，handoff 递延清单为下一批的既定输入）。
固化时间：2026-10-16。

## 已定决策（不可推翻，后续阶段只可细化）

1. **F6 快照布局修复（最高优先）**：firecrawl-scraper engine 把快照写入 `outDir/snapshots/` 子目录（对齐全部消费端：`--analyze`、workbench evidence 路由、manifest `snapshotsDir` 声明——三者早已按 `snapshots/` 读取，仅 engine 写入侧落在顶层）。修复后：
   - `product-smoke-e2e.test.ts` 的 `TODO(F6)` 断言更新为 `snapshots/` 布局；
   - **A18 补强**：补分析内容断言（mock 样板 `analysis_summary.json` 的 `totalRecords > 0`、品牌汇总非空）——F6 修复后分析链路应真实产出；
   - 既有 firecrawl 包级测试若断言顶层布局则同批更新（pipeline 测试自传 snapshotsDir 不受影响，需逐条核实）。
2. **limitations 数据闭环**：cninfo-reports 与 api-connector 的 manifest 构造传入 `limitations`（各至少一条如实声明，具体文案在 PRD/GRILL 钉死）；TaskDetail 对商品任务也渲染 UniversalManifestCard（现仅非 product-price 且 succeeded 渲染——落点与渲染条件细节留 UI-GATE）。目标：四类正式任务的详情页限制声明展示面收敛一致。
3. **A19 扫描器窄缺口**（评审 R2-1/F-2 recheck 判据）：无点纯数字/十六进制 token 先经 IP 判类再放行（字母 token 维持忽略，`134744072`/`0x62626262` 公网编码应拒绝）；扫描扩展名白名单补齐常见文本 fixture 类型（`.yaml/.yml/.csv/.snap` 等，具体清单留 GRILL）。
4. **RSS 任务标题去同质**（UI 合同 F2 既定方向"后续批在 rss 分支附 Feed 数"）：`summarizeTask` rss 分支附 Feed 数（格式如「RSS 采集 · 公开 RSS 资讯采集（3 Feed）」，具体格式留 GRILL）。
5. **N4 超时回调补 canceled 检查**（WC-AR-05 评审 recheck 判据）：runner 超时回调首行 `if (canceled) return` + 一条"取消后立即触发超时不输出任务超时行"用例。

## 约束与边界

- firecrawl-scraper 本批仅动快照目录一处（engine 构造 SnapshotStorage 的路径）+ 受影响测试；不改事件协议、不改抽取/分析逻辑。
- cninfo/api 的 limitations 为纯加法参数（createAndSaveDeliveryManifest 已支持）。
- 全量门禁 `pnpm test && pnpm typecheck && pnpm build` 保持绿；基线 204 零回退。
- UI 范围声明：商品任务详情渲染 manifest 卡（含限制声明区块）为用户可见 UI 变化——按 dev-flow 走 UI-GATE（对已批准 WC-AR-06 UI 合同的增量补记）。

## 已拒绝/排除的替代方案

- 不修 N2（api-connector 预算定容）——需要公式设计决策（分页与下载分池 or 上限重定容），另批处理。
- 不动 N5（三处代码异味）、N6（四处覆盖缺口）——记录在案，价值低于本批项。
- 不做 TaskList view-desc 措辞调整（UI 合同 F4：属新 PRD 需求）。
- 不做 Ctrl-C 孤儿爬虫关停清理（WC-AR-05 GRILL Q7 遗留，涉及信号处理语义，另批）。
- 不动 WC-AR-03 AgentReachBridge（暂缓不变）。

## 开放问题（留待红队/PRD/GRILL/UI-GATE）

- F6 影响面：firecrawl 包级测试与 workbench 测试中是否有断言顶层 `snap_*` 布局的用例；workbench `files` 列表路由对嵌套目录的展示形态；修复后 web-scraper 任务的 evidence 视图应开始真实可用（是否顺带断言）。
- cninfo/api 的 limitations 具体文案（须如实、不夸大：财报=PDF 原件不抽取文本；api=按配置路径提取不做推断）。
- 商品任务 manifest 卡的落点（ProductPriceDashboard 上/下）与渲染条件（succeeded？partial 也渲染？）。
- RSS 标题格式与既有任务显示兼容（旧任务标题不变，新任务用新格式——无迁移问题需确认）。
- A19 扩展名清单收敛边界（补枚举 vs 反向排除已知二进制）。
