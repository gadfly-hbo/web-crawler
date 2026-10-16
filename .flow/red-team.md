# 红队评审：递延项收敛批（F6 领衔）— 五件递延项一次收敛

- **日期**：2026-10-16
- **提案**：`.flow/proposal.md`（递延项收敛批，固化于同日）
- **评审对象仓库**：`gadfly-hbo/web-crawler`，main @ `9e86c45`（工作区仅 `.flow/proposal.md` 脏文件，与本评审只读范围一致）
- **评审立场**：对抗性红队，全新上下文，与提案作者无关。方法：先提取全部承重主张并 steelman，再用仓库代码与可执行探针逐条攻击；排名 = 影响 × 出错可能性 × 验证成本。
- **技能**：`~/.agents/skills/strategy-red-team/SKILL.md`

## 结论先行

**Verdict：GO-WITH-CONDITIONS。**

五件事的承重主张全部经仓库实证成立，无任何 kill 判据被现有证据满足（故不 KILL）。F6 的核心事实链——engine 写顶层、三消费端读 `snapshots/`、修复后分析真实非空——已用 CLI 探针双向验证（修复前 `totalRecords: 0`；模拟修复后 `totalRecords: 4`、三品牌汇总带正确中位数）。发现的问题全部是**精度与完备性缺口**（表述失真、测试更新面未枚举、白名单补齐不可验证），以 5 条附带条件约束即可放行。

## 验证记录（本评审实际执行的证据）

| # | 验证项 | 结果 |
|---|--------|---|
| V1 | CLI 探针（修复前现状）：`node --import tsx src/main.ts --mock --analyze -o /tmp/fc-probe` | 快照落顶层 `snap_*`；`[ANALYSIS] 样本总数: 0`；`analysis_summary.json` `totalRecords: 0`、`brandSummaries: []` —— **F6 病灶实锤** |
| V2 | 模拟修复后：快照挪入 `snapshots/` 再跑 `runProductAnalysisPipeline`（4 个 brand-a/b/c URL） | `totalRecords: 4, validRecords: 4`；品牌汇总 `[A: n=2 median 249, B: 159, C: 239]`（中位数逐个核对正确）—— **A18 补强前提成立** |
| V3 | 全量 `pnpm test` | 10+27+20+32+14+101 = **204**，与提案基线一致；workbench 首轮 100/101（1 个未识别间歇失败，输出被过滤未定位），后续 4 轮 101/101 全绿 |
| V4 | A19 判类探针（tsx 引入 `data-governance/egress` 模拟修复后 hostAllowed） | `134744072`/`0x62626262` → 拒绝（红）；存量回环 fixture `2130706433`/`0x7f000001` → 仍放行（绿）—— **recheck 判据可落地且不破存量** |

## Top Kill-Assumptions（按影响 × 可能性 × 验证成本排名）

### KA-1（第 1 名）：F6「改 engine 一处路径即闭环，受影响测试面小且已知」

- **Claim**：`crawlers/firecrawl-scraper/src/engine.ts:19` `new SnapshotStorage(options.outDir)` 是唯一错配写入点；改传 `path.join(outDir, 'snapshots')` 后 `--analyze`、workbench evidence 路由、manifest 声明三消费端自然对齐。
- **Steelman**：三消费端读 `snapshots/` 有代码实据——`src/main.ts:199`（`--analyze` 读 `outDir/snapshots`）、`apps/workbench/server/routes/evidence.ts:133`（snapshot-content 硬编码 `path.join(task.outDir, 'snapshots', snapshotId)`）、`src/pipeline.ts:177`（manifest 声明 `snapshotsDir: 'snapshots/'`）；且 `crawlers/rss-collector/src/collector.ts:192` 已用完全相同的 `path.join(outDir, 'snapshots')` 构造，仓库内先例一致。V1/V2 探针双向证明修复即闭环。
- **Fails if**：存在提案未列出的顶层 `snap_*` 消费方或第三处断言顶层布局的测试，修复批静默漏改 → 门禁红或行为回退。
- **Evidence（已取）**：全仓清点完成。断言顶层布局的测试**恰好两处**：`crawlers/firecrawl-scraper/test/engine.test.ts:72-77`（`readdir(tmpDir)` 直接找快照目录，修复后第一个目录是 `snapshots` 而非快照，`metadata.json` 读取 ENOENT 必挂）与 `apps/workbench/test/product-smoke-e2e.test.ts:83-90`（`TODO(F6)` 在案）。提案预判「pipeline 测试自传 snapshotsDir 不受影响」属实（`pipeline.test.ts:13,17,23` 自建 `snapshots` 目录作 engine outDir，自洽闭环）；`storage.test.ts` 直用 SnapshotStorage 不经 engine，不受影响；`manifest.test.ts:110-115` 只断言合成 manifest 的字面声明、从不与磁盘实盘比对——**没有任何测试固化「声明与实际不符」的现状**。workbench `files` 路由 `walkFiles` 递归列目录（`routes/files.ts:17-38`），单文件下载走通配路由支持含 `/` 相对路径（:59-77），且 `files.test.ts:56` 已断言 cninfo 嵌套路径形态——嵌套展示形态无回归风险；`evidence-api.test.ts:71,178,199` 手造 fixture 本就按 `outDir/snapshots/snap_*` 布局。启动脚本、web 前端、data-governance 测试均无顶层 `snap_*` 直接引用；`data/firecrawl-scraper/e2e-m3-pkg` 固件无任何代码引用。
- **Kill criterion**：若实现中发现第三处断言顶层布局且属跨包语义（非简单路径改写），F6 从本批单拆先行。
- **Cheapest test**：已执行（V1/V2 探针，成本约 1 分钟）。残留验证成本为零。
- **裁决**：主张成立，风险基本退役；「逐条核实」由本评审代为完成，结果支持提案。

