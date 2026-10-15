# PRD: WC-AR-02 契约增量 rev2——可选字段 + provider 透传修复 + 兼容回归

> 规格源：`.flow/proposal.md`（rev2）＞ 本 PRD。红队：`.flow/red-team.md`（verdict GO，执行条件 KA-r1 已在本 PRD §实现决策 7 裁决）。无 issue tracker（docs/agents/issue-tracker.md 不存在），按 dev-flow 降级规则落盘本文件。

## Problem Statement

为承接新增公开只读渠道（WC-AR-04 RSS PoC），治理链的契约面缺少三类信息：任务参数无版本标识、快照元数据无内容形态/截断标记、交付 manifest 无限制声明与操作审计。同时快照落盘的 `provider` 恒为 `"unknown"`（或旧快照无键）——`AcquisitionResult` 不携带 provider，engine 原样透传，导致未来 `operations` 聚合无米下锅。本轮以最小增量补齐契约并修复透传缺口，同时保证全部既有数据与 130 项测试零破坏。

## Solution

在三个既有类型上只加可选字段（不建平行对象、不引入版本协商机制），并做两处最小填充：engine 快照写入前并入 `capabilities.provider`；firecrawl 分析管线把 analyzer 的 caveats 升格进 manifest 的 `limitations`，并从快照 `provider` 聚合 `operations`（白名单收敛）。兼容性由"可选字段 + allow-list 校验器 + checksum 遍历式 verify"天然保证，另加显式回归测试固化。

## User Stories

1. As a 渠道接入者（WC-AR-04 作者），I want `SnapshotMetadata` 带可选 `response_type`/`truncated`，so that RSS 渠道落地时可声明内容形态与截断，无需再改类型。
2. As a 渠道接入者，I want 快照落盘的 `provider` 反映真实适配器标识（如 `mock_adapter`），so that manifest 的 `operations` 聚合有真实数据来源。
3. As a 数据消费方，I want manifest 携带 `limitations`（来自 analyzer caveats），so that 限制声明不再只埋在 analysis_summary.json 里。
4. As a 数据消费方，I want manifest 携带 `operations`（去重后的 backend 列表），so that 无需遍历快照即可知道本次交付经过哪些后端。
5. As a 数据消费方，I want 旧快照（无 provider 键或 provider 为 `"unknown"`）重跑管线时 manifest 不出现 `operations` 键，so that 我不会把 `"unknown"` 当成真实后端。
6. As a 任务发起方，I want `TaskParams` 带可选 `schemaVersion`，so that 未来契约演进时新旧任务可区分，且旧任务不写该字段也照常校验通过。
7. As a 维护者，I want 全部增量为可选字段且既有 130 项测试保持全绿，so that 本次变更对主线零风险。
8. As a 维护者，I want 含新字段的 manifest 照常通过 `verifyDeliveryPackage` 校验，so that 防篡改核验不因契约扩展而失效。
9. As a 维护者，I want 旧格式 JSON（任务/快照/manifest）解析行为不变，so that 存量任务目录永远可读。

## Implementation Decisions

