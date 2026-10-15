# Red-Team: WC-AR-02 rev2——可选字段增量 + provider 透传修复 + 兼容回归（首轮 KILL 后修订版）

> 红队执行方式：全新上下文只读子代理（explore），按 strategy-red-team 技能方法论执行；仅持有提案与技能文件路径，独立核验。

**核查方式**：提案引用的仓库事实逐条只读核验（类型定义、调用方 grep、落盘数据实测、全量测试实跑）；对照 `.flow/red-team.md` 首轮五个 KA 逐项验证消解情况。

## 逐条事实核验（rev2 引用的代码事实）

| rev2 引用 | 核验结果 | 证据 |
|---|---|---|
| `SnapshotMetadata.provider` 存在且已持久化 | ✅ | `packages/data-governance/src/storage.ts:9`（类型）、`:88`（`provider: acquisition.provider \|\| 'unknown'`） |
| `AcquisitionResult` 不携带 provider | ✅ | `crawlers/firecrawl-scraper/src/port.ts:36-49`，无 provider 字段 |
| provider 取值集合三值 | ✅ | `port.ts:52` `'firecrawl_cloud' \| 'firecrawl_self_hosted' \| 'mock_adapter'` |
| engine 原样透传 / 已持有 capabilities.provider | ✅ | `crawlers/firecrawl-scraper/src/engine.ts:57`（`saveSnapshot(result)`）、`:26`、`:31-32` |
| `TaskParams` 联合与本地扩展先例 | ✅ | `apps/workbench/shared/task-params.ts:35`、`:20-22`（`CninfoTaskParams` 交叉扩展先例） |
| 构造器生产调用方恰为 2 个 | ✅ | grep 全仓：`crawlers/cninfo-reports/src/engine.ts:335`、`crawlers/api-connector/src/engine.ts:372`（+governance 自身测试），无第三处 |
| firecrawl manifest 手工字面量 | ✅ | `crawlers/firecrawl-scraper/src/pipeline.ts:135-163` |
| `verifyDeliveryPackage` 忽略新增字段 | ✅ | `packages/data-governance/src/manifest.ts:194-207`，仅 `JSON.parse` + 遍历 `checksums` |
| analyzer 已产出 `caveatsAndLimits` 且恒非空 | ✅ | `crawlers/firecrawl-scraper/src/analyzer.ts:32`、`:158-163`（编译期常量数组，恒 4 条）；pipeline 中 report（`:91`）先于 manifest 构造（`:135`） |
| firecrawl 的 storage/manifest 是 re-export、单一事实源 | ✅ | `crawlers/firecrawl-scraper/src/storage.ts:1`、`src/manifest.ts:3` 均 `export * from 'data-governance/…'` |
| 采纳文档 §5 已同步 rev2 | ✅ | `docs/AGENT_REACH_ADOPTION.md:100-113`（含 v1.1 修订说明，与提案逐条一致） |
| 基线 130 项测试全绿 | ✅ 实跑 | `pnpm test`：data-governance 4 + firecrawl-scraper 22 + api-connector 16 + cninfo-reports 13 + workbench 75 = **130/130 通过，0 失败** |

**首轮五个 KA 的消解核验**：KA1（backend 冗余）→ 已取消字段，填充语义全部改挂 provider ✅；KA2（调用方事实）→ 修正为 2 个并给出双路径机制 ✅；KA3（缺省二义）→ 已冻结“键不存在，不写 `[]`” ✅（但见下方攻击 2 的残余缝隙）；KA4（联合挂载）→ 已定 `(A|B|C) & { schemaVersion?: string }` 并引先例 ✅；KA5（命名）→ 已定 per-host 规范：metadata 随 snake_case（`response_type`），manifest 随 camelCase（`limitations`/`operations`/`toolVersion`），TaskParams 随 camelCase（`schemaVersion`）——与三个宿主接口现行命名逐一比对均一致 ✅。

## Steelman → Attack