### KA-2（第 2 名）：提案「/evidence 与 /snapshot-content 现在 404」的事实精度

- **Claim**（提案开放问题原文）：修复后 web-scraper 任务的两个 evidence 视图「真实开始可用（现在 404）」。
- **Steelman**：方向正确——修复前这两条链路确实拿不到真实数据。
- **攻击**：表述失真。`/tasks/:id/snapshot-content` 今天确实 404（`evidence.ts:135-137`，因 snapshots/ 目录不存在）；但 `/tasks/:id/evidence` 今天**不是 404**，而是 200 + 空数组——pipeline 恒写空 `evidences.jsonl` 与空表 `evidence.sqlite`（`pipeline.ts:108-115,44-45`），路由降级返回 `{evidences: []}`（`evidence.ts:117`）。修复后前者从 404→200 有内容，后者从 200 空→200 有内容，验收观测点不同。
- **Fails if**：PRD/验收把「404→可用」当统一口径，用 /evidence 做回归观测会误判「本来就通」。
- **Kill criterion**：无（表述修正，不动摇方案）。
- **Cheapest test**：已完成（路由代码 + V1 探针产物核对）。

### KA-3（第 3 名）：④ RSS 标题「旧任务无影响」成立，但新格式的测试更新面未被枚举

- **Claim**：`summarizeTask` rss 分支附 Feed 数对旧任务无影响。
- **Steelman**：结构上成立——标题在创建时固化为 `TaskRecord.title`（`server/queue.ts:102`），不回填、不重算，旧任务零迁移成本。`RssTaskParams.urls: string[]` 在手，Feed 数 1–5，格式方向已获 UI 合同预授权（`.flow/ui-contract.md` F2 明文「建议后续批在 rss 分支附 Feed 数或首 host」）。
- **Fails if**：改 `shared/task-params.ts:108-110` 后漏改既有断言 → 门禁红。实查**恰好三处**将随格式变化而挂：`apps/workbench/test/api.test.ts:295`、`apps/workbench/test/task-params.test.ts:237-238`、`apps/workbench/test/rss-e2e.test.ts:134`（均为 `RSS 采集 · <名>` 全等断言）。提案开放问题只提「旧任务显示兼容」，未枚举测试更新面。
- **Kill criterion**：若实现中发现第 4 处断言，说明格式选择与既有快照耦合过预期，回 GRILL 重定格式。
- **Cheapest test**：改后单跑 `pnpm --filter workbench test`（约 4 秒）。

### KA-4（第 4 名）：③ A19 recheck 判据可落地，但扩展名补齐子项当前不可验证

- **Claim**：无点纯数字/十六进制 token 先判类再放行；`134744072`/`0x62626262` 公网编码应拒绝；扩展名白名单补齐。
- **Steelman + 攻击**：
  - 判类部分**实锤可落地**：绕过点在 `apps/workbench/test/adoption.test.ts:110-113`——无点 token 无条件 `return true`；V4 探针证明接入 `ipLiteralAllowed` 后两个公网编码正确翻红、存量回环 fixture（`2130706433`）保持绿。recheck 判据「注入 `https://134744072/x` → A19 红（当前绿）」与代码事实完全吻合。
  - 扩展名部分**当前是零覆盖差**：`adoption.test.ts:124` 白名单无 `.yaml/.yml/.csv/.snap`，且实查全仓 test 目录**现存此类文件数为 0**。纯前向加固——若不随批附一个被扫描的新扩展名 fixture（内含 allowlist 主机的 http URL），新增白名单条目是没有任何测试能证明生效的死代码，与「以可验证结果定义完成」相悖。
- **Fails if**：扩展名清单落地后无 fixture 佐证 → 该子项声称完成但不可验证。
- **Kill criterion**：扩展名补齐若无法为新增条目各配（或至少配一个代表性）被扫描 fixture，则该子项从本批剔除、仅做判类修复。
- **Cheapest test**：在任一 test 目录放一个 `.yaml` fixture（含 `https://example.com/x`），跑 adoption.test.ts 确认文件被计入扫描基数（`testFiles.length` 变化）。