1. **TaskParams 联合层挂 `schemaVersion?: string`**：`TaskParams = (CninfoTaskParams | ApiConnectorTaskParams | WebScraperTaskParams) & { schemaVersion?: string }`，不动 api-connector/cninfo 的 domain 类型本体（先例：同文件 `CninfoTaskParams` 本地交叉扩展）。校验强度冻结：`validateTaskParams` 对 `schemaVersion` 放行任意非空字符串，未知值不拒绝；缺省（不写）合法。
2. **SnapshotMetadata 加 `response_type?: string` 与 `truncated?: boolean`**：命名随接口现行 snake_case；本包只加类型，不强制填充（序列化天然跳过 undefined）。
3. **不加 `backend` 字段**（红队 KILL 后冻结）：`provider` 承载后端标识。
4. **provider 透传修复**：firecrawl engine 在调用 `saveSnapshot` 前把 `capabilities.provider` 并入采集结果（唯一生产写入点）；mock 适配器 `provider: 'mock_adapter'` 使断言可直接落地。
5. **DeliveryManifest 加 `limitations?: string[]` 与 `operations?: { backend: string; toolVersion?: string }[]`**：命名随 manifest 现行 camelCase；`operations[].backend` 取值 = `SnapshotMetadata.provider`（仅复用字段名，语义来源是 provider）。
6. **双路径填充机制**：`createAndSaveDeliveryManifest` 增加可选参数（`limitations`、`operations`），2 个生产调用方（cninfo、api-connector engine）零改动继续工作；firecrawl 管线的 manifest 字面量构造路径直接赋值这两个字段。
7. **operations 聚合与缺省语义（红队 KA-r1 裁决）**：管线从本次任务全部快照 metadata 的 `provider` 去重聚合；**按已知 provider 白名单（`firecrawl_cloud`/`firecrawl_self_hosted`/`mock_adapter`）收敛——键缺失或值为 `"unknown"`（或任何非白名单值）的快照一律不产生 operations 条目**；聚合结果为空时 manifest 中 `operations` 键不存在（不写 `[]`）。`limitations` 同理：无 caveats 时键不存在。
8. **不做的事**：不引入 schema_version 协商/转换器；不建 ChannelCapability/OperationRun 平行类型；不动任务状态机；`SourceType = 'rss'` 不在本包；`toolVersion` 缺省不填；`response_type`/`truncated` 本包不强制填充。

## Testing Decisions

好测试标准：只测外部可观察行为（落盘 JSON 内容、函数返回、校验通过/拒绝），不耦合内部实现；沿用各包既有测试风格（node:test + assert，临时目录 fixture）。

- **data-governance 单测扩展**（`packages/data-governance/test/governance.test.ts`，兼容性测试归属此文件——裁决自提案开放问题 1：新字段的类型与序列化是 governance 的职责，消费方行为断言放各消费方既有测试文件）：
  - 旧 manifest JSON（无新字段）照常解析、照常通过 `verifyDeliveryPackage`；
  - 含 `limitations`/`operations` 的 manifest 可构造、可持久化、可读回、可通过 verify；
  - `createAndSaveDeliveryManifest` 不传新参数行为不变（2 调用方零改动的回归保证）。
- **firecrawl engine 测试**：mock 采集路径落盘快照 metadata 含 `provider: "mock_adapter"`。
- **firecrawl pipeline 测试**：产出 manifest 含非空 `limitations`（来自 caveats）与 `operations: [{ backend: "mock_adapter" }]`；fixture 快照无 provider 键 → 无 `operations` 键；fixture 快照 `provider: "unknown"` → 无 `operations` 键（KA-r1 封堵用例）。
- **workbench task-params 测试**：`schemaVersion` 缺省/任意非空字符串/未知值均通过校验；旧任务 JSON 无该字段照常校验。

Prior art：`governance.test.ts` 的临时目录 + 落盘读回模式；firecrawl `engine.test.ts`/`pipeline.test.ts` 的 mock 适配器端到端模式；workbench 校验器单测。

## Out of Scope

- RSS 渠道本身（WC-AR-04）、`SourceType = 'rss'` 扩展、RSS 校验/spawn 分支。
- runner 超时/进程树/出口门禁/凭据治理（WC-AR-05）。
- `response_type`/`truncated` 的实际填充时机与取值收敛（WC-AR-04）。
- DatasetVersion 机制、AnalysisRun、版本协商转换器。
- 旧快照遗留 `schema_version: "1.0"` 键的清理（知晓存在，本包不动）。

## Further Notes

- 红队次要备注：① `rss_local` 不在当前 provider 联合类型内，WC-AR-04 落地时扩类型；② 现存 29 个落盘快照实为**无 provider 键**，`'unknown'` 是当前代码对**新写入**的兜底行为——两种形态都由决策 7 的白名单收敛覆盖。
- 验收标准（同提案）：兼容回归全绿 + 上述填充断言 + `pnpm test && pnpm typecheck && pnpm build` 全绿。

---

## PRD diff gate 记录（auto 模式）

