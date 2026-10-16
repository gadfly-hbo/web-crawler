# 递延项收敛批 任务分解（tracer-bullet 垂直切片）

基线：204/204（2026-10-16，红队 V3 + 主代理多轮实跑确认）。

- [x] T1. F6 快照布局修复 + A18 分析断言补强（KA-1/G1）
- [x] T2. cninfo/api manifest limitations 数据闭环（决策 4/G2）
- [x] T3. 商品任务 manifest 卡渲染（UI 增量 S5，恰 1 行条件放宽）
- [x] T4. A19 判类收口 + 扩展名补齐 + fixture 佐证（决策 6/7/G4）
- [x] T5. RSS 标题附 Feed 数 + 三处断言更新（决策 8/G5）
- [x] T6. N4 超时回调 canceled 检查 + 用例（决策 9/G3）
- [x] T7. VERIFY 全量门禁

---

## T1. F6 快照布局修复 + A18 补强

### What to build

`firecrawl-scraper/src/engine.ts` SnapshotStorage 构造改传 `path.join(outDir, 'snapshots')`（唯一写入点 :19）。测试两处（红队 KA-1 钉死）：`engine.test.ts` 改两层定位（顶层 readdir 恰为 `['snapshots']`，再进子目录找 `snap_*` 读 metadata——G1）；`product-smoke-e2e.test.ts` 断言改 `snapshots/` 下恰 9 个 `snap_*` + 顶层反向断言无 `snap_*`，移除 `TODO(F6)`，并补分析断言（`analysis_summary.json` `totalRecords === 9`、brandSummaries 含三品牌——A18 补强）。

### Acceptance criteria

- [ ] engine.test 两层断言绿；pipeline/manifest/storage 包级测试零改动仍绿
- [ ] product-smoke：snapshots/ 布局 + totalRecords 9 + 三品牌汇总；无 TODO(F6) 残留
- [ ] firecrawl 包测试全绿（27 基线不变或断言内更新）

### Blocked by

None

---

## T2. cninfo/api manifest limitations

### What to build

cninfo `engine.ts:335-354` 与 api `engine.ts:422-438` 的 createAndSaveDeliveryManifest 调用各传 limitations（PRD 决策 4 四条文案逐字）；断言扩展（G2）：cninfo `json-mode.test.ts:130` 用例尾部 + api `engine.test.ts:39` 用例尾部各加「manifest.limitations 非空 + `.some(includes(关键短语))`」（cninfo 查「不做文本抽取」、api 查「不推断」）。

### Acceptance criteria

- [ ] 两包各自测试绿，断言命中新 limitations
- [ ] 纯参数加法，无其他行为变化

### Blocked by

None

---

## T3. 商品任务 manifest 卡（UI 增量 S5）

### What to build

`TaskDetail.tsx:244` 渲染条件 `cat !== 'product-price' && task.status === 'succeeded'` 放宽为 `task.status === 'succeeded'`（恰 1 行，G6 等价性证明 + 已批准 UI 增量合同 A0）。

### Acceptance criteria

- [ ] typecheck + vite build 过；diff 恰 1 行（该条件）
- [ ] 既有 91+ 用例零回退（无组件测试，验收=构建+合同对照）

### Blocked by

UI-GATE 批准（已达成，2026-10-16）

---

## T4. A19 判类收口 + 扩展名补齐

### What to build

`adoption.test.ts`：①无点 token 分支——`/^\d+$/` 与 `/^0x[0-9a-f]+$/i` 先经 `ipLiteralAllowed` 判类（字母 token 维持忽略）；②textExtensions 补 `.yaml/.yml/.csv/.snap`；③新增 `apps/workbench/test/fixtures/a19-scan-fixture.yaml`（注释 + `target: https://example.com/report`）；④测试内补包含断言 `testFiles.some(f => f.endsWith('fixtures/a19-scan-fixture.yaml'))`（G4——缺此断言该子项按红队 kill 判据剔除）。开发期探针：注入 `https://134744072/x` 验证红（记入证据）。

### Acceptance criteria

- [ ] 探针实证：注入 `134744072` → A19 红且点名；移除 → 绿（红队 V4 已模拟证明）
- [ ] fixture 被扫描基数包含（断言在位）；全仓扫描零违规
- [ ] 既有 A01/A19 用例绿

