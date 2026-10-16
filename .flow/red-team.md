# 红队评审：质量与体验收尾批提案（规划内最后一批）

- **提案**：`.flow/proposal.md`（固化 2026-10-16，七件事：N5 三处异味 / N6 四处补测 / 递延观察项 / F1+F3 / FA1 / FA2 / view-desc）
- **仓库**：`/Users/huangbo/Dev/Projects/web-crawler`，main @ 9a97f17（工作区仅 `.flow/proposal.md` 未提交）
- **评审日期**：2026-10-16
- **评审者立场**：对抗性红队，与提案作者无关；只读仓库，探针写入 `/tmp`
- **基线核实**：两次完整复跑 `pnpm test`，均 **213/213 全绿**（data-governance 10 + firecrawl 27 + api 24 + rss 32 + cninfo 14 + workbench 106）。提案「基线 213」属实。

## 结论摘要

提案七件事中六件的事实基础经代码逐条核实**成立**（N5 三处、N6 四缺口、F1 根因、F3 数学、budget-gate 门面、基线 213）。真正会被现实击穿的是三处「怎么落地」的隐含假设：**F3 的 getConfig 选项封不死缺口**、**FA2 的事实基漏了 RSS**、**F1 修法字面执行只修一半**。另有两处低危语义问题（mock:true 钉死方向、N5-3 常量范围）。

**Verdict: GO-WITH-CONDITIONS**（4 条件，均可在实现期一次性验证）

## 实证摘要（提案七件事逐条现状核实）

### 1. N5 三处现状——全部属实，改动面最小

| 项 | 现状 | 核实结论 |
|---|---|---|
| runner cancel 别名 | `apps/workbench/server/runner.ts:89` `const cancel = terminate;`，使用面恰 1 处（`:110`） | 改 `cancel: terminate` 确为零行为变化 |
| egress `void g1` | `packages/data-governance/src/egress.ts:83` 解构、`:92` `void g1;` 压制 | **仍在**（WC-AR-04 删的是另一处死分支）。只解构 g0 零行为变化 |
| queue 魔法字符串 | `queue.ts:73` 错误文案 + `:78` `'脱敏密钥'` 子串反查；**另有第二对同型耦合** `:62` `'服务重启导致任务中断'` ↔ `:78` 精确相等反查；测试侧第三消费点 `queue.test.ts:293` | 提案只点一对，`:62/:78` 同型耦合未入册 |

### 2. N6 四处缺口——全数属实（全 test 目录 grep 已核）

- **5 跳上限抛错**（`engine.ts:84/:101`）：零测试。附带发现：`:101` 的 throw 不可达（循环 6 迭代，第 6 迭代 3xx 必走 `:84`）——N5 邻域死代码，顺手可清。
- **301/302 POST→GET**（`engine.ts:88-89`）：`(301||302)&&method==='POST'` 这半边**零覆盖**，写反了测试也不红。
- **mock:true 脱敏不豁免**（`queue.ts:66-75` 行为正确）：无 mock:true+脱敏 key 用例。
- **每跳计费断言**（`engine.ts:77-79`）：无行为级断言（N2 稠密跳用例在「跳不计费」回归下同样绿）。

### 3. F1 flake——根因成立，错误类别已复现

竞态：`queue.test.ts:270-298` finally 直接 `rm(dir)`，q2 从未 close；`queue.ts:208` fire-and-forget `void this.persist()` 与 rm 并发交织即 ENOTEMPTY。探针：同型交织 ENOTEMPTY 127/200；close 修复变体 200/200 绿。**修法覆盖面缺口**：同文件 `:186-204` 重启用例同样不 close；`:241-268` close 在 try 尾（断言抛出即跳过）——三处应统一「finally 先 close 后 rm」。

### 4. F3 缺口——数学属实，但 getConfig 选项有陷阱

漏传 `maxCostUsd: undefined`（默认 0.20 生效）→ **第 977 跳 COST_EXCEEDED，≈976 跳顶**（与台账数字一致）。现用例 600 跳 < 976，缺口成立。扩跳成本可忽略（sleepMs=0 纯内存 mock）。**陷阱**：要断言的是 `engine.ts:208` 内部默认池的配置，但该池不对外暴露——注入池 getConfig 是自证，BudgetGate 单测 getConfig 只钉 spread。要 getConfig 封死缺口须先导出默认池构造 seam（生产改动，与「纯增测试」口径冲突）。**真正的封死只有行为（>976 跳）**。

### 5. UI 三项影响面

- **FA1 比提案标题更大**：商品 ∧ succeeded 详情同时渲染 Dashboard 内嵌「标准化交付质检证书」整块（卡头/指标/指纹/导出按钮 `ProductPriceDashboard.tsx:135-146,165-235+,462-471`）与 UniversalManifestCard 同源整块（`:98-106,:78-95,:118-137,:139-150,:152-202`）——**面板级近乎整体双呈现**（指标/指纹也重复），UI-GATE 应按面板级收敛裁决。另注：既有 UI 合同 N9/N13/N15 是上批范围约束，FA1/FA2 必然触碰——UI-GATE 需明示「本批豁免/取代」。
- **FA2 事实基有误**：manifest 四条生成路径实核——cninfo/api 经 `createAndSaveDeliveryManifest`（data-governance 自动签发）；**rss 与 product 均手工构造**（`collector.ts:304-346`、`pipeline.ts:152-185`，仅用 data-governance 的类型与 SHA-256 原语）。「自动签发」对**两者**都不准确；四者共同为真的只有「遵循 data-governance 交付规范」。副标方向应落在「规范符合性」（如「交付清单遵循 data-governance 统一规范 · 全文件 SHA-256 防篡改」），且不与卡内「生成引擎」指标（逐任务真实 generator）矛盾。
- **view-desc**：`TaskList.tsx:55` 全站唯一渲染点；商品/RSS 直采不全真。主张成立，纯文案收敛。

