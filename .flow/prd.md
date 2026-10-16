# PRD — 递延项收敛批（F6 领衔）

- 规格 precedence：`.flow/proposal.md` ＞ 本文件；红队 `.flow/red-team.md`（GO-WITH-CONDITIONS，5 条件）已逐条吸收并标注 KA。
- 发布方式：无 issue tracker，落盘 `.flow/prd.md`（既有惯例）。

## Problem Statement

三处前批评审裁决的递延缺陷仍在伤人：F6 使 mock 商品任务「成功但分析恒空」且 workbench 快照回看 404；限制声明展示只有 RSS 有数据（cninfo/api 不传 limitations、商品任务不渲染卡）；用户取消的任务在超时宽限窗内会被伪「任务超时」红条污染。另有三处小缺口：A19 扫描器的无点 IP 编码与扩展名盲区、RSS 任务标题同质不可区分。

## Solution

五个独立小修（每件独立验收与回滚单元，红队 KA-5 批次纪律）：F6 一行路径修复 + A18 断言补强；cninfo/api limitations 参数 + 商品任务 manifest 卡渲染；A19 判类与扩展名收口；RSS 标题附 Feed 数；N4 超时回调 canceled 检查。产品代码合计 <60 行。

## User Stories

1. 作为运营人员，我想跑 mock 商品样板后看到真实的品牌中位数分析（而非恒空），以便样板演示可信。
2. 作为运营人员，我想在工作台回看商品任务与 RSS 任务的快照原文和证据，以便核验数据。
3. 作为数据消费者，我想让四类正式任务的详情页都有限制声明（财报=PDF 原件、API=按路径提取等），以便知道数据边界。
4. 作为运营人员，我想让取消的任务不被「任务超时」红条误导，取消语义干净。
5. 作为运营人员，我想在任务列表里凭标题区分多条 RSS 任务。

## Implementation Decisions

1. **F6（KA-1）**：`firecrawl-scraper/src/engine.ts` 的 SnapshotStorage 构造改传 `path.join(outDir, 'snapshots')`（对齐 `--analyze`、workbench evidence 路由、manifest `snapshotsDir` 声明三消费端；rss-collector 同款先例）。测试更新面恰两处：`engine.test.ts`（快照目录断言改 `snapshots/` 下）、`product-smoke-e2e.test.ts`（断言 `snapshots/` 布局并移除 `TODO(F6)`）。pipeline/manifest/storage 包级测试零改动。
2. **A18 补强（KA-1/V2）**：product-smoke 增分析内容断言——`analysis_summary.json` `totalRecords === 9`、brandSummaries 含三品牌（红队模拟探针已证修复后真实产出：4 URL 得 totalRecords 4 + 正确中位数）。
3. **验收观测点修正（KA-2）**：修复后 `/tasks/:id/snapshot-content` 从 404→200 有内容、`/tasks/:id/evidence` 从 200 空数组→200 有内容——两者口径不同，验收断言以 product-smoke 的落盘产物为准，不新增路由级用例。
4. **limitations 数据闭环**：cninfo engine manifest 构造传 `['公告原件为 PDF 快照落盘，不做文本抽取与结构化', '披露内容以巨潮资讯网原文为准，不做二次加工']`；api-connector 传 `['响应内容按配置路径规则提取，字段缺失不推断不补全', '附件按原文件字节落盘，内容真实性与源站一致']`；各附一条既有 manifest 相关测试的断言扩展（不新建文件）。
5. **商品任务 manifest 卡（UI 增量，UI-GATE 前不得先行——KA-5）**：TaskDetail 对 product-price 且 succeeded 的任务在 ProductPriceDashboard 之后渲染 UniversalManifestCard；渲染条件从「非 product-price 且 succeeded」改为「succeeded（全部类目）」；partial/failed 仍不渲染。细节经 UI-GATE 增量补记确认。
6. **A19 判类（KA-4）**：`adoption.test.ts` 无点 token 分支——纯数字/`0x` 十六进制先经 `ipLiteralAllowed` 判类（字母 token 维持忽略）；红队 V4 探针已证 `134744072`/`0x62626262` 翻红、`2130706433` 存量保持绿。
7. **A19 扩展名（KA-4 条件 3）**：白名单补 `.yaml/.yml/.csv/.snap`，并新增一个被扫描的 `.yaml` fixture（内容含 allowlist 主机的 http URL）证明扩展生效——否则该子项剔除（红队 kill 判据）。
8. **RSS 标题（KA-3）**：`summarizeTask` rss 分支改 `RSS 采集 · ${name}（${urls.length} Feed）`；同步更新恰三处断言：`api.test.ts:295`、`task-params.test.ts:237-238`、`rss-e2e.test.ts:134`（红队全仓清点，无第四处）。
9. **N4（红队实证污染链）**：runner 超时回调首行 `if (canceled) return;`；新增用例「取消后立即触发超时不输出任务超时行」（与 `runner.test.ts` 既有超时测试同构）。

## Testing Decisions