**Claim 1「engine 并入 `capabilities.provider` 一行级修复即可，无需新字段」**
最强辩护：engine 是三个适配器唯一的汇聚点（`engine.ts:26` 每轮 `run()` 取一次 capabilities），`saveSnapshot` 的入参类型已含 `provider?: string`（storage.ts:42），且全仓 `saveSnapshot` 生产调用点仅 `engine.ts:57` 一处——单点修复即全覆盖；`{...result, provider: capabilities.provider}` 无 excess-property 问题（spread 属性不触发检查，`provider` 显式写入且在目标类型中），可编译。
攻击：找第二个快照写入路径绕过 engine——grep 证伪（其余仅为两个测试文件）。找会碰翻的既有断言——grep 全部测试，无任何断言落盘 provider 为 `unknown`（`governance.test.ts:100` 显式传 `provider: 'mock'`）。**攻击失败，修复方案成立。**

**Claim 2「operations 缺省语义已冻结：旧快照无 provider 时键不存在」**
最强辩护：现有 29 个落盘 `metadata.json` 实测 **0 个含 provider 键**，“键不存在”规则与现存数据精确吻合，验收标准 2 可直接用现存任务目录实跑。
攻击钢印：**“无 provider”在两种形态之间二义——键缺失 vs 值为 `"unknown"` 字符串**。`storage.ts:88` 的兜底意味着：从现在到本包落地之间，任何一次 web-scraper 任务运行都会写下显式 `"provider": "unknown"` 的快照。若聚合只判键存在性，这些快照会产出 `operations: [{ backend: "unknown" }]` 垃圾条目并传导给 WC-AR-04 消费方。rev2 冻结文本只覆盖了键缺失形态，未裁决 `"unknown"` 字符串算不算“无 provider”。⚠️ 这是 rev2 唯一实质残余缝隙（影响中低、可能性中——本仓库 10 月 6 日仍有 4 个新任务目录在产生、测试成本≈0）。

**Claim 3「TaskParams 联合层挂载安全」**
最强辩护：`task-params.ts:20-22` 的 `CninfoTaskParams` 就是“本地交叉扩展外来 domain 类型”的仓库先例，同一模式。TS 对 `(A|B|C) & X` 交叉分布后判别式窄化不受影响。
攻击（含额外核查的 web 前端面）：逐一检查 `apps/workbench/web/`——`views/new-task/reducer.ts:79-137` 构造成员字面量（可选字段无需改动）、`views/NewTask.tsx:27-43` 走共享校验器（allow-list 式，`crawlers/api-connector/src/domain/validation.ts:5` 等均不拒绝多余键）、`api.ts:26` 纯透传、`App.tsx:383-420` 仅按 `sourceType` 判别窄化、`views/new-task/types.ts:83` 的 `Omit<ApiConnectorParams, 'sourceType'>` 作用在成员类型上与联合层无关。未发现任何按键枚举/keyof 驱型的结构假设。**攻击失败——提案开放问题 2 可以关闭：前端无额外假设。**

**Claim 4「2 个构造器调用方零改动 + firecrawl 字面量直接赋值」**
最强辩护：`createAndSaveDeliveryManifest` 是 options 对象签名（manifest.ts:108-120），加可选参数零破坏；`DeliveryManifest` 两字段全 optional，pipeline 字面量直接赋值即生效；`verifyDeliveryPackage` 与 workbench 的 manifest 消费（`apps/workbench/test/evidence-api.test.ts:124` 自建 fixture）对新增字段天然忽略。**攻击失败。**

**Claim 5「旧 JSON 照常解析、130 项保持全绿」**：实跑 130/130 ✅；三类校验器均不拒绝多余键。攻击失败。

**Claim 6「limitations 升格」**：caveats 是 analyzer 内编译期常量（恒 4 条），report 在 manifest 构造前已就手——验收“非空”恒真。攻击失败。

## Top Kill-Assumptions（残余，按 影响 × 可能性 × 可测试性 排序）