### KA-5（第 5 名）：五件事一批 vs 最小变更原则

- **Claim**：五件递延项一批收敛是合理的批次切分。
- **Steelman**：五件全部是前批评审已裁决的 recheck 判据，非新增范围；产品代码合计极小（engine 1 行、两个爬虫 manifest 各 1 参数、task-params 1 行、runner 1 行、adoption.test 约 3 行），估算 <60 行 diff；F6 有显式边界声明。
- **攻击**：F6 是唯一有跨包影响面的项，也是最高优先项；其余四件虽小但分属 4 个包。若任一件在实现中膨胀（典型：② 的商品卡渲染条件若从 succeeded 扩到 partial，或落点争议返工），会拖累 F6 的及时合入与回滚粒度。
- **Fails if**：五件中任一件实现 diff 超出提案边界（最可能：TaskDetail 渲染条件在 UI-GATE 通过前被顺手改动）。
- **Kill criterion**：tasks.md 中五件各自具备独立验收判据与回滚单元；越界即拆批（F6 + A18 可独立先行）。
- **Cheapest test**：PRD 定稿时逐件核对 recheck 判据独立存在。

## What's Well-Reasoned

- **F6 的事实链与修法完全经得起攻击**：写入侧唯一（`engine.ts:19`）、三消费端代码实据齐备、rss-collector 同款先例、V1/V2 探针双向证明「现状分析恒空、修复即真实产出」。提案对 A18 补强的预期（`totalRecords > 0`、品牌汇总非空）经 4-URL 模拟成立，9-URL 冒烟样板只会更充实。
- **② 确为纯加法**：`data-governance/src/manifest.ts` 已支持 `limitations` 可选参数（空数组落 `undefined`）；两调用点缺失实锤——`crawlers/cninfo-reports/src/engine.ts:335-354` 与 `crawlers/api-connector/src/engine.ts:422-438` 均未传；`UniversalManifestCard.tsx:139-145` 已具备 limitations 渲染块（无则不渲染）；`TaskDetail.tsx:244-246` 渲染条件与提案描述逐字一致（`cat !== 'product-price' && status === 'succeeded'`）。数据侧闭环不依赖任何 UI 改动。
- **⑤ N4 缺陷真实且可观察**：`runner.ts:91-103` 超时回调只查 `exited` 不查 `canceled`；取消走 SIGTERM→5s 宽限→SIGKILL（:80-88），宽限窗内超时到点会发出伪「任务超时」行，经 `queue.ts:222-236` → `reducer.ts:88-97`（canceled 状态不被改写但 `task.error` 被污染）→ `TaskDetail.tsx:232` 无条件渲染红条「任务失败：任务超时」——用户取消的任务显示为超时失败。修复（回调首行 `if (canceled) return`）与用例均与 `runner.test.ts:89-100` 既有超时测试同构，直接可写。
- **排除清单明确**：N2/N5/N6/view-desc/Ctrl-C/AgentReachBridge 均给出不做的理由与归属，无范围蔓延迹象。
- **基线数字属实**：当前全量恰为 204（V3），「零回退」口径可执行。

## What I Couldn't Assess

- **limitations 文案的「如实性」**：方向合理，但内容判断属 PRD/GRILL 职责，代码层无法证伪。
- **商品卡落点与 partial 渲染语义**：落点（Dashboard 上/下）与「partial 是否渲染」是 UI 决策，提案显式留 UI-GATE，本评审无浏览器截图执行条件，且仓库 UI 层无组件测试基建（handoff 已如实声明）。
- **门禁间歇失败的定位**：首轮全量 workbench 出现 1 个失败（100/101），因输出过滤未捕获用例名，后续 4 轮全绿。报告为环境观测：timing 敏感用例（cancel/超时/SSE 族）存在低概率 flake 可能，「门禁保持绿」的验收宜以复跑一次确认。

## Verdict：GO-WITH-CONDITIONS

无 kill 判据被满足；五件事全部实证可落地。放行条件：

1. **F6 测试更新面钉死**：`engine.test.ts:72-77` 与 `product-smoke-e2e.test.ts:83-90` 两处；pipeline/manifest/storage 包级测试不动。
2. **RSS 标题批列入 3 处既有断言更新**：`api.test.ts:295`、`task-params.test.ts:237-238`、`rss-e2e.test.ts:134`。
3. **A19 扩展名补齐须附被扫描 fixture**（含 allowlist 主机 URL 的新扩展名文件）证明白名单生效；做不到则该子项剔除，仅做无点判类修复。
4. **PRD 修正 404 表述**：/snapshot-content 现为 404、/evidence 现为 200 空数组，两者验收观测点不同。
5. **批次纪律**：五件各自独立验收与回滚单元；TaskDetail 渲染条件改动在 UI-GATE 通过前不得先行；任一件越界即拆批（F6+A18 可独立先行合入）。