### 6. firecrawl budget-gate 门面——核实成立

`budget-gate.ts:1` 全文即一行 re-export，非真实副本（使用面 3 处）。「记录澄清不改动」成立。顺带：`manifest.ts:1-3` 也是 re-export 门面（无需动作）。

### 7. 批次切分

七件全是微小项共用一条门禁，拆批收益低；「清台账收口」意义成立。执行序建议：先落 N5/N6/F1/F3/观察项（非 UI 五项），再过 UI-GATE 落 UI 三项——避免 UI 措辞循环阻塞。

## Top Kill-Assumptions

### R1 · F3「扩跳数或 getConfig 断言都能封死」——getConfig 封不死
- **Fails if**：实现期采信「补 getConfig 断言」而未动跳数——缺口原样存续，测试全绿。
- **Kill criterion**：删 `engine.ts:208` 的 `maxCostUsd: undefined`，N2 用例**必须红**；恢复后必须绿。
- **Cheapest test**：maxPages 100→200（1200 跳，秒级）；getConfig 仅可作导出 seam 后的补充。

### R2 · FA2「只修『对商品任务不准确』即可」——事实基漏 rss
- **Fails if**：新副标对 rss（`web-crawler/rss-collector`）或 product 仍不成立；或与「生成引擎」指标打架。
- **Kill criterion**：新副标逐字过四条生成路径真值表（cninfo/api 自动签发 vs rss/product 手工构造），任一不成立即打回。
- **Cheapest test**：UI-GATE 用例清单加一行「副标 vs 四路径真值表」，改文案时逐格打勾。

### R3 · F1「finally 补 q2.close() 即修」——只修一处会把偶发变更偶发
- **Fails if**：修复后 ENOTEMPTY 类红再现于其余两处；或 close 加在 rm 之后。
- **Kill criterion**：三处（`:186`、`:270`、`:241`）统一「finally 先 close 后 rm」，queue.test 连续 ≥20 轮无红；否则打回。
- **Cheapest test**：`for i in $(seq 20); do tsx --test test/queue.test.ts || break; done`；或直接改用 withQueue。

### R4 · mock:true 不豁免是正确语义吗（非阻塞，记录取舍再补测）
- **Fails if**：mock+残留 key 任务重启后批量误标 failed 的用户成本外显。
- **攻击**：mock:true 根本不消费 key，为「用不上的 key」否决整个任务是误伤；更自然是「丢弃脱敏 key 照常跑」。WC-AR-05 判据选「不豁免」但未记录取舍理由。
- **Kill criterion**：若决策层认可「mock 应豁免/丢 key」，断言方向反转。关键是先花一分钟把语义决策写下来。

### R5 · N5-3「提常量即消除静默失配」——只提一条不够，且测试改常量会反噬
- **Fails if**：只提一条常量；或 queue.test:293 改消费同一常量（「文案改动即测试失败」保护消失）。
- **Kill criterion**：（a）两条魔法字符串（`:62/:78`、`:73/:78`）都收敛或注释留痕声明只做一条；（b）queue.test:293 继续断言独立于常量的人类可见子串。
- **Cheapest test**：改一次常量文案跑 queue 测试——预期测试红（保护生效），反查仍命中（无静默失配）。

## What's Well-Reasoned

N5 三处全部属实且取的正是最小改动面；N6 四缺口全属实且判据对应真实代码路径；F1 根因正确（唯一并发写者 persist vs rm）；F3 数学精确（≈976 跳顶）；budget-gate 拒绝项干净；F2 维持已裁、N4 只注记——范围克制；基线 213 属实。

## What I Couldn't Assess

- WC-AR-05 N5/N6 与递延批评审观察项的原文不在仓内（仅转述）；若原文判据与转述有出入，R4/R5 取舍需回看原文。
- UI-GATE 最终收敛形态与文案口味（本评审只给真值约束与事实基）。
- F1 真实发生率（队列级 0/400 未复现；错误类别 127/200 已复现）。
- N4 复跑政策具体措辞与极端负载假红率。
- 提案约束节「N5/N3 观察项」标签疑为「N5 + 观察项」笔误，建议顺手改正。

## Verdict：GO-WITH-CONDITIONS

四条件（实现期一次性验证，均廉价）：

1. **C1（R1）**：F3 以**扩跳数为主**（maxPages 100→200 或 >1000 跳兄弟用例）；getConfig 仅在导出默认池构造 seam 后作补充。验收：删 `maxCostUsd: undefined` 必须红。
2. **C2（R2）**：FA2 事实基改为「product 与 rss 均不经自动签发，四类目共同点是使用 data-governance 交付规范/SHA-256 原语」；新副标过四路径真值表且不与「生成引擎」指标矛盾。
3. **C3（R3）**：F1 修三处清理路径（finally 先 close 后 rm），验收 queue.test 连续 ≥20 轮无红。
4. **C4（R5）**：N5-3 收敛两条魔法字符串（或注释留痕）；queue.test:293 保持独立文案断言。

非阻塞观察：R4 记录取舍理由再补测；`engine.ts:101` 不可达 throw 顺手清；UI 三项先落非 UI 五项再过 UI-GATE，UI-GATE 需明示对 N9/N13/N15 的取代关系。