### Blocked by

None

---

## T5. RSS 标题附 Feed 数

### What to build

`shared/task-params.ts` summarizeTask rss 分支改 `RSS 采集 · ${name}（${urls.length} Feed）`；三处断言更新（G5 预计算值）：`api.test.ts:295` → `RSS 采集 · 公开资讯（2 Feed）`；`task-params.test.ts:237-238` → `RSS 采集 · 行业资讯（1 Feed）`（两行）；`rss-e2e.test.ts:134` → `RSS 采集 · 公开资讯 e2e（2 Feed）`。

### Acceptance criteria

- [ ] 三处断言更新后全绿；无第四处断言（红队 KA-3 清点）
- [ ] 旧任务标题不受影响（创建时固化语义，无需迁移）

### Blocked by

None

---

## T6. N4 超时回调 canceled 检查

### What to build

`runner.ts` 超时回调首行 `if (canceled) return;`；新用例（G3）：复用 `fixtures/stubborn-crawler.mjs` + `spawnRunner(spec, { killGraceMs: 2500, timeoutMs: 1500 })`——等 ready → cancel → await done；断言 `exit.signal === 'SIGKILL'` + 日志无「任务超时」行且无 error 类型行。**禁用尊重 SIGTERM 的 fixture（空转陷阱）**。

### Acceptance criteria

- [ ] 新用例绿（约 3s）；既有超时用例（无取消时必发超时行）仍绿——正反一对
- [ ] runner 其余行为零变化

### Blocked by

None

---

## T7. VERIFY 全量门禁

### Acceptance criteria

- [ ] `pnpm test && pnpm typecheck && pnpm build` 三段 exit 0；基线 204 + 新增（预期 +3：N4×1 + limitations 断言为扩展不增数；fixture 不增数）
- [ ] timing 敏感用例如偶发 flake 复跑一次确认（红队 V3 政策）

---

## 完成证据（2026-10-16）

- **T1 F6+A18**：engine.ts 构造改 `path.join(outDir, 'snapshots')`；engine.test 两层断言（顶层恰 ['snapshots'] + 子目录 snap_* 读 metadata）；product-smoke 改 snapshots/ 布局断言（顶层反向 + 9 个）+ A18 分析断言（totalRecords===9 + 三品牌汇总）+ waitForFile 等待产物（done 事件先于 pipeline 的既有竞态，调试脚本实证后以产物等待而非 sleep 修复）。**红队 KA-1「pipeline 测试不动」经实证修正**：pipeline.test.ts 引擎驱动路径需从 snapshotsDir 改为 tmpDir（双重嵌套），属驱动方式更新非断言新增。firecrawl 27/27 + typecheck。
- **T2 limitations**：cninfo/api manifest 各传 2 条（PRD 决策 4 逐字）；断言扩展落 json-mode.test.ts「--json 正式运行」尾部与 api engine.test.ts「正常分页与附件下载」尾部（非空 + 关键短语）。cninfo 10/10、api 8/8 绿。
- **T3 商品卡**：TaskDetail 条件放宽恰 1 行（+1 行注释），typecheck + vite build 过。
- **T4 A19**：无点数字/0x 先经 ipLiteralAllowed 判类；扩展名补 .yaml/.yml/.csv/.snap；a19-scan-fixture.yaml + 包含断言。探针实证：注入 `https://134744072/x` → A19 红且点名 → 移除 → 2/2 绿。
- **T5 标题**：summarizeTask rss 分支 `（N Feed）`；三处断言按 G5 预计算值更新（api 2 Feed/task-params 1 Feed/rss-e2e 2 Feed），35/35 绿。
- **T6 N4**：runner 超时回调首行 `if (canceled) return`；新用例 stubborn-crawler + killGraceMs 2500/timeoutMs 1500，断言 SIGKILL 信号（确定性代理）+ 无「任务超时」行 + 无 error 行，实测 2.55s 正中设计时序；既有超时用例仍绿（正反一对）。runner 7/7。
- **T7 VERIFY**：三段 exit 0，**205/205**（governance 10 + firecrawl 27 + api 20 + rss 32 + cninfo 14 + workbench 102；基线 204 + 1），实测约 11s。