- F6/A18：engine.test 既有用例断言更新 + product-smoke 既有用例断言扩展（+分析断言）；修复验证含开发期探针（注入 `https://134744072/x` → A19 红、移除 → 绿，记入证据）。
- limitations：cninfo/api 各一条既有测试断言扩展（manifest.limitations 非空且含关键短语）。
- N4：runner.test 新增 1 用例。
- 新增测试净计数：约 +3（limitations×2 + N4×1），其余为断言扩展；基线 204 零回退。
- 全量门禁：`pnpm test && pnpm typecheck && pnpm build`；timing 敏感用例偶发 flake 时复跑一次确认（红队 V3 观测）。

## Out of Scope

N2（预算定容，需设计决策另批）、N5/N6、TaskList view-desc 措辞、Ctrl-C 孤儿爬虫清理、商品面板 partial 渲染、WC-AR-03。

## PRD Diff Gate（auto 模式，2026-10-16）

1. limitations 四条文案钉死（提案开放问题落定）——纯增量。
2. A19 扩展名子项的 fixture 佐证要求（红队条件 3 吸收）——增量收紧。
3. 观测点表述修正（404 vs 200 空，红队条件 4）——事实修正。
4. F6 测试更新面与 RSS 标题断言面由红队枚举钉死（条件 1/2）——增量细化。
5. 商品卡渲染条件定为「succeeded 全类目」（提案留 UI-GATE 的预裁，最终以 UI-GATE 为准）——增量。

无变更/丢弃提案已定决策；无需升级。

## GRILL 决议附录

### Round 1（作者盲审子代理 6 包，主代理核验后全采纳，2026-10-16）

- **G1（Q1）F6 测试改法**：engine.test 显式两层定位——顶层 `readdir(tmpDir)` 恰为 `['snapshots']`（锁目录名=锁契约），再进 `snapshots/` 找 `snap_*` 读 metadata；product-smoke 双层断言（顶层无 `snap_*` 反向 + `snapshots/` 下恰 9 个）；`/files` 列表前缀变化不加路由级断言（walkFiles 递归天然承载，cninfo 嵌套先例 files.test.ts:56 在案）。
- **G2（Q2）limitations 断言落点重述**（PRD 决策 4 前提修正：两包不存在「manifest 相关测试」）：cninfo → `json-mode.test.ts:130`「--json 正式运行…」尾部扩展（非 dry-run 必落 manifest，engine.ts:314 守卫）；api → `engine.test.ts:39`「正常分页与附件下载」尾部扩展（3 文件落盘触发 manifest）；深度=非空 + `.some(includes(关键短语))`（cninfo 查「不做文本抽取」，api 查「不推断」）——沿 rss-collector/firecrawl 既有深度先例，不逐字 deepEqual。
- **G3（Q3）N4 用例确定性时序**：复用既有 `fixtures/stubborn-crawler.mjs`（忽略 SIGTERM、先注册后打就绪行）+ `{ killGraceMs: 2500, timeoutMs: 1500 }`：等 ready → cancel → await done；断言 `exit.signal === 'SIGKILL'`（「到点时未退出」的确定性代理）+ 无「任务超时」行且无 error 类型行。两条不变式：cancel 早于超时（.mjs 启动 ≪1.5s）、SIGKILL 晚于超时（ready+2.5s > 1.5s）。**陷阱记录：禁用尊重 SIGTERM 的 fixture（会空转）**。
- **G4（Q4）A19 fixture 佐证**：`apps/workbench/test/fixtures/a19-scan-fixture.yaml`（两行：注释说明用途 + `target: https://example.com/report`）；A19 测试内补显式包含断言 `testFiles.some(f => f.endsWith('fixtures/a19-scan-fixture.yaml'))`——否则按红队 kill 判据扩展名子项剔除。
- **G5（Q5）RSS 标题断言值预计算**：全角括号计数有 ≥3 处 UI 先例（TaskList 预览计数/TaskDetail 已取消附注/RssPicker hint），「`·`=字段分隔、括号=附注」两体系各归其位。三个新断言值：api.test.ts:295 → `RSS 采集 · 公开资讯（2 Feed）`；task-params.test.ts:237-238 → `RSS 采集 · 行业资讯（1 Feed）`；rss-e2e.test.ts:134 → `RSS 采集 · 公开资讯 e2e（2 Feed）`。
- **G6（Q6）UI 增量等价性证明**（供 UI-GATE 补记引用）：`cat !== 'product-price' && status === 'succeeded'` → `status === 'succeeded'` 对非 product 类目严格等价（partial 等非 succeeded 终态改前改后均不渲染，status 枚举六值全覆盖）；唯一增量 = product-price ∧ succeeded 在 ProductPriceDashboard 后渲染卡片；`analyze:false`/无 manifest 的商品任务由卡片 404 静默兜底（`if (!manifest) return null`）不会空壳。

### Round 2（主代理，2026-10-16）

扫描全部已定项后无新增开放问题（UI 增量的原型呈现方式属 UI-GATE 自身流程决策）。

**GRILL 收敛**：2 轮收敛。
