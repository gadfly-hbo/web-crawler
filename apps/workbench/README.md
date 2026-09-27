# workbench：数据采集工作台

面向非技术运营的本机 Web 工作台：浏览器里选范围 → 预览数量 → 开始采集 → 查看进度与文件。

- 本机运行，仅监听 `127.0.0.1`（默认端口 4180，`PORT` 环境变量可改）。
- 数据只保存在仓库根 `data/` 目录：`data/workbench/`（任务与日志）、`data/cninfo-reports/<任务id>/`（PDF 产出）。
- 同一时间只运行一个采集任务，其余排队（保护目标站点的限速承诺）。

## 日常使用（非技术同学）

双击仓库根目录的 **`启动采集工作台.command`**：首次运行会自动安装依赖并构建界面，随后自动打开浏览器。

## 开发

```bash
pnpm install

# 后端（API + 任务队列，4180）
pnpm --filter workbench dev
# 前端（vite dev，5173，代理 /api 到 4180）
pnpm --filter workbench dev:web

# 生产模式（构建前端后由后端统一托管）
pnpm --filter workbench build && pnpm --filter workbench start

# 测试 / 类型检查
pnpm --filter workbench test
pnpm --filter workbench run typecheck
```

## 结构

```
apps/workbench/
├── shared/    # 前后端共享：任务参数校验、任务类型、日志行格式化（纯函数）
├── server/    # Hono API：任务队列（串行）、SSE 事件流、文件服务、证券清单缓存
├── web/       # React 界面（无 UI 组件库，样式遵循全局 Xanthil 设计规范）
└── test/      # node:test 行为测试（fake runner / 假巨潮服务器为 seam，不触网）
```

采集执行通过 spawn 子进程调用 `crawlers/cninfo-reports` 的 `--json` 模式（NDJSON 事件流），爬虫 CLI 的默认行为不受影响。
