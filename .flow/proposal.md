# 提案：web-crawler 架构重构与缺陷修复

> 来源：前置架构诊断、代码全量审查与讨论稿 [refactor_plan.md](file:///Users/huangbo/.gemini/antigravity-cli/brain/26ed39f9-36c3-4fa5-9f4a-18cb175bca71/refactor_plan.md)。

## 1. 核心目标

在保持既有功能与对外承诺完全不变的前提下，消除 `crawlers/cninfo-reports` 与 `apps/workbench` 之间的重复契约与架构坏味道，修复数据采集完整性与可靠性缺陷（原子写入、容错粒度、深度翻页告警等），提升系统可维护性与测试内聚性。

## 2. 硬约束

1. **CLI 默认输出逐字节不变**：不传 `--json` 时的命令行人类可读输出与现有格式、标点完全一致。
2. **零功能膨胀**：纯架构重构与缺陷修复，不引入新的业务概念或未商定的外部依赖。
3. **回归验证全绿**：既有 6 个爬虫测试、46 个工作台测试在每个重构阶段结束后必须保持全部通过，类型检查 0 错误。
4. **共享方式**：采用方案 A（爬虫包在 `package.json` 中 exports `./domain` 与 `./events`，工作台以 `workspace:*` 引入），遵循 monorepo 当前暂不抽取 `packages/` 的既有约定。

## 3. 范围与分阶段实施

### P0: 核心可靠性与数据安全缺陷修复
- **B1 原子落盘**：PDF 写入采用 `.part` 临时文件 + rename，杜绝中断、取消或崩溃产生残缺损坏文件，确保增量跳过判断安全。
- **B2 细粒度下载容错**：异常捕获粒度从整家公司细化到单份报告；单份报告失败不终止后续报告下载，失败事件携带完整标题与原因。
- **B3 检索窗口收窄与翻页告警**：年份模式按报告类型自动收窄公告查询窗口（年报查 Y+1，中报/季报查 Y）；翻页触及上限时输出显式 `queryError` 告警，避免静默漏抓。
- **B4 公司标识传递**：工作台向 CLI 传递 6 位代码，消除重名或更名歧义。
- **B5–B7 边界修复**：前端搜索防竞态、zip 下载中止清理、下载 URL 统一路由。

### P1: 统一领域契约与消除重复
- 在 `crawlers/cninfo-reports` 下抽取 `domain/`（类型、参数校验、行业门类、证券映射、分类逻辑）与 `events.ts`（强类型联合 `CrawlEvent` 及解析器）。
- 工作台声明 `"cninfo-reports": "workspace:*"`，全量替换跨包相对路径 `../../../crawlers/cninfo-reports/...`。
- 替换工作台中的手抄版校验，用领域模块保证单点真实。

### P2: 爬虫核心纯函数化与解耦
- 将 `main.ts` 庞大主循环拆解为流程引擎 `run(opts, reporter)`，只面向 `CrawlEvent` 发射事件。
- 分离 `ndjsonReporter` 与 `textReporter`，消除全局 `jsonMode`。
- 限速与 HTTP 客户端实例化注入，支持测试与隔离；`parseArgs` 纯函数化。

### P3: 工作台后端状态机与路由模块化
- 抽出 `applyEvent(task, ev): TaskRecord` 纯状态迁移 reducer，单测全覆盖。
- 将 249 行的 `app.ts` 按路由领域解耦为 `routes/meta.ts`, `routes/tasks.ts`, `routes/files.ts`, `routes/sse.ts`。

### P4: 工作台前端解耦与状态收敛
- 抽取独立组件，消除 `App.tsx` 与 `TaskDetail.tsx` 之间的循环依赖。
- 重构 400 行的 `NewTask.tsx`，采用 `useReducer` 管理表单联动状态，拆分子视图。

### P5: 仓库级工程化
- 根目录 `package.json` 串联 `test`、`typecheck` 等 scripts，实现单命令全量回归。
