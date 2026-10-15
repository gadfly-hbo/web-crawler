# firecrawl-scraper

基于 Firecrawl 适配层的通用网页采集与原始快照引擎。支持通过标准 `WebAcquisitionPort` 端口契约对接 Firecrawl Cloud、Firecrawl 自托管服务及本地离线 Mock 适配器。

## 特性

- **统一端口抽象 (`WebAcquisitionPort`)**：解耦具体抓取提供方，支持 Cloud、自托管与离线测试 Mock 自由切换。
- **原始快照保证 (`Raw Snapshot`)**：
  - 自动落盘 `content.md`、`content.html` 与 `metadata.json`。
  - SHA-256 完整性哈希防篡改与时间留痕（`requested_at`, `received_at`）。
  - 先写临时目录再原子 rename，保障进程崩溃时不留半截文件。
- **错误分类与重试策略**：显式区分 `RATE_LIMIT_EXCEEDED` (429)、`ACCESS_DENIED` (401/403)、`PAGE_NOT_FOUND` (404)、`SERVER_ERROR` (5xx) 与网络超时。
- **流式事件总线 (`NDJSON`)**：原生支持 `--json` 输出每行一个标准 JSON 事件，与工作台任务监控无缝对齐。

## 使用方式

```bash
# 1. 离线 Mock 测试采集（不产生外网请求）
pnpm --filter firecrawl-scraper start -- --mock --urls "https://example.com/p1,https://example.com/p2"

# 2. 从文本文件批量读取目标 URL 列表
pnpm --filter firecrawl-scraper start -- --mock --urls-file ./sources/urls.txt -o data/snapshots/task-1

# 3. 程序化输出 NDJSON 事件流（工作台对接）
pnpm --filter firecrawl-scraper start -- --mock --urls "https://example.com/p1" --json

# 4. 真实 Firecrawl Cloud 采集（需配置环境变量）
export FIRECRAWL_API_KEY="fc-YOUR_API_KEY"
pnpm --filter firecrawl-scraper start -- --url "https://news.ycombinator.com" -o data/snapshots/yc
```

## 快照输出结构

```text
data/snapshots/task-1/
└── snapshots/
    └── snap_20261006082926_08dac8_1fc3/
        ├── content.md        # 页面 Markdown 正文
        ├── content.html      # 页面原始 HTML (若请求)
        └── metadata.json     # 目标 URL、哈希、时间戳、状态码等元数据
```

## 测试

```bash
pnpm --filter firecrawl-scraper test
pnpm --filter firecrawl-scraper typecheck
```
