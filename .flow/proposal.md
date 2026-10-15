# Proposal: 抽取 packages/data-governance 全仓通用底座与全爬虫接入

## 1. 目标
将前期在 Firecrawl 垂直切片中验证成熟的数据治理与交付底座，抽取为 monorepo 核心共享包 `packages/data-governance`，并将全仓既有爬虫（`cninfo-reports`、`api-connector`）及未来所有新爬虫统一接入该底座，达成严肃数据资产的工业级统一交付。

## 2. 架构方案

### 2.1 抽取核心共享包 `packages/data-governance`
在根目录 `packages/data-governance` 下提供以下四个子模块导出：
1. `data-governance/evidence`：
   - 字段级证据契约 `FieldEvidence`；
   - 原文行号与字符偏移定位算法 `locateSnippet`；
   - 基于 Node 原生 `node:sqlite` 的高效证据索引库 `EvidenceIndexStore`。
2. `data-governance/manifest`：
   - 标准化交付清单契约 `DeliveryManifest`；
   - 全文件 SHA-256 流式计算 `computeFileSha256`；
   - 自包含离线核验器 `verifyDeliveryPackage`；
   - 数据集质量度量计算 `calculateQualityMetrics`。
3. `data-governance/budget`：
   - 在途配额预占与硬限额熔断拦截器 `BudgetGate`；
   - 超额异常 `BudgetExceededError` 与通用预算配置。
4. `data-governance/storage`：
   - 原始不可变快照落盘引擎 `SnapshotStorage` 与元数据模型。

### 2.2 既有爬虫与未来爬虫统一接入
1. **`crawlers/firecrawl-scraper`**：
   - 重构依赖 `packages/data-governance`，去除重复代码，保留兼容导出。
2. **`crawlers/cninfo-reports`**：
   - 引入 `data-governance`；
   - 采集完成时自动扫描下载的 PDF 与公告结果，计算全文件 SHA-256，生成标准化 `manifest.json` 与 `quality_report.json`。
3. **`crawlers/api-connector`**：
   - 引入 `data-governance`；
   - 在分页请求中接入 `BudgetGate` 防止调用超标；
   - 采集完成时自动计算 `items.jsonl` 等产出文件的 SHA-256 并生成 `manifest.json`。
4. **工作台通配体验**：
   - `apps/workbench`：通用化展示交付包下载与 SHA-256 签名质检卡片，使财报采集、API 采集和网页采集均具备统一资产凭证。
