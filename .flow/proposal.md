# 提案（讨论稿固化）— 质量与体验收尾批（规划内最后一批）

来源：`.flow/handoff.md` 递延台账 + WC-AR-05 评审 N5/N6 recheck 判据 + 递延收敛批评审 F-2/F3 观察项 + UI 合同（含增量补记）Findings FA1/FA2/F4。
用户指令："继续下一批"（路线图：规划内最后一批，走完递延台账清零）。
固化时间：2026-10-16。

## 已定决策（不可推翻，后续阶段只可细化）

1. **N5 三处异味清理**（WC-AR-05 评审裁决 non-blocking，本批收口）：
   - `apps/workbench/server/runner.ts` `const cancel = terminate;` 无意义别名 → 直接返回 `cancel: terminate`；
   - `packages/data-governance/src/egress.ts` 解构 `[g0, g1]` 后 `void g1` 压制 → 只解构 g0；
   - `apps/workbench/server/queue.ts` 错误文案字面量与 `'脱敏密钥'` 子串反查的魔法字符串耦合 → 提为同一常量（文案改动即测试失败的静默失配消除）。
   - 全部零行为变化（recheck 判据：全量测试不变绿即回退）。
2. **N6 四处覆盖缺口补测**（WC-AR-05 评审 recheck 判据逐条）：
   - 5 跳重定向上限抛错路径（api-connector `guardedFetch`，6 连跳报「重定向次数超过上限」）；
   - 301/302 POST→GET 方法改写（现仅 303 有用例）；
   - mock:true 任务不豁免重启脱敏判定（queue 重启恢复用例补 mock:true + 脱敏 key 标 failed）；
   - 每跳计费断言（redirect 第二跳 checkAndReserve 被调——行为级断言即可）。
3. **递延批评审观察项收口**：engine.test 顶层断言措辞（G1 原文「顶层 readdir 恰为 ['snapshots']」——改为全量 readdir 断言）；N4 用例时序前提注记（极端负载假红风险，补注释与复跑政策指引）。
4. **执行治理批评审遗留**：F1——`queue.test.ts` 重启恢复用例 finally 补 `await q2.close()`（修 ENOTEMPTY 清理竞态 flake）；F3——N2 「>500 跳」用例扩到 >1000 跳或补 `getConfig()` 断言（封 maxCostUsd 漏传缺口）。
5. **FA1 视觉收敛（UI 范围）**：商品任务详情消除双「📦 导出交付包」按钮与同源 caveats 双呈现——具体收敛形态（保留 manifest 卡入口、Dashboard 内嵌面板去重）留 UI-GATE 裁决。
6. **FA2 卡头副标措辞（UI 范围）**：「由统一底座 data-governance 自动签发」对商品任务不准确——改为如实措辞（形态留 UI-GATE，注意该卡为四类目共用）。
7. **TaskList view-desc 措辞（UI 范围）**：「新建任务后先预览数量，确认范围无误再正式开始」对直采场景（商品/RSS）不全真——改为涵盖直采与预览两路径的如实措辞（UI-GATE 裁决）。

## 约束与边界

- N5/N3 观察项全部零行为变化；N6 纯增测试；UI 三项为文案/去重收敛，不引入新交互。
- 全量门禁 `pnpm test && pnpm typecheck && pnpm build` 保持绿，基线 213 零回退。
- F2（完成瞬间被关停窄窗口误标）维持已裁决的可接受状态，不纳入本批。
- firecrawl `budget-gate.ts` 经核实为一行 re-export 门面（`export * from 'data-governance/budget'`）非真实副本——本批记录澄清，不改动。

## 已拒绝/排除的替代方案

- F2 窄窗口语义改写（已裁非回归，维持记录）。
- firecrawl budget-gate 门面删除（re-export 形态有既有 import 使用面，去重收益低于改动风险）。
- 为 N4 时序用例重构等待机制（注释 + 复跑政策已足，过度工程）。

## 开放问题（留待红队/PRD/GRILL/UI-GATE）

- FA1 收敛方向：去 Dashboard 内嵌导出按钮 vs 去 manifest 卡导出按钮 vs 合并组件；caveats 双呈现是保留分析口径/交付限制两处还是收敛一处。
- FA2 新措辞的具体文案（四类目共用卡，措辞须对 firecrawl/cninfo/api/rss 四者都如实）。
- view-desc 新措辞的具体文案。
- N6「每跳计费断言」的实现形态（fetchFn 计数 vs budgets 小池行为断言）。
- F3 采用扩跳数（>1000）还是 getConfig 断言，或两者。
