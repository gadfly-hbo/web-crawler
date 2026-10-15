# Web-Crawler 平台演进与分阶段开发计划 (M0 ~ M3)

本计划基于已批准的产品方案（`docs/FIRE_CRAWL_PRODUCT_PLAN.md`），采用垂直切片演进策略，渐进式重构并拓展现有的 `web-crawler` 平台。

---

## 阶段概览与演进路线

```text
M0: 边界与技术验证（Firecrawl 适配器最小闭环与快照落盘）
  ↓
M1: 独立工具最小闭环（任务配置、规则抽取、DuckDB 本地分析与价格带对比样板）
  ↓
M2: 证据链闭环与受控 LLM 抽取（SQLite 证据索引、工作台高亮抽屉、预算硬限额）
  ↓
M3: 标准化交付与生态对接（Parquet + Manifest 导出包、JuanerAI / Report Studio 对接）
```

---

## 阶段一览表

| 阶段代码 | 阶段名称 | 核心目标 | 交付物清单 | 退出与验收标准 |
|---|---|---|---|---|
| **M0** | **边界与技术验证** | 建立 `WebAcquisitionPort` 契约抽象，完成 Firecrawl 适配器集成，打通单页抓取与原始快照落盘，对齐 NDJSON 流式契约。 | 1. `crawlers/firecrawl-scraper` 核心适配器<br>2. 统一快照落盘机制（哈希、元数据、Markdown/HTML）<br>3. Mock 适配器与集成测试套件 | 1. 成功抓取指定测试页面（或本地 Mock 页面），产出格式合规的 Raw Snapshot。<br>2. 覆盖网络异常、缓存策略与超时错误归类。<br>3. 单测全绿，不影响现有 cninfo-reports 运行。 |
| **M1** | **独立工具最小闭环** | 升级 `apps/workbench` 支持通用网页任务配置；建立基础规则抽取引擎（CSS/XPath）；引入 DuckDB + Parquet 本地分析引擎；跑通首个样板：**公开商品标价对比**。 | 1. `packages/data-governance`（规则抽取器）<br>2. `packages/storage-engine`（Parquet 写入与 DuckDB 嵌入查询）<br>3. 工作台商品价格对比样板界面 | 1. 业务人员输入 3 个品牌 URL 列表，完成试采与批量执行。<br>2. 自动生成标价中位数与分布表。<br>3. 支持导出 Parquet 与 CSV。 |
| **M2** | **证据链闭环与受控 LLM** | 建立 SQLite 证据偏移索引体系；在工作台实现“点击数字下钻到原文高亮片段”；集成受控的 LLM 结构化抽取与预算硬封顶。 | 1. 字段级证据索引（`FieldEvidence`）<br>2. 工作台证据下钻与人工修订留痕抽屉<br>3. 预算门禁拦截器（在途费用预留与硬封顶） | 1. 交付表中所有字段可点击查看快照原文段落。<br>2. 预算超限或未知费用时立即熔断并发出告警。 |
| **M3** | **标准化交付与生态对接** | 规范化 `DeliveryManifest` 交付包格式；实现标准本地 API 与 CLI 导出通道；验证与外部消费端的文件级解耦集成。 | 1. 标准归档包导出器（ZIP: Parquet + Manifest + 报告）<br>2. 标准只读查询 CLI 与本地服务接口 | 外部产品可通过读取 Parquet 和 Manifest 直接消费数据，系统解耦完备。 |

---

## M0 阶段详细实施任务分解

当前立即启动 **M0 阶段**，具体任务分解如下：

1. **Task M0.1: 定义统一采集端口契约 `WebAcquisitionPort`**
   - 定义 Scrape 请求参数（URL, formats, headers, freshness 等）与响应结果（content, rawHtml, metadata, status, error）。
   - 定义标准的流式事件（`start`, `scraping`, `snapshot_saved`, `error`, `done`），与仓库统一的 NDJSON 机制对齐。

2. **Task M0.2: 实现 Firecrawl 适配器（Cloud / 自托管 / 本地降级）**
   - 封装官方 `@mendable/firecrawl-js`（或等效 HTTP 协议实现）。
   - 支持环境变量（`FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`）动态注入。
   - 实现网络超时重试与错误显式分类（RateLimit, Forbidden, NotFound, ServerError）。

3. **Task M0.3: 实现原始快照（Raw Snapshot）持久化管理**
   - 快照目录：`data/snapshots/<id>/`。
   - 文件落盘：`content.md`、`content.html`（如请求需要）、`metadata.json`。
   - 计算 SHA-256 哈希，记录请求时间、响应时间与提供方时间戳。

4. **Task M0.4: CLI 命令行装配与 Mock 测试套件**
   - 提供 `pnpm --filter firecrawl-scraper start -- --url <URL> -o <输出目录> --json`。
   - 编写无需真实网络的 Mock 适配器测试，验证流式事件、异常处理与快照一致性。
   - 确保 `pnpm test` 与 `pnpm typecheck` 全绿。
