# 质量与体验收尾批 任务分解

基线：213/213（2026-10-16 红队两次复跑确认）。执行序：非 UI 五件先行 → UI 三件 → VERIFY。

- [x] T1. N5 三处异味 + engine.ts:101 死代码清理（G1 形态）
- [x] T2. N6 四处补测（G2/G3/G4a 形态）
- [x] T3. 观察项收口：N4 注记双落点 + engine.test 全量 readdir（G4c/G4d）
- [x] T4. F1 三处清理路径统一 + 20 轮验证（G4b/C3）
- [x] T5. F3 扩跳数 1200 + 红灯探针（C1）
- [x] T6. UI 三件：FA1 ③合并 / FA2 副标 / view-desc（已批准合同增量 A0-A9）
- [x] T7. VERIFY 全量门禁

---

## T1. N5 三处异味 + :101 清理

### What to build

G1 形态：runner.ts `cancel: terminate` 直写（删别名）；egress.ts 只解构 g0（删 `void g1`）；queue.ts 模块顶部三常量不导出——`RESTART_INTERRUPT_ERROR`（:62/:78 精确相等共用）、`MASKED_KEY_KEYWORD`/`MASKED_KEY_ERROR`（关键词结构性内嵌消息模板）；engine.ts `for (let hop = 0; ; hop++)` + 删尾部不可达 throw。**C4b 验证**：queue.test:293 保持独立文案断言；改一次常量文案 → queue.test 应红（反噬验证）→ 还原。

### Acceptance criteria

- [x] 全量绿（零行为变化证据）+ 反噬验证记录（改常量→红→还原）
- [x] queue.test:293 未消费常量（独立子串断言原样）

## T2. N6 四处补测

### What to build

G2/G3/G4a：①301/302 单用例双码（for 循环两码，seenMethods 模式 + 第二跳 body undefined 且 headers 无 Content-Type）；②5 跳上限（reason 含「（5）」+ fetchFn 恰 6 次）；③每跳计费（dryRun + 分页小池 maxCalls=1 + 单页 302→200 → 第 2 跳熔断 queryError CALLS_EXCEEDED + fetch 恰 2 次）；④mock:true 脱敏独立用例（raw key 走 create 掩码 → 重启标 failed + `/脱敏密钥/` 独立断言）。

### Acceptance criteria

- [x] 4 个新用例绿；G5 既有用例一字不动；净计数 +4

## T3. 观察项收口

### What to build

G4c/G4d：runner.test N4 用例 G3 注释扩写（时序前提 ready→cancel < timeoutMs=1500 < SIGKILL=ready+2500；假红形态=极端负载下先吐「任务超时」行 → 复跑政策）；engine.test 顶层断言改全量 sorted names deepEqual（含文件）。

### Acceptance criteria

- [x] 两处收口后各包测试绿

## T4. F1 三处清理统一 + 20 轮

### What to build

G4b 最小 diff：queue.test `:186-204`、`:270-298` finally 补 `await q2.close()` 于 rm 之前；`:241-268` close 移入 finally。不重构 withQueue。验证：`for i in $(seq 20); do tsx --test test/queue.test.ts || break; done` 全绿。

### Acceptance criteria

- [x] 三处统一；queue.test 连续 20 轮无红（C3 验收）

## T5. F3 扩跳数 + 红灯探针

### What to build

C1：N2「>500 跳」用例 maxPages 100→200（1200 跳 > 976 成本顶），标题同步改「>1000 跳」。红灯探针（开发期，记入证据）：删 engine.ts `maxCostUsd: undefined` → 用例必须红 → 还原必绿。

### Acceptance criteria

- [x] 1200 跳用例绿且秒级；探针红→绿记录在案

## T6. UI 三件

### What to build

已批准合同增量 A0 终裁：①FA1 ③合并——ProductPriceDashboard 删内嵌证书块（:164-279）/ZIP 按钮（:136-144）/caveats 块（:461-473），独有两指标（原文证据覆盖率/下游解耦兼容性）并入看板指标行（manifest && 门内，ppd-metrics 同款形态，位置=标题行下品牌表上）；②FA2——UniversalManifestCard:81 副标换钉死新句；③view-desc——TaskList:55 换钉死新句。N16-N22 负面清单遵守。

### Acceptance criteria

- [x] vite build 过；副标/view-desc 逐字=合同 A3；ZIP 唯一入口；caveats 单呈现；其他类目零变化（diff 范围恰三文件）

## T7. VERIFY 全量门禁

### Acceptance criteria

- [x] `pnpm test && pnpm typecheck && pnpm build` 三段 exit 0；213 + 4 = 217（预期）零回退

---

## 完成证据（2026-10-16）

- **T1 N5+:101**：runner `cancel: terminate` 直写；egress 只解构 g0；queue 三常量（RESTART_INTERRUPT_ERROR/MASKED_KEY_KEYWORD/MASKED_KEY_ERROR 关键词内嵌模板）不导出；engine `for(;;)` + 删不可达尾 throw。**C4b 反噬验证**：改常量 '脱敏密钥'→'掩码密钥' → queue.test 红（独立文案断言守住）→ 还原绿。workbench/api/governance 全绿 + typecheck 过。
- **T2 N6 四用例**：301/302 单用例双码（seenMethods POST→GET + 第二跳 body undefined/无 Content-Type）；5 跳上限（reason 含「（5）」+ fetch 恰 6 次）；每跳计费（分页小池 maxCalls=1 → 第 2 跳熔断 CALLS_EXCEEDED + fetch 恰 1 次——注意实现断言 fetchCalls===1：第 2 跳被门禁拦截在请求前）；mock:true 脱敏独立用例（红灯修复：需 blocker 占位让目标滞留 queued——直接 running 会走「重启中断」分支）。api 27/27、queue 12/12。
- **T3 观察项**：N4 注记扩写（时序前提三段式 + 假红形态 + 复跑政策）；engine.test 全量 sorted readdir。
- **T4 F1**：四处清理路径统一「close 先于 rm」（:186/:243/:305 finally hoist；:273-303 为 try 末尾 close——绿路径竞态已消除，评审 Finding 1 记录该字面偏差与断言失败路径的遮蔽残余）（:186 hoist q2、:241 close 移入 finally、:270 q2.close、:301 新用例对齐 hoist；TS 闭包 null 收窄用 q! 修正）。**20 轮循环全绿**（C3 验收）。
- **T5 F3**：>1000 跳用例（maxPages 200 = 1200 跳，46ms）+ reason 断言扩 COST_EXCEEDED。**红灯探针**：删分页池 maxCostUsd:undefined → 用例红（COST_EXCEEDED 于 ~977 跳）→ 还原绿；另实证下载池探针不适用 dryRun 路径（记录）。
- **T6 UI 三件**：Dashboard 删 ZIP 按钮/内嵌证书面板/caveats 块（正则定位，面板块含三重校验），独有两指标并入看板指标行（manifest && 门内）；副标/view-desc 逐字换钉死新句；showManifestDetail 状态随面板删除清理（同域清理）。typecheck + vite build 过；workbench 107/107。
- **T7 VERIFY**：首轮全量在后台高负载下 1 红（rss-e2e 双Feed flake）+ 套件挂起（杀后台任务后单文件 2/2 绿）——按 V3 复跑政策重跑：**三段 exit 0，217/217**（governance 10 + firecrawl 27 + api 27 + rss 32 + cninfo 14 + workbench 107；基线 213 + 4）。
