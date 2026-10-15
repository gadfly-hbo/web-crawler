# WC-AR-02 任务切片（tasks.md）

> 来源：`.flow/prd.md`（含 GRILL 决议附录）。Tracer-bullet 垂直切片，每片端到端可验证。无 issue tracker，按 dev-flow 降级规则落盘本文件。切片自批准（auto 模式），批准理由见 state.json history。

## 清单

- [x] 1. data-governance 契约扩展：SnapshotMetadata/DeliveryManifest 可选字段 + 写入通路 + 归一化 + 兼容回归 —— 证据：`pnpm --filter data-governance test` 7/7 通过（含 3 个新用例：新字段持久化读回、manifest 新字段校验通过、空数组归一化键不存在），2026-10-15
- [x] 2. provider 透传修复：firecrawl engine 快照落盘真实 provider —— 证据：engine.ts:57 并入 capabilities.provider；`pnpm --filter firecrawl-scraper test` 23/23 通过（新增用例断言落盘 metadata.provider === 'mock_adapter'），2026-10-15
- [x] 3. firecrawl pipeline 填充：limitations 升格 + operations 白名单聚合 + 新建 pipeline.test.ts —— 证据：`pnpm --filter firecrawl-scraper test` 26/26 通过（新建 pipeline.test.ts 3 用例：端到端 limitations+operations、unknown 无键、旧快照无 provider 键无 operations），2026-10-15
- [x] 4. TaskParams schemaVersion：联合层挂载 + 共享校验 + 测试 —— 证据：`pnpm --filter workbench test` 76/76 通过（新增用例：缺省/任意非空/未知值放行，空串/非字符串拒绝），2026-10-15

---

## 1. data-governance 契约扩展

**Blocked by**: None - can start immediately
**User stories covered**: 1（类型面）、3、4、7、8、9

### What to build

`SnapshotMetadata` 增加可选 `response_type?: string` 与 `truncated?: boolean`；`saveSnapshot` 的 `acquisition` 参数增加对应可选入口（API 层 camelCase `responseType`/`truncated`，落盘映射 snake_case，同 targetUrl→target_url 先例），缺省行为零变化。`DeliveryManifest` 增加可选 `limitations?: string[]` 与 `operations?: { backend: string; toolVersion?: string }[]`；`createAndSaveDeliveryManifest` 增加同名可选参数，内部做空数组归一化（`limitations?.length ? limitations : undefined`，operations 同理），不做任何白名单过滤（治理包渠道无关）。兼容性回归：旧 JSON 无新字段照常解析与校验；含新字段的 manifest 可构造、持久化、读回、通过 `verifyDeliveryPackage`；不传新参数行为不变。

### Acceptance criteria

- [ ] 类型与参数落地，`response_type`/`truncated` 经 `saveSnapshot` 真实写入并可读回（显式测试）
- [ ] 旧格式 manifest JSON（无新字段）照常解析、照常通过 verify
- [ ] 含 `limitations`/`operations` 的 manifest 通过 `verifyDeliveryPackage`
- [ ] 空数组归一化为键不存在的测试（limitations/operations 各一）
- [ ] 既有 governance 测试保持全绿

## 2. provider 透传修复

**Blocked by**: None - can start immediately
**User stories covered**: 2

### What to build

firecrawl engine 在调用 `saveSnapshot` 前把 `capabilities.provider` 并入采集结果（唯一生产写入点），使落盘快照 metadata 的 `provider` 反映真实适配器标识。

### Acceptance criteria

- [ ] mock 采集路径落盘快照 metadata 含 `provider: "mock_adapter"`（显式断言）
- [ ] 既有 firecrawl 测试保持全绿

## 3. firecrawl pipeline 填充

**Blocked by**: 1、2
**User stories covered**: 3、4、5

### What to build

pipeline 导出 `KNOWN_OPERATION_BACKENDS: ReadonlySet<AcquisitionCapabilities['provider']>`（白名单三值，类型锚定 port 联合）；在既有快照遍历循环中收集各快照 `meta.provider`，按白名单过滤、去重、按白名单声明顺序输出为 `operations`（凡可读 metadata 且 provider 过白名单即计入，与是否产出 record 无关）；把 analyzer report 的 `caveatsAndLimits` 升格为 manifest 的 `limitations`；两者为空时键不存在。新建 `test/pipeline.test.ts`：`mock_adapter` 与 `'unknown'` fixture 用 `saveSnapshot` 构造，key-absent fixture 手写 metadata.json 并注释缘由，正常路径走 MockAcquisitionAdapter + engine 端到端。

### Acceptance criteria

- [ ] 端到端（mock）：manifest 含非空 `limitations`（来自 caveats）与 `operations: [{ backend: "mock_adapter" }]`
- [ ] fixture 快照 `provider: "unknown"` → manifest 无 `operations` 键（KA-r1 封堵）
- [ ] fixture 快照无 provider 键（手写 metadata.json）→ manifest 无 `operations` 键
- [ ] 既有 firecrawl 测试保持全绿

## 4. TaskParams schemaVersion

**Blocked by**: None - can start immediately
**User stories covered**: 6、7、9

### What to build

`TaskParams` 改为 `(CninfoTaskParams | ApiConnectorParams | WebScraperParams) & { schemaVersion?: string }`（联合层挂载，不动 domain 包类型）。`validateTaskParams` 分发前加共享检查：字段存在时必须为 trim 后非空 string，否则 push 中文错误（风格随现有校验消息）；缺省/任意非空/未知值放行。本包零生产者——不产生带 schemaVersion 的任务。

### Acceptance criteria

- [ ] 缺省、任意非空字符串、未知值均通过校验（显式测试）
- [ ] 空串与非字符串被拒绝（两个拒绝用例）
- [ ] 既有 workbench 测试保持全绿，typecheck 通过（前端使用点不受影响）

---

## 依赖与顺序

T1 ∥ T2 ∥ T4 可并行，T3 依赖 T1+T2。执行顺序：1 → 2 → 3 → 4。
