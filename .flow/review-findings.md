# REVIEW — 递延项收敛批（F6 领衔）

- **日期**：2026-10-16
- **评审者**：dev-flow REVIEW 阶段独立评审者（全新上下文，未参与实现与红队；一切结论以代码与命令输出为证）
- **Fixed point**：`9e86c45`（main）；范围 = `git diff 9e86c45`（21 文件，+391/−289，其中代码 16 文件 + 未跟踪 2 文件）+ `.flow/` 流程产物扫读；baseline_dirty = []

## Verdict: **PASS**

无 blocking finding。五件小修全部按提案五决策、PRD 决策 1-9、GRILL G1-G6、UI 增量合同 S5/N11-N15、红队 5 放行条件落地；两处实现偏差（pipeline.test 驱动路径、waitForFile）均**必要、正确、且在 tasks.md 证据中如实记录**。全量门禁亲自复跑三段 exit 0，**205/205** 与声明逐位吻合。

## 门禁复跑（亲自执行，仓库根）

| 段 | 命令 | 结果 |
|---|---|---|
| 测试 | `pnpm test` | **exit 0**；fail=0；tests/pass = data-governance **10** + firecrawl-scraper **27** + api-connector **20** + rss-collector **32** + cninfo-reports **14** + workbench **102** = **205/205**（实测两轮均全绿，二轮 9.0s / 10.6s，无 flake） |
| 类型 | `pnpm typecheck` | **exit 0**（6 包全部 Done） |
| 构建 | `pnpm build` | **exit 0**（vite 71 modules，built in 600ms） |

计数核对：基线 204（红队 V3：10+27+20+32+14+101）+1（N4）= 205 ✓；**既有 204 用例零回退**。

## Spec 轴 — 逐项核对（全部实证）

**T1 F6+A18** ✓ `crawlers/firecrawl-scraper/src/engine.ts:21` 构造改 `path.join(options.outDir, 'snapshots')`（唯一写入点）。三消费端对齐经代码实证：`src/main.ts:199`（--analyze 读 `outDir/snapshots`）、`apps/workbench/server/routes/evidence.ts:133`（snapshot-content 拼 `outDir/snapshots/<id>`）、`src/pipeline.ts:180`（manifest 声明 `snapshotsDir: 'snapshots/'`）。`engine.test.ts:73-79` 两层断言；`product-smoke-e2e.test.ts:95-117` 顶层反向断言 + `snapshots/` 恰 9 个 + A18 分析断言（`totalRecords === 9` + 三品牌 deepEqual）。旧 `TODO(F6)` 零残留；A18 为修复后断言，不给修复前缺陷背书。**全链路真实可用性**：product-smoke 经 workbench 队列真实 spawn firecrawl CLI（--mock --analyze），磁盘实证快照落 `snapshots/` 且分析真实产出——`/snapshot-content` 路由读同一布局，代码路径推理成立。

**T2 limitations** ✓ cninfo `engine.ts:354-357`、api `engine.ts:438-441` 各传 2 条，与 PRD 决策 4 **逐字一致**；断言扩展落点与 G2 钉死位置吻合（`json-mode.test.ts:174-178`、api `engine.test.ts:106-110`），深度=非空+`.some(includes(关键短语))`。

**T3 UI S5** ✓ `TaskDetail.tsx:244-246` 条件恰放宽 1 行（+1 行注释），JSX 块位置不动：Dashboard → UniversalManifestCard → 「📁 产出文件」。Dashboard 零改动、无新组件/路由/字符串（N12/N13/A3 成立）；G6 等价性成立；N14 404 静默兜底由组件既有 `if (!manifest) return null` 承载，无空壳。

**T4 A19** ✓ 判类 `adoption.test.ts:112` `/^\d+$/ || /^0x[0-9a-f]+$/i → ipLiteralAllowed`；**只读探针实证**（tsx 引入 egress.ts 复算）：`134744072`/`0x62626262` → 拒绝（红），`2130706433`/`0x7f000001` → 放行（绿）——无点整型经 `parseIpv4` 短格式路径正确展开。扩展名 +4；fixture `a19-scan-fixture.yaml` 在位（host 在 RFC 2606 放行域）；G4 包含断言在位且用 `path.join` 平台安全——kill 判据未触发。

**T5 RSS 标题** ✓ `task-params.ts:109` `（${urls.length} Feed）`；全仓 grep 实证断言**恰三处**，值与 G5 预计算逐字一致，无第四处——KA-3 kill 判据未触发。

**T6 N4** ✓ `runner.ts:94` `if (canceled) return;` 位于 emit 之前，超时不再重复 terminate，cancel 的宽限计时器仍兜底 SIGKILL。新用例按 G3 时序（stubborn-crawler + 2500/1500），实测 2549ms 正中设计窗口；既有正向超时用例仍绿（正反一对齐）。

