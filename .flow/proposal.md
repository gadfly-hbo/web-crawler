# 方案提案：web-crawler 三维采集矩阵架构演进（阶段一：声明式通用 API 采集引擎与工作台多源调度）

## 1. 背景与目标

当前 `web-crawler` 已完成巨潮 A 股上市公司财报爬虫及桌面工作台的重构。然而，现有工作台在参数契约（`TaskParams`）、子进程调度（`runner.ts`）和前端新建表单（`NewTask.tsx`）上完全硬编码绑定在单一的巨潮财报爬虫上，无法承载多数据源扩展。

经架构推演，系统确定向**三维数据采集矩阵**演进：
1. **固化专用爬虫**（如 `cninfo-reports` 巨潮财报）：针对大批量、长周期、特异规则的核心官方站点；
2. **API 通用连接器 & 嗅探**（声明式配置 + 智能抓包提取）：针对已有 API、官方数据开放平台或能逆向出接口的站点；
3. **Agent 浏览器自动化**（Playwright / 视觉 Agent）：针对强反爬、需扫码登录、无规律的零散复杂页面。

**本次迭代核心目标（Tracer Bullet 切片）**：
- **解耦工作台调度层**：重构 `TaskParams` 为多态契约（`sourceType: 'cninfo' | 'api-connector'`），建立插件化 `RunnerRegistry`，彻底消除单爬虫硬编码；
- **构建通用声明式 API 采集引擎 (`crawlers/api-connector`)**：实现零代码配置化 HTTP/REST 接口采集器，支持灵活分页（页码/游标/时间）、字段提取与文件批量下载，发射强类型 `CrawlEvent`；
- **工作台 UI 多源接入**：前端新建任务增加数据源切换，新增通用 API 配置/预设模板面板，全链路复用现有串行队列、原子落盘、SSE 实时进度回显。

---

## 2. 详细技术方案

### 2.1 统一多数据源契约（Shared Domain）
在 `apps/workbench/shared/` 中重构任务参数契约：
```ts
export type SourceType = 'cninfo' | 'api-connector';

export interface CninfoTaskParams {
  sourceType?: 'cninfo'; // 兼容历史缺省
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
    url: string;                  // 支持插值 {{page}}, {{pageSize}}
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    bodyTemplate?: string;        // POST 请求 JSON 模板
  };
  pagination: {
    type: 'page_number' | 'cursor' | 'offset';
    pageParam: string;            // 如 "pageNo" 或 "page"
    pageSizeParam?: string;       // 如 "pageSize"
    startPage: number;
    pageSize: number;
    maxPages?: number;            // 保护上限，防止死循环
    totalPath?: string;           // 如 "data.total"
    hasMorePath?: string;         // 如 "data.hasMore"
  };
  extraction: {
    listPath: string;             // 如 "data.items" 或 "data.list"
    itemKeyPath?: string;         // 唯一标识字段
    titlePath: string;            // 报告/记录标题
    downloadUrlPath?: string;     // 若包含文件下载：如 "pdfUrl"
    datePath?: string;            // 发布日期
  };
  sleepMs: number;                // 频控间隔（最低 200ms）
}

export type TaskParams = CninfoTaskParams | ApiConnectorParams;
```

### 2.2 插件式执行器注册表（Runner Registry）
重构 `apps/workbench/server/runner.ts`：
- 定义 `RunnerRegistry`：映射 `sourceType -> RunnerFactory`；
- `cninfo` 分发至 `crawlers/cninfo-reports`；
- `api-connector` 分发至 `crawlers/api-connector`；
- 保持子进程隔离机制，子进程标准输出通过统一 NDJSON 协议发射 `CrawlEvent`。

### 2.3 声明式通用 API 采集引擎 (`crawlers/api-connector`)
在 `crawlers/api-connector/` 构建独立自包含的爬虫包：
- `src/engine.ts`:
  - 驱动分页循环：根据配置动态替换参数，调用源站 API；
  - 数据提取：纯函数解析 JSON 响应中的清单与文件 URL；
  - 下载调度：调用通用 HTTP 流式下载，集成原子落盘（`.part` -> `.pdf`）与单报告容错；
  - 事件发射：按行向 stdout 吐出 `start` -> `company`/`source` -> `file` -> `done` 事件。
- `src/cli.ts`:
  - 支持 `--config <json-path>` 或 `--config-json <string>`；
  - 支持 `--dry-run` 预览数量（只统计分页与清单，不下载文件）。

### 2.4 工作台 UI 改造
- `apps/workbench/web/src/views/NewTask.tsx`:
  - 阶段一顶部支持「数据源类型」切换单选卡片：
    - `A 股上市公司定期财报（巨潮专用引擎）`
    - `通用 API 接口采集器（声明式 RESTful API 引擎）`
  - 选中 API 采集器时，渲染 `ApiConnectorForm.tsx`，支持填入接口 URL、分页方式，并提供常见预设模板（如示例研报接口配置）；
  - 全量复用第二阶段“预览数量确认”与第三阶段“实时采集监控”。

---

## 3. 验收标准

1. **零破坏回归**：既有巨潮财报爬虫 13 项单测、工作台 55 项单测全部保持 100% 绿灯，历史任务数据正常读取，无向后兼容破坏。
2. **API 采集引擎自包含测试**：`crawlers/api-connector` 拥有完备的单元测试，覆盖页码分页、数据提取、文件下载、原子落盘与 `--dry-run` 预览。
3. **工作台多源调度验证**：工作台后端与前端能成功创建并执行 API 采集任务，SSE 进度条、计数与产出文件正常落盘与打包。
4. **代码整洁与质量**：全仓库 TypeScript 0 报错，无循环依赖，前端组件模块化。
