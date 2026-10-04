# PRD：web-crawler 多数据源架构与通用 API 采集引擎

## 1. 目标与非目标

### 1.1 目标
1. **多数据源解耦**：将工作台单爬虫绑定解耦为多数据源插件架构，支持多态任务参数（`TaskParams`）与执行器注册表（`RunnerRegistry`）。
2. **通用声明式 API 采集引擎**：在 `crawlers/api-connector` 实现通用的 HTTP RESTful API 采集引擎，支持灵活分页、JSONPath 数据提取、批量文件下载与原子落盘，输出兼容标准 `CrawlEvent`。
3. **向后兼容性**：存量历史任务缺省 `sourceType` 自动视为 `cninfo`，既有 68 个单测保持全部通过，CLI 行为不变更。
4. **工作台 UI 适配**：新建任务支持数据源切换，新增声明式 API 参数配置表单与预设模板。

### 1.2 非目标
1. 复杂的浏览器自动化与无头网络嗅探（预留为第三阶段）。
2. 支持需要复杂动态混淆 JS 签名的网站（此类网站通过后续 Agent 浏览器处理）。

---

## 2. 用户故事 (User Stories)

- **US1（历史无缝兼容）**：作为运营同学，当我打开升级后的工作台时，我过去采集的所有巨潮财报任务和文件仍然正常展示、可查看、可下载，没有任何报错。
- **US2（自由切换数据源）**：作为运营同学，在新建任务时，我可以明确选择要采集“A 股上市公司定期财报”还是“通用 API 接口”。
- **US3（配置化 API 采集）**：作为数据开发人员，遇到一个提供 JSON 列表的接口时，我只需在工作台输入 URL、分页参数和字段提取规则，即可批量拉取数据并自动下载附件 PDF，不需要重新写代码。
- **US4（预设模板一键使用）**：作为非技术用户，我可以从预设模板中选择常见的公开研报/资讯接口模板，一键加载默认配置直接试跑。
- **US5（统一预览与实时监控）**：不论采集巨潮财报还是通用 API，我都可以先“预览数量”进行预估，开始采集后通过同一个实时进度条和日志面板查看进展。

---

## 3. 技术规范与契约设计

### 3.1 共享参数契约 (`apps/workbench/shared/task-params.ts`)
```ts
export type SourceType = 'cninfo' | 'api-connector';

export interface CninfoTaskParams {
  sourceType?: 'cninfo';
  companies: string[];
  industries: string[];
  year?: number;
  from?: string;
  to?: string;
  types: ReportType[];
  limit?: number;
  sleepMs: number;
}

export interface ApiConnectorParams {
  sourceType: 'api-connector';
  name: string;
  request: {
    url: string;                  // 支持 {{page}}, {{pageSize}} 模板插值
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    bodyTemplate?: string;        // POST 请求时支持 {{page}} 等插值
  };
  pagination: {
    type: 'page_number' | 'cursor';
    pageParam: string;            // 如 "page"
    pageSizeParam?: string;       // 如 "pageSize"
    startPage: number;
    pageSize: number;
    maxPages?: number;            // 防死循环保护上限，默认 50，最高 200
    hasMorePath?: string;         // 如 "data.hasMore"
    totalPath?: string;           // 如 "data.total"
  };
  extraction: {
    listPath: string;             // 如 "data.items" 或 "items"
    titlePath: string;            // 如 "title"
    itemKeyPath?: string;         // 如 "id"
    downloadUrlPath?: string;     // 如 "pdfUrl" 或 "fileUrl"
    datePath?: string;            // 如 "publishDate"
  };
  sleepMs: number;                // 频控间隔，最低 200ms
}

export type TaskParams = CninfoTaskParams | ApiConnectorParams;
```

### 3.2 通用 API 采集器 (`crawlers/api-connector`)
- **包目录**：`crawlers/api-connector`，包含 `package.json`, `src/engine.ts`, `src/cli.ts`, `src/json-path.ts`。
- **命令行界面**：
  ```bash
  pnpm --filter api-connector start -- --config-json '<json>' --json -o <outDir>
  ```
  若带 `--dry-run` 则只分页统计记录与报告数，发射 `preview` 事件且不落盘文件。
- **事件流对齐**：
  - `start`: `{ totalCompanies: number, dryRun: boolean }`
  - `company`: `{ index: number, total: number, name: string, code: string }`
  - `file`: `{ status: 'downloaded' | 'skipped' | 'failed', name: string, title: string, bytes?: number, reason?: string }`
  - `done`: `{ summary: { downloaded: number, skipped: number, failed: number } }`
  - `error`: `{ message: string }`

### 3.3 工作台执行器多源调度 (`apps/workbench/server/runner.ts`)
```ts
export function makeMultiCrawlerRunner(opts: { repoRoot: string }): Runner {
  return (task, emit) => {
    const sourceType = task.params.sourceType ?? 'cninfo';
    if (sourceType === 'cninfo') {
      return runCninfoCrawler(task, emit, opts);
    }
    if (sourceType === 'api-connector') {
      return runApiConnectorCrawler(task, emit, opts);
    }
    throw new Error(`不支持的数据源类型: ${sourceType}`);
  };
}
```

---

## 4. 验收基线

1. **测试基线**：全仓库现有测试与新增测试 100% 通过。
2. **类型检查**：`pnpm -r run typecheck` 0 报错。
3. **前端构建**：`pnpm --filter workbench build` 成功，0 循环依赖。
4. **端到端 API 采集功能完备**：构造模拟 API 接口，完整跑通配置创建、分页拉取、附件下载与实时进度推送。