**T7 VERIFY** ✓ 见门禁表；分文件计数声明全部核实：cninfo json-mode 恰 10、api engine 恰 8、runner 恰 7、T5 的「35/35」= task-params 17 + api 16 + rss-e2e 2——**七条勾选证据无虚假**。

### 两处实现偏差的正当性裁决

1. **pipeline.test 驱动路径更新**（红队 KA-1/PRD 决策 1 均预判「不动」）：**偏差必要且正确**。修复前 engine 顶层写入使 `outDir: snapshotsDir` 恰好落 `tmpDir/snapshots/snap_*`；修复后若不改，会双重嵌套而 pipeline 读不到。实现把 engine outDir 改为 `tmpDir`，pipeline 读取路径与全部断言零改动。KA-1 kill 判据不触发——这是驱动方式路径改写，非断言新增。tasks.md 证据如实记录。
2. **waitForFile 产物等待**（规格未预列）：**偏差正确**。`done` 事件在 `engine.run` 内部发出，分析管线在 run 返回之后才执行——workbench 队列在 done 即置终态，紧读产物存在真实竞态（实现期调试脚本实证）。确定性产物等待（50ms 轮询、30s 上限）严格优于 sleep。tasks.md 证据如实记录。

## Standards 轴

代码贴合仓库惯例；产品代码合计约 15 行（< PRD「<60 行」上界）；无未使用导入；Fowler 基线异味扫描无命中（`waitForFile` 与 `waitForTerminal` 形近但职责不同且同文件内联，不构成值得抽取的重复）。五件 diff 分块清晰、互不交叉，**各自构成独立回滚单元**（KA-5 达标）。`.flow/ui-contract.md` 证实 append-only（numstat 77/0）；未跟踪 2 文件均为声明工件。

## Findings

**Blocking：none。**

**Non-blocking**（观察项，不影响放行）：

| # | 位置 | 内容 | 归属上游阶段 | recheck 判据 |
|---|---|---|---|---|
| 1 | `engine.test.ts:74-75` | G1 原文「顶层 readdir 恰为 `['snapshots']`」，实现为仅过滤目录后 deepEqual——顶层若有文件会被容忍（本场景等价，契约仍锁住） | GRILL G1 措辞精度 | 改断言全量 readdir 仍绿即闭环；不改亦无实际暴露面 |
| 2 | `TaskDetail.tsx:244` | 合同 A0「恰 1 行」实现多 1 行 JSX 注释（零行为）；tasks.md 已透明记录 | UI-GATE A0 措辞 | 删注释行后 build 仍过即证明纯文档 |
| 3 | `runner.test.ts:103-124` | N4 用例依赖「fixture 启动 ≪ 1500ms」时序前提——极端负载下可能假红（本机两轮全绿） | GRILL G3 | CI 偶发红按 V3 政策复跑；连续红则提高 timeoutMs |
| 4 | `.flow/prd.md:24` vs `pipeline.test.ts:16-18` | PRD 决策 1「pipeline 测试零改动」被实证修正（驱动路径需更新）——PRD 吸收红队时的预测精度缺口，非实现过错 | PRD 决策 1 / KA-1 | 后续规格枚举测试更新面时区分「断言面 vs 驱动面」措辞 |
| 5 | `.flow/prd.md:39` | PRD Testing「新增约 +3」与 G2「断言扩展不新建用例」自相矛盾；实际 +1（205）以 G2 为准 | PRD 内部口径 | 引用计数以 G2/T7 实测为准 |
| 6 | `runner.ts:94` | PRD 决策 9「回调首行」实现为第二语句（`if (exited) return` 是既有首行）；语义判据已被新用例证明 | PRD 决策 9 措辞 | 无需改动 |

## 复跑实际结果（要点）

- `pnpm test` → exit 0：合计 **205/205，0 fail**（两轮）。
- `pnpm typecheck` → exit 0（六包全 Done）。
- `pnpm build` → exit 0（vite ✓ 600ms）。
- 只读探针（A19）：`134744072 → REJECTED`、`0x62626262 → REJECTED`、`2130706433 → ALLOWED`、`0x7f000001 → ALLOWED`。

## 限制声明

- `/tasks/:id/snapshot-content` 与 `/evidence` 的 HTTP 路由级端到端未单独起服探针：可用性由「product-smoke 真实 spawn 落盘布局实证 + evidence.ts:133 代码路径拼接一致 + 既有 evidence-api.test 手造同布局 fixture 用例全绿」三证合成推理（PRD 决策 3 本就裁定以落盘产物为准，不新增路由级用例）。
- 本评审未修改任何文件；门禁两轮全绿，未观测 timing flake。
