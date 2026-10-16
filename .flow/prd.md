# PRD — 质量与体验收尾批（规划内最后一批）

- 规格 precedence：`.flow/proposal.md` ＞ 本文件；红队 `.flow/red-team.md`（GO-WITH-CONDITIONS，4 条件 C1-C4 + R4 取舍要求）已逐条吸收。
- 发布方式：无 issue tracker，落盘 `.flow/prd.md`（既有惯例）。

## Problem Statement

递延台账的收口件散落四处：三处代码异味（N5）、四处测试覆盖缺口（N6）、两处评审观察项、两个批评审遗留（F1 清理 flake / F3 maxCostUsd 缺口），以及三处用户可见文案/去重欠账（FA1 面板级双呈现 / FA2 副标不实 / view-desc 直采不全真）。

## Solution

非 UI 五件先行（异味清理 + 补测 + 观察项 + F1/F3），UI 三件随后经 UI-GATE 裁决落地。全部微小项共用一条门禁，本批完成后递延台账清零。

## User Stories

1. 作为维护者，我想让代码异味与死代码清干净、测试覆盖到关键改写路径，以便后续改动不踩暗雷。
2. 作为门禁信任方，我想让 queue 测试不再偶发 ENOTEMPTY、N2 用例真正封住 maxCostUsd 缺口，以便红绿信号可信。
3. 作为运营人员，我想让任务列表描述与商品详情的导出/声明呈现如实、不重复，以便界面信息可信且不误导。

## Implementation Decisions

### 非 UI 五件（先行）

1. **N5 三处异味 + 两处顺手清**（条件 C4 扩展）：
   - runner.ts `const cancel = terminate;` 别名删除（`cancel: terminate` 直写）；
   - egress.ts 只解构 g0（删 `void g1` 压制）；
   - queue.ts **两条**魔法字符串收敛为常量（`:62/:78`「服务重启导致任务中断」与 `:73/:78`「脱敏密钥」文案/反查对——红队 C4a）；**queue.test:293 保持独立于常量的人类可见文案断言**（C4b，防「改常量全链绿」反噬）；
   - 顺手清 engine.ts:101 不可达 throw（N5 邻域死代码，红队建议）。
   全部零行为变化。
2. **N6 四处补测**：
   - 5 跳上限：6 连跳断言「重定向次数超过上限」；
   - 301/302 POST→GET：构造 POST+301/302 断言改写为 GET（现仅 303 覆盖）；
   - mock:true + 脱敏 key → 重启标 failed（**取舍记录（R4）**：维持 WC-AR-05 判据「不豁免」——fail-closed 一致规则无分支、mock 任务重提成本极低、UI 已在 mock 模式隐藏 key 输入仅残留态触发；若未来答疑成本外显再议豁免）；
   - 每跳计费行为断言：budgets 注入小池 maxCalls=1 + 重定向请求 → 第 2 跳即熔断（同时覆盖「跳也计费」与 G5 seam 复用）。
3. **观察项收口**：engine.test 顶层断言改全量 readdir（含文件，G1 措辞精度）；N4 用例注释补时序前提（ready→cancel < timeoutMs < SIGKILL 兜底）与复跑政策指引（偶发假红先复跑）。
4. **F1 三处清理路径统一**（条件 C3）：queue.test.ts `:186-204`、`:270-298` 两处 finally 补 `await q2.close()` 于 `rm` **之前**；`:241-268` 的 close 移入 finally。验收：queue.test 连续 ≥20 轮无红。
5. **F3 扩跳数为主**（条件 C1）：N2「>500 跳」用例 maxPages 100→200（1200 跳，纯内存 mock 秒级）——默认成本顶 ≈976 跳，1200 跳封死 maxCostUsd 漏传缺口。验收：删 `engine.ts:208` 的 `maxCostUsd: undefined` 必须红、恢复必绿。getConfig 断言不做（内部池不暴露，须改生产 seam 才有意义——红队 C1 明示不充数）。

### UI 三件（UI-GATE 裁决后落地）

6. **FA1 面板级收敛**（条件 C2 关联、红队扩面）：商品 ∧ succeeded 详情现渲染 Dashboard 内嵌「标准化交付质检证书」整块与 UniversalManifestCard 同源整块（指标/指纹/导出按钮/caveats 全部重复）——UI-GATE 按**面板级收敛**裁决形态（保留哪块、去哪块、caveats 单/双呈现）。
7. **FA2 副标措辞**（条件 C2）：事实基修正——cninfo/api 经 data-governance 自动签发，**rss 与 product 均手工构造**（仅用其类型与 SHA-256 原语）；新副标须过**四路径真值表**（对四者都如实）且不与卡内「生成引擎」指标矛盾（方向：「交付清单遵循 data-governance 统一规范 · 全文件 SHA-256 防篡改」类「规范符合性」措辞）。
8. **view-desc 措辞**：TaskList 描述改涵盖直采与预览两路径的如实文案（具体措辞 UI-GATE 钉死）。
9. **UI-GATE 合同关系**：本批 UI 三件必然触碰上批合同 N9/N13/N15（不得改 UniversalManifestCard 既有区段/不新增组件/不改 slate 语系）——UI-GATE 增量补记须**明示取代/豁免关系**。

### 执行序与门禁

10. 非 UI 五件先行落地，UI 三件随后（避免 UI 措辞循环阻塞）；全量门禁 `pnpm test && pnpm typecheck && pnpm build`，基线 213 零回退；queue.test 20 轮 flake 验证单独执行。

## Testing Decisions

