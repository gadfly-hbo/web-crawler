# 全仓统一底座开发任务清单

- [x] Task 1: 创建 packages/data-governance 共享包，迁移封装四大核心模块并编写测试 (`packages/data-governance/`)
- [x] Task 2: 重构 crawlers/firecrawl-scraper 接入共享包并确保现有测试完全通过
- [x] Task 3: 改造 crawlers/cninfo-reports 接入共享包，任务完成自动生成 manifest.json 与 SHA-256 签名
- [x] Task 4: 改造 crawlers/api-connector 接入共享包，集成 BudgetGate 门禁与生成 manifest.json
- [x] Task 5: 升级 apps/workbench 任务详情页，为全部爬虫通用呈现标准化交付包导出与质检面板
- [x] Task 6: 全仓库全量单测、类型检查、生产构建与全爬虫端到端检验
