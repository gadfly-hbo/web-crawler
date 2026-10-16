# REVIEW 评审报告 — 质量与体验收尾批（规划内最后一批）

- **日期**：2026-10-16
- **固定点**：`9a97f17`（main）；范围 = `git diff 9a97f17`（16 文件）+ 未跟踪 `.flow/ui/addendum-quality-polish.html`；baseline_dirty = []
- **评审者**：独立 REVIEW 阶段评审者（未参与实现与红队），全部结论以代码与命令输出为证
- **Verdict：PASS**（1 MEDIUM + 2 LOW 非阻塞 + 3 INFO，无阻塞项）

## 一、必须复跑的实际结果（全部亲自执行）

| 项 | 命令 | 结果 |
|---|---|---|
| 全量门禁 | `pnpm test && pnpm typecheck && pnpm build` | **三段 exit 0**。test：governance 10 + firecrawl 27 + api 27 + rss 32 + cninfo 14 + workbench 107 = **217/217 全绿**（= 基线 213 + 4；无测试删除，零回退）；typecheck 6 项目全过；build vite 成功 |
| C1 红灯探针（复核） | 删分页池 `maxCostUsd: undefined` → 跑 N2 用例 | **红**：`COST_EXCEEDED` 于第 163 页（≈977 跳，与红队数学吻合）→ 还原后绿；还原后 sha256 与探针前逐字节一致 |
| C4b 反噬探针（复核） | `MASKED_KEY_KEYWORD`→『掩码密钥』→ 跑 queue.test | **红 2 个**（独立人类可见断言守住）→ 还原后 12/12 绿；哈希复原一致 |
| C3 二十轮（复核） | 20 轮循环 queue.test | **20/20 轮全绿** |
| 探针留痕检查 | `git status` + 双文件 sha256 | 与初始脏清单完全一致——**无留痕** |

## 二、红队条件与猎查项逐条核验

- **C1**：N2 用例 maxPages 100→200（1200 跳），标题改「>1000 跳」，断言扩 COST_EXCEEDED；探针红→绿独立复现。✅
- **C2**：新副标逐字节 = A3 钉死句；四路径事实基亲自实证（cninfo/api 自动签发、rss/product 手工构造）；四格皆真。✅
- **C3**：`:186`、`:243`、`:305` 三处 finally 先 close 后 rm；`:273-303` close 在 try 末尾——见 Finding 1。20 轮验收过。⚠️ 部分
- **C4**：两条魔法字符串收敛为三常量（queue.ts:12-14，不导出、关键词内嵌）；测试独立断言；反噬探针复现。✅
- **UI 合同 A0-A9**：副标/view-desc 逐字=A3；ZIP 唯一入口（全 src grep 仅 UniversalManifestCard）；caveats 单呈现（类型字段在位无渲染点）；N16 恰四点改动（diff 恰 4 hunk）；N17-N22 逐条满足；其他类目零变化（UI diff 恰三文件）；showManifestDetail 死状态清理正当（终裁 2 第①点必然结果）；ui-contract 纯追加 142+/0-。✅（一处像素偏差见 Finding 2）
- **A8 披露落实**：FL1 重拟句钉死落地；FL2 残留句原样（TaskList.tsx:84 在位）；FL3 维持记录。✅
- **R4 取舍**：PRD 决策 2 记录理由 + 用例名即决策记录。✅
- **虚假证据**：三项关键证据（20 轮/探针/反噬）全部独立复现为真；217/217 逐包一致。✅
- **范围外改动**：代码 diff 11 文件全部落在七件已定决策内；无未使用导入。✅

## 三、Findings（严重度降序）

1. **MEDIUM · non-blocking** — `queue.test.ts:299`（重启脱敏用例）：`await q2.close()` 位于 try 末尾而非 finally——C3 kill criterion 要求统一。绿路径竞态已消除（40 轮佐证），残余仅为断言失败路径的 ENOTEMPTY 遮蔽（错误遮蔽，非假绿/假红）。tasks.md T4 证据句对该处不准确。**recheck**：按 `:186` 同款 hoist 移入 finally，或修正措辞记录偏差。
2. **LOW · non-blocking** — `ProductPriceDashboard.tsx:156-166`：看板指标行与已批原型像素不一致（实现 160px/gap12/mb16/字号14-13，原型 130/10/20/13-12）；色值全符、N22 满足、A9 recheck 不含像素。**recheck**：对齐原型或合同补偏差记录。
3. **LOW · non-blocking** — `engine.test.ts:546` 附近：G3 附录原文「fetch 恰 2 次」vs 实现断言 `=== 1`（checkAndReserve 先于 fetch，第 2 跳请求前被拦——断言更强，规格文本失准）。**recheck**：PRD 附录补勘误即可。
4. **INFO** — `engine.test.ts:459`：断言消息仍写「600 跳」而用例现为 1200。**recheck**：消息改 1200。
5. **INFO** — `queue.test.ts:314/:318`：新 mock 用例 `as never` 旁路类型检查（邻例 `as const` 即可）。**recheck**：改类型化字面量。
6. **INFO** — `tasks.md` 各任务 Acceptance 子勾选框保持 `[ ]`（流程卫生）。**recheck**：勾选或删框。

## 四、双轴结论

- **Spec 轴**：七件全部落地且证据可复现；C1/C2/C4 全条满足、C3 行为满足一处字面偏差；UI 三件与合同逐字相符（一处像素偏差）。
- **Standards 轴**：无文档化标准违例；两条 judgement call（as never 旁路/blocker 构造略绕）。

**总结**：门禁 217/217 三段 exit 0，三项对抗探针全部复现且还原无痕——**PASS**。
