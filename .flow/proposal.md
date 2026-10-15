# WC-AR-02 契约增量（rev2）：可选字段 + provider 透传修复 + 兼容回归（proposal）

> 规格来源：《Agent-Reach 能力吸收采纳评审与融合方案 v1.1》（docs/AGENT_REACH_ADOPTION.md §5，红队后修订版）。rev2 相对 rev1 的变化：首轮 dev-flow 红队判定 KILL（`.flow/red-team.md`，backend 与既有 provider 语义恒等），本版按红队最小修订路径重写字段清单与填充语义，并已同步修订采纳文档 §5。

## 背景与定位

Agent-Reach 采纳评审决定：为承接新增公开只读渠道（WC-AR-04 RSS PoC），先行在**既有类型**上做最小契约增量。本工作包是纯增量准备，不实现 RSS，不改主线行为，不动任务状态机。

## 已定决策（约束，不可被后续阶段推翻）

1. **只加可选字段，全部落在既有类型上**；不新建平行对象——报告 §7.3 的 `ChannelCapability`/`OperationRun` 独立存储明确不建，运行审计继续以任务日志 NDJSON + manifest 为准。
2. **不加 `backend` 新字段**（红队 kill 后冻结）：`SnapshotMetadata.provider`（`packages/data-governance/src/storage.ts:9`）已承载"实际执行后端标识"且已持久化（storage.ts:88 `provider: acquisition.provider || 'unknown'`），取值集合 `firecrawl_cloud`/`firecrawl_self_hosted`/`mock_adapter`（`crawlers/firecrawl-scraper/src/port.ts:52`）覆盖未来 `rss_local`，无分叉场景。
3. **字段清单（全部 optional）**：
   - `apps/workbench/shared/task-params.ts` 的 `TaskParams`：`schemaVersion?: string`，**挂载在联合层** `(A|B|C) & { schemaVersion?: string }`（task-params.ts:35），不动 api-connector/cninfo 的 domain 类型本体（本地扩展先例：同文件 `CninfoTaskParams`，task-params.ts:20-22）；
   - `packages/data-governance/src/storage.ts` 的 `SnapshotMetadata`：`response_type?: string`（内容文件形态，如 `markdown`/`feed_xml`）、`truncated?: boolean`——**命名随接口现行 snake_case**，不用 camelCase；
   - `packages/data-governance/src/manifest.ts` 的 `DeliveryManifest`：`limitations?: string[]`、`operations?: { backend: string; toolVersion?: string }[]`。
4. **provider 透传修复（本包内）**：落盘快照恒 `provider: "unknown"` 的根因是 `AcquisitionResult` 不携带 provider（port.ts:36-49），engine 原样透传（`crawlers/firecrawl-scraper/src/engine.ts:57` `saveSnapshot(result)`）。engine 已持有 `capabilities.provider`（engine.ts:26-32），修复方式：engine 在调用 `saveSnapshot` 前把 `capabilities.provider` 并入结果（一行级改动）+ 测试断言 mock 路径落盘 `mock_adapter`。
5. **兼容性硬约束**：无新字段的旧 JSON 照常解析（旧任务/旧快照/旧 manifest 零破坏）；`verifyDeliveryPackage` 对含新字段的 manifest 照常校验；既有 130 项测试保持全绿。
6. **不引入版本协商机制**：`schemaVersion` 校验强度已冻结——放行任意非空字符串，未知值不拒绝；旧任务不写 schemaVersion 也不要求写入。
7. **`SourceType = 'rss'` 与 RSS 校验/spawn 分支不在本包**（属 WC-AR-04）。
8. **填充语义（本包内落地的最小集）**：
   - `limitations`：firecrawl-scraper 分析管线把 analyzer 已产出的 `caveatsAndLimits` 升格写入 manifest（解决"限制声明只在 analysis_summary.json、manifest 本体缺失"的既有缺口）；
   - `operations`：由管线从快照元数据的 `provider` 去重聚合，`toolVersion` 缺省不填；**缺省语义已冻结：旧快照无 provider 时 manifest 中 `operations` 键不存在，不写 `[]`**；
   - `response_type`/`truncated`：本包只加类型，不强制填充（RSS 渠道落地时使用）。
9. **透传机制（红队事实修正后冻结）**：`createAndSaveDeliveryManifest` 生产调用方为 **2 个**（`crawlers/cninfo-reports/src/engine.ts:335`、`crawlers/api-connector/src/engine.ts:372`）；firecrawl 的 manifest 在 `crawlers/firecrawl-scraper/src/pipeline.ts:135-163` 手工构造字面量。机制：`DeliveryManifest` 加可选字段 + `createAndSaveDeliveryManifest` 加可选参数（2 个构造器调用方零改动），firecrawl 字面量路径直接赋值。

## 被拒绝的替代方案（记录，不再复议）

- `backend` 新字段——与 `provider` 语义恒等，红队 kill criterion 已满足（red-team.md KA1）。
- schema_version 版本协商/转换器机制——过早引入，仓库尚无多版本并存。
- 新建 ChannelCapability/OperationRun 类型与存储——等出现第二个同构渠道再评估抽象。
- 扩展任务状态机或加审批态——本地单用户无审批角色。

## 验收标准

1. 兼容回归：旧格式 JSON 解析、manifest 校验、任务参数校验的既有测试全部保持通过；新增"旧 JSON 无新字段照常、新字段存在可持久化并可读回"的显式测试。
2. 填充验证：mock 采集路径产出的快照 metadata 含 `provider: "mock_adapter"`；分析管线产出的 manifest 含 `limitations`（非空，来自 caveats）与 `operations`（含 mock backend）；对无 provider 的旧快照目录重跑管线，manifest 中 `operations` 键不存在。
3. 全量门禁：`pnpm test && pnpm typecheck && pnpm build` 全绿。

## 开放问题（留给 PRD/GRILL）

- 兼容性测试的归属文件：data-governance 单测扩展 vs 各消费方测试文件内加用例。
- workbench web 前端是否存在对 TaskParams 的额外结构假设（首轮红队未核，只核了 server/shared 侧与 tasks.json 持久化面）。
