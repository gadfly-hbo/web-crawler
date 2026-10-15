# Red-Team: WC-AR-02 契约增量——在 TaskParams/SnapshotMetadata/DeliveryManifest 上加可选字段 + 兼容回归

> 红队执行方式：全新上下文只读子代理，按 strategy-red-team 技能方法论推演；主代理已逐条复核其承重事实（storage.ts:9/:88、port.ts:36-49、engine.ts:57、createAndSaveDeliveryManifest 调用方 grep）均属实。

**核查方式说明**：提案引用的仓库事实逐条只读核验（类型定义、调用方 grep、数据落盘样例、全量测试实跑），以下引用均带路径行号。

## 钢印论证（Steelman → Attack）

**Claim A「三个目标类型存在，落点正确」**
最强辩护：提案精确到文件路径，说明作者看过代码。核验：`apps/workbench/shared/task-params.ts:35`（`TaskParams`）、`packages/data-governance/src/storage.ts:5`（`SnapshotMetadata`）、`packages/data-governance/src/manifest.ts:23`（`DeliveryManifest`）全部存在。✅ 成立，不攻击。

**Claim B「只加可选字段即可兼容：旧 JSON 照常解析、verifyDeliveryPackage 照常校验、130 项测试保持全绿」**
最强辩护：这是全提案最硬的部分。`verifyDeliveryPackage`（`packages/data-governance/src/manifest.ts:181-216`）只做 `JSON.parse` + 遍历 `checksums`，多余字段天然忽略——含新字段的 manifest 必然照常校验。`validateTaskParams` 按 `sourceType` 分发（task-params.ts:57-72），多余字段同样天然忽略。130 项测试实跑核验：**130，全绿，fail 0**。✅ 成立。攻击失败——这条不产生 kill-assumption。

**Claim C「`backend?: string` 是必要的新字段（实际执行后端标识）」**
最强辩护：采纳文档（`docs/AGENT_REACH_ADOPTION.md:107`）评审通过了这个名字；且当前落盘快照里确实没有任何后端标识——`data/firecrawl-scraper/muw0tczx-ebzgbf/snapshots/*/metadata.json` 无 provider/backend 字段，缺口真实存在。
攻击钢印：**缺口是"数据没流到"，不是"类型没字段"**。`SnapshotMetadata` 已有 `provider?: string`（storage.ts:9），且 `saveSnapshot` 已持久化它：`provider: acquisition.provider || 'unknown'`（storage.ts:88）。数据缺失的真正原因在上一层——适配器返回的 `AcquisitionResult` 不携带 provider（`crawlers/firecrawl-scraper/src/port.ts:36-49` 无此字段），engine 原样透传（`crawlers/firecrawl-scraper/src/engine.ts:57`），所以落盘恒为 `unknown`。而"实际执行后端标识"在本仓库已有唯一定义点：`AcquisitionCapabilities.provider: 'firecrawl_cloud' | 'firecrawl_self_hosted' | 'mock_adapter'`（port.ts:52）——与提案给 backend 列的取值**一一相同**。engine 手里就有它（engine.ts:26-32）。加 `backend` = 同一接口两个字段承载恒等的信息。❌ 这是全提案最重的设计伤。

**Claim D「透传 API 倾向可选参数，三个既有调用方（firecrawl-scraper/cninfo/api-connector）零改动」**
最强辩护：`createAndSaveDeliveryManifest` 签名是 options 对象（manifest.ts:108-120），加可选参数确实是零破坏模式。
攻击钢印：**"三个调用方"是事实错误**。全仓 grep：`createAndSaveDeliveryManifest` 生产调用方只有 `crawlers/cninfo-reports/src/engine.ts` 和 `crawlers/api-connector/src/engine.ts`（+governance 自身测试）。firecrawl-scraper 根本不走这个构造器——它的 manifest 在 `crawlers/firecrawl-scraper/src/pipeline.ts:135-163` 手工构造对象字面量。而 `limitations`/`operations` 的填充语义恰恰全部落在 firecrawl 这条不走构造器的路径上。开放问题的 API 设计围绕着一个**不覆盖目标路径的构造器**展开。❌

