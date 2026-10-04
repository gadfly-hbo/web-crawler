# 任务拆解：web-crawler 三维矩阵演进与通用 API 采集引擎

> 依据 `.flow/prd.md` 与 `.flow/proposal.md` 拆解为垂直切片。本文件为任务事实源。

## 清单

- [x] 1. P1 共享层多态契约与向后兼容参数模型
- [x] 2. P1 通用 API 采集器包骨架与安全 JSONPath 提取器
- [x] 3. P1 声明式 API 流程引擎与原子下载实现（TDD 驱动）
- [x] 4. P1 通用 API 采集器 CLI 装配与事件对齐
- [x] 5. P1 工作台后端 Runner 注册表与多源调度升级
- [x] 6. P2 工作台前端数据源切换与 API 采集表单
- [x] 7. P0 仓库全量回归与端到端验证
- [x] 8. P0 评审第 1 轮阻塞项修复（路由多态兼容、E2E 集成测试、README 补齐与目录隔离）

---

## 1. P1 共享层多态契约与向后兼容参数模型

**Blocked by**: None

### What to build
- 在 `apps/workbench/shared/task-params.ts` 引入 `SourceType = 'cninfo' | 'api-connector'`；
- 将 `TaskParams` 定义为 `CninfoTaskParams | ApiConnectorParams` 联合类型；
- `validateTaskParams` 支持根据 `sourceType ?? 'cninfo'` 进行分支校验；
- 新增 API 预设模板配置常量 `API_PRESET_TEMPLATES`。

### Acceptance criteria
- [ ] 缺省 `sourceType` 的历史任务能正常通过校验并识别为 `cninfo`。
- [ ] 非法 API 参数（如 URL 为空、分页负数）被正确捕获并返回中文错误。
- [ ] 编写并通过 `apps/workbench/test/api-params.test.ts`。

---

## 2. P1 通用 API 采集器包骨架与安全 JSONPath 提取器

**Blocked by**: 1

### What to build
- 初始化 `crawlers/api-connector/package.json` 与 `tsconfig.json`；
- 在 `crawlers/api-connector/src/json-path.ts` 实现安全的纯函数 JSONPath/属性提取工具；
- 支持点路径（`data.items`）与数组索引提取，遇到不存在属性安全返回 `undefined`，绝不抛出 Unhandled Exception。

### Acceptance criteria
- [ ] 编写 `crawlers/api-connector/test/json-path.test.ts`，100% 覆盖正反路径。
- [ ] `pnpm --filter api-connector run typecheck` 0 报错。

---

## 3. P1 声明式 API 流程引擎与原子下载实现（TDD 驱动）

**Blocked by**: 2

### What to build
- 实现 `crawlers/api-connector/src/engine.ts`：
  - 核心执行器 `runApiConnector(params, reporter, outDir, dryRun)`；
  - 驱动自动翻页循环，支持页码插值替换 `{{page}}`；
  - 内置 `maxPages` 防死循环保护；
  - 提取下载链接，执行原子落盘（`.part` -> 目标文件）与单文件容错；
  - 统一发射 `CrawlEvent`（start, company, file, preview, done, error）。

### Acceptance criteria
- [ ] 配合本地 HTTP Mock Server 编写 `test/engine.test.ts`。
- [ ] 测试用例覆盖：正常分页拉取、附件下载、`dryRun` 预览、以及防死循环熔断。

---

## 4. P1 通用 API 采集器 CLI 装配与事件对齐

**Blocked by**: 3

### What to build
- 实现 `crawlers/api-connector/src/cli.ts` 与 `src/main.ts`；
- 支持 `--config-json '<json>'` 与 `--config <path>`；
- `--json` 模式下将事件流以 NDJSON 实时输出到标准输出；
- 默认人读模式下提供友好的控制台汇总输出。

### Acceptance criteria
- [ ] 编写 `test/cli.test.ts`，验证 `--config-json` 与 `--dry-run` 命令行输出。
- [ ] `pnpm --filter api-connector test` 全部绿灯。

---

## 5. P1 工作台后端 Runner 注册表与多源调度升级

**Blocked by**: 1, 4

### What to build
- 重构 `apps/workbench/server/runner.ts` 为支持 `cninfo` 与 `api-connector` 的多源分发执行器；
- 根据 `task.params.sourceType ?? 'cninfo'` 派发到对应的爬虫子进程；
- 保持 `applyEvent` 状态机无缝复用；
- 编写多源派发单测。

### Acceptance criteria
- [ ] `apps/workbench/test/runner-dispatch.test.ts` 验证两类数据源正确启动对应子进程。
- [ ] 工作台现有 55 个单测保持全部 PASS。

---

## 6. P2 工作台前端数据源切换与 API 采集表单

**Blocked by**: 5

### What to build
- 在 `web/src/views/NewTask.tsx` 增加数据源类型选择卡片（巨潮财报 vs 通用 API）；
- 抽取 `web/src/views/new-task/ApiConnectorPicker.tsx` 组件，支持输入 URL、请求方式、分页与提取规则；
- 支持选择内置预设模板一键回填；
- 保持 `NewTask.tsx` 主入口 ≤ 150 行，保持 0 循环依赖。

### Acceptance criteria
- [ ] 前端能自由切换两种数据源，表单验证准确。
- [ ] `pnpm --filter workbench build` 编译成功。
- [ ] `madge` 验证前端保持 0 循环依赖。

---

## 7. P0 仓库全量回归与端到端验证

**Blocked by**: 6

### What to build
- 运行根目录 `pnpm test` 与 `pnpm typecheck`；
- 执行端到端验证，确认双引擎独立运行稳定，历史数据完整展示。

### Acceptance criteria
- [ ] 全 monorepo 所有测试 100% 绿灯。
- [ ] `pnpm typecheck` 0 报错。
- [ ] 无未跟踪垃圾文件与临时产物。

---

## 8. P0 评审第 1 轮阻塞项修复（路由多态兼容、E2E 集成测试、README 补齐与目录隔离）

**Blocked by**: None

### What to build
- 修复 `apps/workbench/server/routes/tasks.ts`：支持 `api-connector` 参数多态规整与共享契约校验，修复 `POST /api/tasks` 400 失败；
- 补充 `apps/workbench/test/api.test.ts`：增加 `POST /api/tasks` 创建 `api-connector` 任务成功与校验失败的 E2E 路由测试；
- 修复 `apps/workbench/server/queue.ts`：`outDir` 路径根据数据源类型动态隔离至 `data/api-connector/<id>`；
- 补齐 `crawlers/api-connector/README.md`，并在根目录 `README.md` 爬虫清单表格补充对应条目；
- 清理 `crawlers/api-connector/src/` 中冗余的 `validation.ts` 与 `types.ts`。

### Acceptance criteria
- [ ] `POST /api/tasks` 传入合法 `ApiConnectorParams` 时成功返回 201 并加入队列。
- [ ] `apps/workbench/test/api.test.ts` 新增用例全部通过。
- [ ] `test -f crawlers/api-connector/README.md` 且根目录表格有条目。
- [ ] 全 monorepo `pnpm test` 与 `pnpm typecheck` 全部绿灯。
