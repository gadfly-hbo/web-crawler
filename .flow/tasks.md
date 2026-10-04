# 任务拆解：web-crawler 架构重构与缺陷修复

> 依据 `.flow/prd.md` 拆解为垂直切片（Tracer Bullets）。本文件为任务事实源。

## 清单

- [x] 1. P0 核心数据安全与可靠性缺陷修复（B1~B7）
- [x] 2. P1 领域契约与事件流强类型统一（方案 A，消除跨包路径）
- [x] 3. P2 爬虫核心纯函数化与 Reporter 分离（逐字节快照对齐）
- [x] 4. P3 工作台后端 Reducer 状态机抽取与路由模块化
- [x] 5. P4 工作台前端解耦（消除循环依赖与 NewTask 状态机重构）
- [x] 6. P5 仓库级工程化串联与全量回归验收

---

## 1. P0 核心数据安全与可靠性缺陷修复（B1~B7）

**Blocked by**: None（可立即开始）

**User stories**: 1, 2, 3, 4, 8, 9

### What to build
- **B1 原子落盘**: 爬虫下载 PDF 先写入 `.part` 临时文件，完整成功后原子重命名为 `.pdf`；若目标 `.pdf` 已存在则判定跳过；执行前/遇到异常清理残存 `.part`。
- **B2 单报告细粒度容错**: 将 `for (const { ann, type } of company.items)` 内的 `try/catch` 移入单份报告级别；单份报告下载失败仅记录该文件失败，发射携带报告标题 `title` 的 `file` failed 事件，不中断同公司其他财报。
- **B3 年份模式窗口收窄与翻页防御**: 年报窗口优化为 `${year + 1}-01-01 ~ ${year + 1}-12-31`，中报/季报窗口为 `${year}-01-01 ~ ${year}-12-31`；当巨潮翻页到达第 100 页且 `hasMore == true` 时，显式发射 `queryError` 告警，坚决杜绝静默截断。
- **B4 公司代码准确传递**: 工作台提交任务时向 CLI 传递 6 位证券代码（参数中包含代码），避免同名或更名歧义。
- **B5–B7 边界修复**: 前端搜索添加请求序号防竞态；归档 zip 请求在流断开时清理进程；下载 URL 统一走 `announcementDownloadUrl` 支持 origin 覆盖。

### Acceptance criteria
- [x] 中途被中止的下载不会在磁盘留下损坏的同名 `.pdf`。
- [x] 构造单报告下载抛错场景，同公司后续报告能继续下载，且失败事件携带 title。
- [x] 模拟第 100 页 `hasMore: true`，断言输出 `queryError` 事件并计入失败。
- [x] 现存全部测试通过，并新增针对 B1/B2/B3 行为的单测。

---

## 2. P1 领域契约与事件流强类型统一（方案 A，消除跨包路径）

**Blocked by**: 1

**User stories**: 5, 6

### What to build
- 在 `crawlers/cninfo-reports` 中建立：
  - `src/domain/types.ts`: `ReportType`, `TaskParams`, `StockInfo`
  - `src/domain/industries.ts`: 19 类门类定义与匹配
  - `src/domain/validation.ts`: 参数校验核心（纯函数）
  - `src/events.ts`: `CrawlEvent` 联合类型与 NDJSON 解析器
- 在 `crawlers/cninfo-reports/package.json` 配置 `exports`，暴露 `./domain` 与 `./events`。
- 在 `apps/workbench` 中声明 `"cninfo-reports": "workspace:*"`，全量替换跨包相对路径 `../../../crawlers/cninfo-reports/...`。
- 工作台校验与日志解析直接对接领域模块，消除手抄校验。

### Acceptance criteria
- [x] `rg "\.\./\.\./\.\./crawlers" apps/` 输出为 0。
- [x] `queue.ts` 与 `log-format.ts` 改为使用强类型的 `CrawlEvent`。
- [x] `pnpm -r run typecheck` 0 报错。
- [x] 既有测试全部通过。

---

## 3. P2 爬虫核心纯函数化与 Reporter 分离（逐字节快照对齐）

**Blocked by**: 2

**User stories**: 7

### What to build
- 录制基准输出快照测试，锁定不带 `--json` 时的默认人读文本输出。
- 将 `main.ts` 重构为：
  - 核心流程引擎 `run(opts, reporter)`，内部纯粹发射事件；
  - `textReporter`: 逐字节对齐实现现有人读输出；
  - `ndjsonReporter`: 格式化并输出 NDJSON；
  - 消除可变全局变量 `jsonMode`，限速器通过选项注入。
- `parseArgs` 纯函数化：`-h` 时返回 `{ help: true }`，不直接退出进程。

### Acceptance criteria
- [x] 快照测试通过：CLI 默认文本输出与重构前逐字节一致。
- [x] `--json` 模式输出与原有事件序列完全兼容。
- [x] 爬虫测试全部通过。

---

## 4. P3 工作台后端 Reducer 状态机抽取与路由模块化

**Blocked by**: 2, 3

**User stories**: 6

### What to build
- 提取纯函数 `applyEvent(task: TaskRecord, ev: CrawlEvent): TaskRecord`，单测覆盖所有事件分支（start, company, file, queryError, preview, done, error 等）。
- `queue.ts` 瘦身：只保留调度、I/O 持久化与事件分发，业务状态迁移全权委托 `applyEvent`。
- 拆分 `server/app.ts` 为模块化路由：`routes/meta.ts`, `routes/tasks.ts`, `routes/files.ts`, `routes/sse.ts`。

### Acceptance criteria
- [x] `applyEvent` 拥有独立完备单元测试。
- [x] `app.ts` 代码行数显著精简（保持单文件 ≤ 80 行）。
- [x] 工作台 46 个测试全部通过。

---

## 5. P4 工作台前端解耦（消除循环依赖与 NewTask 状态机重构）

**Blocked by**: 4

**User stories**: 10

### What to build
- 抽离公共 UI 组件（`StatusChip`, `FailureList` 等）到 `web/src/components/`，消除 `App.tsx` 与 `TaskDetail.tsx` 的循环依赖。
- 重构 `NewTask.tsx`（从 400 行收敛到 ≤ 150 行）：
  - 采用 `useReducer` 管理全部表单状态与操作 actions；
  - 拆分独立子组件：`ScopePicker`, `TimeTypePicker`, `PreviewPanel`；
  - 预览状态同步接入 SSE 事件流。

### Acceptance criteria
- [x] `madge` 或类似检查确认前端 0 循环依赖。
- [x] `NewTask.tsx` 主文件行数 ≤ 150 行。
- [x] `pnpm --filter workbench build` 顺利通过。

---

## 6. P5 仓库级工程化串联与全量回归验收

**Blocked by**: 5

**User stories**: 全部

### What to build
- 根目录 `package.json` 添加 `test` (`pnpm -r test`) 与 `typecheck` (`pnpm -r typecheck`)。
- 执行端到端全量回归测试与构建，验证整体系统的一致性与稳定性。

### Acceptance criteria
- [x] 根目录 `pnpm test` 与 `pnpm typecheck` 全部绿灯。
- [x] 构建产物完整，所有已知缺陷修复闭环。