**Claim E「填充语义可行：limitations 升格、operations 聚合」**
最强辩护：顺序成立——`pipeline.ts:91` 先产出含 `caveatsAndLimits` 的 report，manifest 构造在 135 行，就手可用；mock 产出里 caveats 恒非空 4 条（实测 4 个既有 `analysis_summary.json` 全部如此），验收"非空"无风险。
攻击钢印：`operations` 聚合依赖快照 metadata 里的 backend，但所有既有快照都没有该字段——**对旧任务目录重跑分析管线，operations 恒为空**。提案没定义"缺省"到底是 `undefined`（不写键）还是 `[]`（空数组），这会把二义性留给 RSS 消费方。⚠️ 中等。

**Claim F「SchemaVersion 加在 TaskParams 上很便宜」**
攻击（无需钢印，纯实现二义）：`TaskParams` 是三元联合（task-params.ts:35），其中两个成员来自**其他包的 domain 导出**（task-params.ts:2-16）。加字段要么改联合层（`(A|B|C) & {schemaVersion?: string}`），要么改每个成员（越权修改 api-connector/cninfo 的 domain 类型，违背"最小增量"）。提案未定策略。另外 `SnapshotMetadata` 现有字段**全部 snake_case**（snapshot_id/status_code/duration_ms…），拟新增的 `responseType` 是 camelCase；且旧快照 metadata 里还躺着一个现类型中不存在的遗留 `schema_version: "1.0"`——快照元数据的 JSON 面已有一轮未清理的演进痕迹，再混命名会更乱。⚠️ 低。

## Top Kill-Assumptions（按 影响 × 可能性 × 可测试性 排序）

| # | 失败模式 | 影响 | 可能性 | 测试成本 | 排序依据 |
|---|---|---|---|---|---|
| KA1 | backend 与 provider 冗余 | **高**（长期契约债） | **高** | ≈0（已完成） | 最优先 |
| KA2 | 调用方事实错误 / API 错位 | 中 | **已证伪** | ≈0（已完成） | 次优先 |
| KA3 | operations 缺省语义二义 | 中 | 中 | 低 | 本周定断言 |
| KA4 | TaskParams 联合挂载策略 | 低 | 中 | 低（tsc 兜底） | — |
| KA5 | 命名规范混用 | 低 | 高 | ≈0 | — |

### KA1：`backend` 字段与既有 `provider` 字段语义恒等

- **Claim**：`SnapshotMetadata` 需要新字段 `backend?: string` 承载"实际执行后端标识"。
- **Fails if**：同一接口中 `provider` 已承载完全相同的信息且取值恒等——则本包 1/3 的字段增量制造了双字段同义污染：未来消费方（RSS 管线、operations 聚合、人）必须任选其一或双读；旧快照两者皆无，新快照两者皆有且恒相等。
- **Evidence（已核验）**：storage.ts:9 + storage.ts:88（provider 字段存在且已持久化）；port.ts:52（provider 取值 = 提案给 backend 列的取值）；engine.ts:26-32（engine 手握 capabilities.provider）；落盘缺数据的根因是 `AcquisitionResult` 不带 provider（port.ts:36-49），修一行透传即可，无需新字段。
- **Kill criterion**：找不出任何一个"同一快照中 provider ≠ backend"的具体场景（本仓库现存代码或 WC-AR-04 RSS PoC 的具体需求），就不得加 backend——填充语义改为复用 provider。**经全仓核查：RSS 适配器同样会落在 `getCapabilities().provider = 'rss_local'` 槽位，不存在分叉场景。kill criterion 已满足。**
- **Cheapest test**：在 PRD 里回答一行："何时 provider 与 backend 取值不同？"若答不出具体场景（已核验：答不出），kill。

### KA2：透传 API 的"三个调用方"前提不成立

- **Claim**：`createAndSaveDeliveryManifest` 加可选参数，三个调用方零改动。
- **Fails if**：API 设计围绕构造器展开，而 limitations/operations 的目标路径（firecrawl 管线）不走构造器——PRD 按此倾向设计后，firecrawl 填充要另走字面量注入，该 API 决策白做一半；或被迫把 firecrawl 管线迁移到构造器（超出"最小增量"）。
- **Evidence（已核验）**：grep `createAndSaveDeliveryManifest` → 仅 `crawlers/cninfo-reports/src/engine.ts`、`crawlers/api-connector/src/engine.ts`、`packages/data-governance/test/governance.test.ts`；firecrawl 的 manifest 在 pipeline.ts:135 手工构造。**"三个调用方"已证伪（实为 2 个）**。
- **Kill criterion**：若 PRD 无法用单一机制同时覆盖"构造器调用方（2 个）+ 字面量构造方（firecrawl）"，该开放问题的倾向必须推翻重议。
- **Cheapest test**：`rg createAndSaveDeliveryManifest`（已完成）。

