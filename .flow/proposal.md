# 提案（讨论稿固化）— WC-AR-06 工作台体验与回归包

来源：`docs/AGENT_REACH_ADOPTION.md` §8 工作包表（WC-AR-06 行）+ §7 A 用例适用性 + WC-AR-04 handoff「下一批前置」。
用户指令："继续下一批"（顺序 00→01→(02∥05)→04→06，WC-AR-04 已 DONE 推送 359816e/2f6a931）。
固化时间：2026-10-16。

## 已定决策（不可推翻，后续阶段只可细化）

1. **范围三件套**（采纳文档 §8 原文）：RSS 场景放开、来源类型/限制声明展示、A 用例固化为测试。
2. **验收**：主线样板 + RSS 样板双回归绿。
3. **RSS 场景放开**（WC-AR-04 handoff 前置已备）：`COLLECTOR_SCENARIOS` 增 rss 场景卡；新建任务表单（Feed URL 列表 1-5、条目上限 limit 可选）；表单校验直接复用 `validateRssParams`（workbench 已依赖 rss-collector/domain）。**RSS 无 dry-run**（服务端钳 false），表单路径为直接「开始采集」，不经过「预览数量」阶段。
4. **来源类型/限制声明展示**：任务列表按来源分区展示（含 rss 类目）；任务详情展示限制声明（manifest limitations 面向用户可见）。
5. **A 用例固化**（采纳文档 §7 标「✅ 纳入常规回归」的三项）：
   - **A01**：不装 Agent-Reach 主线可跑——固化为永久断言；
   - **A18**：原两样板回归（mock 商品样板端到端不变 + cninfo 样板）；
   - **A19**：无隐式安装/联网外目标——固化为断言（依赖清单无新增外部包、测试无外网调用）。
6. **零改动约束**：本批为工作台体验层与测试包——不改四爬虫行为、不改 data-governance、不改事件协议与 reducer 语义；后端如需改动仅限纯加法（如 manifest 读取路由已存在则不动）。
7. **UI 范围声明**：本批有用户可见 UI（场景卡、表单、列表分区、限制声明展示）——按 dev-flow 走 UI-GATE，用户批准 UI Contract 后才切任务。

## 约束与边界

- 沿用既有 UI 形态与设计语言（卡片/标签/分阶段表单），不引入新 UI 框架或样式体系。
- RSS 表单错误展示走既有 `form-errors` 中文错误清单模式。
- 全量门禁 `pnpm test && pnpm typecheck && pnpm build` 保持绿；既有 194 用例零回退。

## 已拒绝/排除的替代方案

- 不做 RSS 预览模式（服务端已钳 dryRun=false，表单不做假预览）。
- 不做平台级 Feed 域名白名单配置面（WC-AR-04 已定「任务即白名单」）。
- 不动 WC-AR-03 AgentReachBridge（暂缓不变）。

## 开放问题（留待红队/PRD/GRILL/UI-GATE）

- **TaskList 既有缺口**：任务列表分区硬编码为 财报/气象/通用API 三区，`product-price`（商品标价）类任务在「全部」视图无分区不可见——是否随本批顺带补齐（含 rss 区）？（现状疑点，红队核实）
- RssPicker 表单具体字段面：urls 文本域（换行/逗号分隔？）、limit 是否露出、deadlineMs 是否露出（CLI 默认 60s 是否足够，不露给用户）。
- 「限制声明展示」的具体落点：任务详情卡片新增 limitations 区块（读 manifest）vs 仅展示静态边界声明文案（现 App.tsx 已有静态文案）。
- A01/A18/A19 固化测试的落位文件与断言形态（A01 断言什么=依赖图/安装脚本缺失；A19 如何证明无外呼=静态扫描测试文件的外网 URL？）。
- UniversalManifestCard 是否已展示 limitations（需核实；若无，是否本批加）。