- N5：全量绿即零行为变化证据（+「改常量文案→queue.test:293 红」的反噬验证一次，C4b）。
- N6：4 个新用例（跳上限/301、302 改写/mock 脱敏/每跳计费）。
- F1：20 轮循环验证；F3：跳数改数字 + 删 maxCostUsd 红灯探针（开发期，记入证据）。
- UI 三件：无组件测试基建——验收 = vite build + UI 合同增量对照 + 副标四路径真值表逐格勾选。
- 新增测试净计数约 +4；全量三段 exit 0。

## Out of Scope

F2（已裁可接受）、firecrawl budget-gate 门面删除（一行 re-export，记录澄清）、N4 重构（只注记）、budgets seam 导出默认池构造（C1 明示不做）、WC-AR-03。

## PRD Diff Gate（auto 模式，2026-10-16）

1. N5-3 从一条常量扩展为两条（C4a，同类完整性补充）——增量。
2. F3 选项从「扩跳或 getConfig」收敛为扩跳（C1：getConfig 封不死缺口的实证）——增量修正。
3. F1 从一处修扩展为三处统一（C3）——增量。
4. FA2 事实基修正（rss 同为手工构造）——事实修正（提案开放问题本就要求四者如实，红队补齐事实基）。
5. R4 取舍记录（mock 不豁免 + 理由）——增量记录。
6. engine.ts:101 死代码顺手清（红队建议，N5 邻域）——增量。
7. 执行序（非 UI 先行）——流程细化。

无变更/丢弃提案已定决策；无需升级。

## GRILL 决议附录

### Round 1（作者盲审子代理 5 包，主代理核验后全采纳，2026-10-16）

前提修正三件（代码可答，直接采信）：303 测试先例已读 init.method（非「忽略 init」）；product caveats 与 manifest limitations 同源（pipeline.ts:180）；删 engine.ts:101 字面执行触发 TS2366（须换清除形式）。

- **G1（包1）N5 落地形态**：三常量、形态随各自反查、放 queue.ts 模块顶部、**不导出**（C4b 构造性保证——测试想消费常量也消费不到）：`RESTART_INTERRUPT_ERROR`（:62/:78 精确相等共用）+ `MASKED_KEY_KEYWORD`/`MASKED_KEY_ERROR`（关键词结构性内嵌消息模板，文案改动即反查失配结构性消除）。反查形态不强行统一（精确相等 vs 子串语义不同）。engine.ts:101 清除形式 = `for (let hop = 0; ; hop++)`（上限判断已内联）+ 删尾部 throw（TS 见无正常出口不报 TS2366，零行为变化）。`'****'` 掩码对同型耦合留档不扩面（超已裁两条，收口需 Diff Gate 增量）。
- **G2（包2）N6 重定向双用例**：301/302 单用例双码（for 循环，净 +1），照抄 303 的 seenMethods 模式，**另断言第二跳 init.body === undefined 且 headers 无 Content-Type**（覆盖改写分支全语义）；5 跳上限用例断 reason 含数字 `/重定向次数超过上限（5）/` + **fetchFn 恰 6 次**（钉死 1+5 跳契约，与 hopAllowance 预算公式呼应）；与 N2 5 跳成功用例构成正/负边界对。
- **G3（包3）每跳计费断言**：dryRun + budgets.pagination 小池 maxCalls=1 + 单页 302→200 链；断言 queryError（target 第 1 页）reason `/\[BudgetGate\].*CALLS_EXCEEDED/` + fetchFn 恰 2 次 + summary.failed ≥ 1。与 G5 边界：G5=页级第 2 页熔断（双池注入无重定向），本例=页内第 2 跳熔断（单页重定向链仅注分页池），G5 用例一字不动。
- **G4（包4）测试侧四形态**：mock:true 脱敏补测=**独立命名新用例**「mock:true 不豁免重启脱敏判定」（raw key 走 create 真实掩码路径，断言 `/脱敏密钥/` 独立文案——用例命名即 R4 取舍的可执行记录；注意 `'abc****xyz'` 非掩码不动点，不可手写 fixture 形态）；F1=逐处最小 diff（:186/:270 finally 先 close 后 rm、:241 close 移入 finally；不重构 withQueue——双队列舞蹈改 helper diff 面大于收益）；N4 注记=双落点（runner.test G3 注释扩写时序前提与假红形态 + PRD Testing 补复跑政策一行）；engine.test=全量 sorted names deepEqual（含文件，正中 G1 措辞）。附带：N2 用例标题随 F3（1200 跳）同步更新。
- **G5（包5）UI-GATE 输入初稿**（终裁权归 UI-GATE）：
  - FA2 真值表（预填事实行）：cninfo/api=自动签发真+规范真；rss/product=手工构造、仅用类型+SHA-256 原语、自动签发**假**+规范真。候选副标 C1「交付清单遵循 data-governance 统一规范 · 全文件 SHA-256 防篡改」/ C2「按 data-governance 交付规范组装 · 全文件 SHA-256 防篡改」。
  - FA1 收敛选项：①去 Dashboard 内嵌证书块（独有指标随之消失）；②去 product 详情 manifest 卡（违 N13 需豁免）；③**合并（推荐）**——Dashboard 去重证书卡头/指纹/导出按钮/同源 caveats（pipeline.ts:180 同源实证，纯重复），独有指标并入看板指标行，manifest 卡保持唯一「证书/指纹/导出/限制声明」呈现。
  - view-desc 候选 C1/C2（直采+预览两路径措辞，见初稿原文）。
  - 合同豁免清单：N9/N15 ← FA2 改副标触碰 UniversalManifestCard:81 → 明示文案级豁免；N15 slate 语系保留；N13 走③不违、走②须豁免。

### Round 2（主代理，2026-10-16）

扫描已定项后无新增开放问题。

**GRILL 收敛**：2 轮收敛。