| # | 失败模式 | 影响 | 可能性 | 测试成本 |
|---|---|---|---|---|
| KA-r1 | operations 聚合把修复落地前写入的 `provider: "unknown"` 当真实 backend | 中低（垃圾条目传导 WC-AR-04） | 中（现在到落地之间任何一次任务运行即触发） | ≈0 |

- **Claim**：operations 缺省语义已完备冻结。
- **Fails if**：聚合实现只判键缺失——则值形态 `"unknown"`（storage.ts:88 兜底产物）产出 `operations: [{ backend: "unknown" }]`，与冻结意图矛盾且无测试拦截。
- **Evidence to get this week**：跑一次现版 web-scraper mock 任务并查看新快照 `metadata.json`（将看到显式 `"provider": "unknown"`，与现存 29 个无键旧快照形成两形态对照）。
- **Kill criterion**：PRD 若补不出一行裁决——“`'unknown'` 视同无 provider（聚合白名单三值）或说明其为何是合法 backend”——则验收标准 2 的重跑断言不完整。
- **Cheapest test**：pipeline 测试加一个 fixture：`metadata.json` 含 `"provider": "unknown"`，断言 manifest 无 operations 键。

次要备注（不构成 KA）：① “取值集合覆盖未来 `rss_local`”是语义层主张——`rss_local` 并不在 `port.ts:52` 的联合类型里，WC-AR-04 落地时仍需扩类型（超出本包范围，提案亦如此声明，非错误）；② `operations[].backend` 复用了被 KILL 掉的字段名，但属不同类型、取值来源明确为 provider，建议 PRD 一行注明“`operations[].backend` 取值 = `SnapshotMetadata.provider`”防未来误读；③ “落盘快照恒 unknown”措辞略不精确——现存 29 个快照实为**无键**，`'unknown'` 是当前代码对**新写入**的行为；因果链本身无误。

## What's Well-Reasoned

- **首轮 KILL 的最小修订路径被忠实执行**：五项裁决（backend 取消、调用方改 2、缺省冻结、联合挂载定策、命名定策）全部落实且与 `docs/AGENT_REACH_ADOPTION.md:100-113` 同步，无残留旧文本。
- **provider 透传修复方案经攻击后完全成立**：单点（engine.ts:57 是唯一生产写入路径）、单行、无既有断言冲突、mock 适配器 `provider: 'mock_adapter'`（mock-adapter.ts:25）使验收断言可直接落地。
- **兼容性论证依然是最硬的部分**：`verifyDeliveryPackage` 的实现方式使“含新字段照常校验”近乎恒真；三类校验器均 allow-list 式；130/130 基线实跑复核无误。
- **命名决策逐接口比对全部一致**：metadata snake_case、manifest camelCase、TaskParams camelCase，各自匹配宿主现行规范——KA5 的修正质量高。
- **开放问题 2（web 前端）可关闭**：前端五个使用点逐一核验，联合层交叉不破坏任何一处类型使用。

## What I Couldn't Assess

- `toolVersion` 的未来填充来源（提案明确本包缺省不填，与首轮相同的遗留开放项）。
- WC-AR-04 RSS 对 `truncated` 的写入时机与 `response_type` 的取值收敛（同为后续包）。
- `pnpm typecheck && pnpm build`（验收标准 3 的另两门）本轮未实跑——指令范围仅 `pnpm test`；130/130 为测试基线，类型/构建门禁需实现时自行验证。

---

## Verdict: **GO**

首轮三条 KILL 级问题（backend 与 provider 语义恒等、调用方事实错误、三个一行决策未冻结）在 rev2 中全部真实消解，且经只读核验无一处事实错误、未发现新引入的承重假设错误。唯一残余缝隙 KA-r1（`"unknown"` 字符串 vs 键缺失的二义）是 PRD 一行裁决 + 一条测试即可封堵的缺口，不满足任何 kill criterion。执行条件：在 PRD 冻结前补上 KA-r1 的裁决（建议聚合按已知 provider 白名单三值收敛，`'unknown'`/缺失一律不产生 operations 条目）。
