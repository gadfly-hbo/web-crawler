# PRD: 全仓统一数据治理底座与多爬虫统一接入

## 1. 业务目标
将全仓所有数据采集通道（公开网页抓取、巨潮财报下载、第三方 API 连接器）统一纳入工业级严肃数据资产治理标准：
所有爬虫产出的数据包均具备：①不可变原始快照、②字段级证据溯源（可选/按需）、③在途预算门禁防护、④全文件 SHA-256 签名的 DeliveryManifest 交付清单。

## 2. 功能范围与验收标准

### 2.1 独立共享包 `packages/data-governance`
- [x] 提供四个独立核心导出：
  - `./evidence` (`FieldEvidence`, `locateSnippet`, `EvidenceIndexStore`)
  - `./manifest` (`DeliveryManifest`, `computeFileSha256`, `verifyDeliveryPackage`, `calculateQualityMetrics`)
  - `./budget` (`BudgetGate`, `BudgetExceededError`)
  - `./storage` (`SnapshotStorage`, `SnapshotMetadata`)
- [x] 拥有独立的单元测试套件与类型定义。

### 2.2 全仓爬虫统一接入统一底座
- [x] **`firecrawl-scraper`**：切到引用 `data-governance`，内部保留兼容重导出，现有 22 个测试全绿。
- [x] **`cninfo-reports`**：接入 `data-governance`，任务结束时自动对下载的 PDF 报告与公告计算哈希，生成标准 `manifest.json` 与 `quality_report.json`。
- [x] **`api-connector`**：接入 `data-governance`，提供请求预算防护（`BudgetGate`）并在完成后生成标准 `manifest.json`。

### 2.3 工作台通用交付体验
- [x] 在 `apps/workbench` 中，对所有产生 `manifest.json` 的任务提供统一的「📦 导出标准化交付包 (ZIP)」操作和「🛡️ 交付资产质检与防篡改指纹」通用卡片。

## 3. 非功能要求
- 全仓库单元测试全绿；
- TypeScript 类型检查 0 报错；
- 前端生产构建 0 错误。