### KA3：`operations` 对旧数据恒空，缺省语义未定义

- **Claim**：operations 由管线从快照 backend 去重聚合，验收只要求 mock 新跑路径非空。
- **Fails if**：旧任务目录重跑分析管线时，operations 是 `undefined` 还是 `[]` 未定义——RSS 消费方（WC-AR-04）对两者的处理天然不同，二义性会原样传导。
- **Evidence to get**：一行决策 + 一条测试：对无 provider 的旧快照目录跑 pipeline，断言 manifest 中 operations 键不存在（或恒为 `[]`），二选一。
- **Kill criterion**：PRD 若写不出这条断言，验收标准 1 的"兼容回归"就不完整。

### KA4：`TaskParams` 联合类型的字段挂载层未定

- **Claim**：`schemaVersion?: string` 落在 `TaskParams` 上。
- **Fails if**：实现时直接修改 `api-connector/domain` 或 `cninfo-reports/domain` 的成员类型本体——跨包越权；或加在联合的单一成员上，导致类型窄化后字段丢失。
- **Evidence to get**：确定挂载策略并在 PRD 记录：`TaskParams = (A | B | C) & { schemaVersion?: string }`（仓库已有本地扩展先例：task-params.ts:20-22 的 `CninfoTaskParams`）。
- **Kill criterion**：若任何实现路径必须改动其他包的 domain 类型文件，该路径即被否决。

### KA5：`responseType` 命名混入全 snake_case 接口

- **Claim**：`SnapshotMetadata` 加 `responseType?: string`。
- **Fails if**：快照 metadata.json 里同时出现 `snapshot_id`/`status_code` 与 `responseType`——JSON 消费方面对混合命名。
- **Evidence to get**：PRD 一行决策：`response_type`（随接口现行规范）还是 `responseType`（随 manifest 的 camelCase），写明理由。
- **Kill criterion**：无（不 kill 工作包，只修正字段名；但必须在 PRD 冻结前定）。

## What's Well-Reasoned

- **兼容性核心论证是对的**：`verifyDeliveryPackage` 的实现方式使"含新字段照常校验"近乎恒真；130 项测试数字精确（实跑核验 130/130 绿）。
- **`limitations` 升格的时机与缺口描述准确**：pipeline.ts:91 的 report 先于 manifest 构造；mock 产出 caveats 恒非空；"限制声明只在 analysis_summary.json"的缺口确实存在。
- **三处克制决策质量高**：拒绝版本协商转换器、拒绝 ChannelCapability/OperationRun 平行对象、拒绝动任务状态机——边界划得干净。

## What I Couldn't Assess

- `toolVersion` 的未来填充来源（本包缺省不填）。
- WC-AR-04 RSS PoC 对 `truncated` 的写入时机。
- workbench web 前端是否存在对 TaskParams 的额外结构假设（只核了 server/shared 侧与 tasks.json 持久化面）。

---

## Verdict: **KILL**

KA1 的 kill criterion 已被满足：`SnapshotMetadata.provider` 已存在、已被持久化，取值集合与提案给 `backend` 定义的取值一一相同，不存在任何"provider ≠ backend"的场景（含 WC-AR-04 的 rss_local）。落盘缺后端标识的根因是 `AcquisitionResult` 不携带 provider，修一行透传即可，**不需要新字段**。

按原案实施会固化双字段同义的契约债。KILL 的范围是**提案第 2 条字段清单中的 `backend` 字段及依赖它的填充语义**，不是整个工作包；最小修订路径（复用 `provider`、修正调用方事实为 2 个、在 PRD 冻结 KA3/KA4/KA5 三个一行决策）之后，本包即可重新过审——其余部分的论证质量经攻击后依然成立。