相对 proposal.md 的 diff（全部纯增量，无改变/丢弃提案决策，自批准）：

1. KA-r1 裁决：operations 聚合按 provider 白名单三值收敛，`"unknown"`/键缺失/非白名单值一律不产生条目——对提案冻结的"键不存在"语义补齐值形态分支（红队 GO 的执行条件，属细化非变更）。
2. 兼容性测试归属裁决：governance 类型/序列化测试放 `governance.test.ts`，消费方行为断言放各消费方既有测试文件（关闭提案开放问题 1）。
3. 关闭提案开放问题 2：红队核验 web 前端五处 TaskParams 使用点无额外结构假设。
4. 补充：`limitations` 无 caveats 时键不存在；`operations[].backend` 取值注明 = `SnapshotMetadata.provider`。

---

## GRILL 决议附录

### Round 1（author-blind 子代理，8 个问题包，主代理逐条核验证据后全部采用推荐答案）

1. **Q1 `saveSnapshot` 写入通路**：`acquisition` 参数加可选 `response_type`/`truncated` 对应入口，构造 metadata 时带入——"不强制填充"不变，验收标准 1 的"可持久化并可读回"经真实写入者执行。（证据：storage.ts:38-48 参数面、:84-96 字面量构造）
2. **Q2 `schemaVersion` 校验落点**：在 workbench `validateTaskParams` 分发前加共享检查——字段存在时必须为 trim 后非空 string，否则 push 中文错误（风格随 task-params.ts:39-52）；缺省/任意非空/未知值放行；补空串与非字符串两个拒绝用例。
3. **Q3 provider 白名单宿主**：firecrawl pipeline.ts 导出 `KNOWN_OPERATION_BACKENDS: ReadonlySet<AcquisitionCapabilities['provider']>`，类型锚定 port.ts 联合；data-governance 保持渠道无关，白名单不进治理包。
4. **Q4 operations 计入边界**：凡可读到 metadata 且 provider 过白名单即计入，与该快照是否产出 record 无关（operations 是交付溯源口径，与 sourceSummary.succeeded 是两套事实口径）；metadata 解析失败的快照沿现状静默跳过。
5. **Q5 空数组归一化**：`createAndSaveDeliveryManifest` 内部 `limitations?.length ? limitations : undefined`（operations 同理）——"空→键不存在"不变量收进单一执行点；归一化不做白名单过滤。
6. **Q6 pipeline 测试新建**：`pipeline.test.ts` 此前不存在，新建；`provider: 'mock_adapter'` 与 `'unknown'` fixture 用 `saveSnapshot` 构造，key-absent fixture 手写 metadata.json 并注释缘由；正常路径走 MockAcquisitionAdapter + engine 端到端（先例 engine.test.ts:10-58）。**PRD Testing Decisions 的"prior art: pipeline.test.ts"表述修正为"新建，prior art 为 engine.test.ts 端到端模式"。**
7. **Q7 schemaVersion 无生产者**：本包零写入者，字段纯预留（与提案"不改主线行为"一致）；验收明确"本包不产生带 schemaVersion 的任务"。
8. **Q8 前端不展示**：本包不含 UI 改动，`DeliveryManifestInfo` 子集接口不动；展示随 WC-AR-04 一并设计。PRD Out of Scope 补充"前端展示不在本包"（同时确认本流程无用户可见 UI，UI-GATE 不适用）。

### Round 2（主代理，挖掘 round 1 写入的细节，2 个问题包）

1. **R2-Q1 `saveSnapshot` 新参数命名**：API 参数层随现有 camelCase（`responseType?: string`、`truncated?: boolean`，同 targetUrl/statusCode 先例），落盘映射为 snake_case（同 targetUrl→target_url 既有映射模式）。
2. **R2-Q2 operations 输出顺序**：按 `KNOWN_OPERATION_BACKENDS` 白名单声明顺序输出（确定性，不受 readdir 顺序影响），去重后每个 backend 至多一条。

Round 2 之后再无新增开放问题（预算 2 轮用完），GRILL 收敛。
