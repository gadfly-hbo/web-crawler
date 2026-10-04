# api-connector

通用声明式 HTTP / RESTful API 采集引擎。针对具有公开数据接口、反解 API 或数据开放平台的站点，通过配置化声明实现自动分页请求、JSONPath 字段提取、附件批量下载与原子落盘，无需针对每个站点编写专用爬虫代码。

## 特性

- **声明式配置**：支持 GET / POST 请求、自定义请求头、动态请求体模板。
- **模板变量插值**：URL 与请求体中支持 `{{page}}`、`{{pageSize}}` 动态注入。
- **双模分页机制**：支持常规数字页码（`page_number`）与游标（`cursor`）分页。
- **安全 JSONPath 提取**：纯函数递归提取目标列表（如 `data.items`）、文件名与下载 URL，无任何 `eval` 注入风险。
- **健壮下载与原子落盘**：文件流式下载先写入 `.part` 临时文件，校验成功后原子 rename，保证进程崩溃时不留脏数据。
- **熔断与死循环防护**：内置 `maxPages` 上限保护（默认 50，最大 200），连续空页或相同响应自动熔断。
- **流式事件对齐**：原生支持 `--json` 输出 NDJSON 事件流（`start` / `company` / `file` / `done` / `preview`），与工作台无缝集成。

## 配置格式示例

```json
{
  "sourceType": "api-connector",
  "name": "示例行业研报接口",
  "request": {
    "url": "https://api.example.com/reports?page={{page}}&size={{pageSize}}",
    "method": "GET",
    "headers": {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 web-crawler"
    }
  },
  "pagination": {
    "type": "page_number",
    "pageParam": "page",
    "pageSizeParam": "size",
    "startPage": 1,
    "pageSize": 20,
    "maxPages": 10
  },
  "extraction": {
    "listPath": "data.list",
    "titlePath": "title",
    "itemKeyPath": "id",
    "downloadUrlPath": "pdfUrl",
    "datePath": "publishDate"
  },
  "sleepMs": 500
}
```

## 使用方式

```bash
# 1. 通过参数传入配置 JSON
pnpm --filter api-connector start -- --config-json '<JSON字符串>' -o data/api-connector/task-1

# 2. 从本地 JSON 文件加载配置
pnpm --filter api-connector start -- --config ./my-config.json -o data/api-connector/task-1

# 3. 仅统计与预览数量（dry-run，不下载文件）
pnpm --filter api-connector start -- --config ./my-config.json --dry-run

# 4. 程序化消费（输出 NDJSON 事件流）
pnpm --filter api-connector start -- --config ./my-config.json --json -o data/api-connector/task-1
```

完整参数说明：`pnpm --filter api-connector start -- -h`

## 程序化消费（--json）

加 `--json` 参数后，stdout 将仅输出每行一个标准 JSON 事件，供上层调度器（如 `apps/workbench`）监听：

- `start`: 采集开始，包含预估目标总数与 `dryRun` 标志。
- `company`: 实体项切换（对应 API 采集任务名）。
- `file`: 单个报告/附件处理结果，包含 `status`（`downloaded` / `skipped` / `failed`）、标题、本地路径或失败原因。
- `preview`: 仅 dry-run 模式发射，包含匹配的报告数量。
- `done`: 采集完成汇总（已下载、跳过、失败数）。
- `error`: 参数错误或致命异常事件。

## 输出目录结构

```
data/api-connector/<task-id>/
├── files/
│   └── <日期>_<标题>.pdf
└── index.jsonl    # 提取的记录流水与本地文件映射（JSON Lines）
```

重跑时已存在的同名文件会自动跳过，保证幂等性与增量续跑。

## 测试

```bash
pnpm --filter api-connector test
```
包含 JSONPath 提取器、分页循环与原子下载引擎、CLI 命令行装配全套测试（100% 模拟本地 Mock HTTP 服务，不产生外网请求）。
