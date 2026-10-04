# PRD: web-crawler 架构重构与缺陷修复

> 基于 `.flow/proposal.md` 与 `.flow/red-team.md` 生成。

## Problem Statement

当前 `web-crawler` 仓库管理了巨潮资讯网财报爬虫 `crawlers/cninfo-reports` 和数据采集工作台 `apps/workbench`。随着初期快速迭代，系统积累了数个严重的数据与可靠性隐患以及多处架构坏味道：
1. **可靠性隐患**：下载中断/取消会导致半截 PDF 留在磁盘，重跑时被误认为已存在而跳过；单份文件失败会直接放弃整家公司的后续下载；年份模式查询窗口过宽且翻页上限 3000 条存在静默截断漏抓风险。
2. **契约重复与漂移**：报告类型、参数校验规则、行业列表、证券匹配在爬虫与工作台双侧重复实现，全靠脆弱的进程对拍维持一致；NDJSON 事件缺乏类型约束，易发静默错误。
3. **上帝函数与高耦合**：`main.ts` 单一函数 344 行交织了 CLI 文本格式化与 NDJSON 事件流；工作台 `app.ts` 单文件承载全部端点；前端 `NewTask.tsx` 膨胀到 400 行且存在循环依赖。

## Solution

在**严格保持 CLI 默认人类可读输出逐字节不变**的前提下，分阶段实施高内聚重构：
1. **缺陷闭环**：实现 `.part` 临时文件 + rename 原子落盘；单报告下载颗粒度独立捕获异常；年份模式窗口收窄并添加超页显式 `queryError` 告警；工作台透传公司代码。
2. **领域统一**：爬虫包对外暴露 `domain` 与 `events` 强类型契约，工作台以 `workspace:*` 引用，消除手抄校验与跨包路径。
3. **架构解耦**：爬虫拆分为纯流程引擎 `run(opts, reporter)` 与可插拔 Reporter；工作台后端提取事件 Reducer 与模块化路由；工作台前端提取状态管理与子视图。

## User Stories

1. 作为运维/数据分析师，当我在下载 PDF 途中按 Ctrl+C 中断或系统崩溃时，我希望磁盘上不会留下损坏的残缺文件，以便下次重跑时能正确补齐完整文件。
2. 作为业务人员，当某家公司的某一份报告由于源站单点网络抖动下载失败时，我希望爬虫继续下载该公司的其他合规报告，并在最终摘要和失败清单中清晰看到具体失败的报告标题和原因。
3. 作为业务人员，当我对大行业（如制造业）按年份抓取时，我希望查询窗口聚焦于该报告期的法定发布区间，如果触发源站数据翻页上限，我希望工作台能显式告警提示而不是静默漏抓。
4. 作为终端用户，当我在工作台通过公司简称搜索并添加具有更名历史或相似名称的公司时，我希望后台准确按所选证券代码采集，不会错误抓取到同名或混淆公司。
5. 作为二次开发人员，当修改或新增爬虫报告类型、参数规则或行业清单时，我希望只需在一处领域模块中定义，工作台自动获得同步类型推导与校验，无需维护两套副本。
6. 作为系统调用方，当我消费 `--json` 输出的 NDJSON 事件流时，我希望所有事件结构遵循严格的 TypeScript 联合类型契约，字段变更时编译器能主动报错。
7. 作为终端命令行用户，当我不带 `--json` 运行 `cninfo-reports` 时，我希望控制台输出的每一行文本、空格、标点和进度符号与原版本完全一致。
8. 作为工作台前端用户，在搜索公司时如果输入较快，我希望不会被旧请求的迟到返回覆盖当前搜索结果，且网络异常时搜索指示器能正确复位。
9. 作为系统运维人员，当通过工作台下载大型任务打包 zip 且浏览器提前断开连接时，我希望后台打包子进程及时中止，不占用无谓的 CPU 与内存。
10. 作为前端开发者，我希望工作台界面组件职责单一，表单状态通过统一 reducer 驱动，代码清晰易读易测，无循环依赖模块。

## Implementation Decisions

- **Decision 1 (原子写入)**: 采用 `file.pdf.part` 作为写入目标缓冲，`writeFile` 完整成功后再 `rename` 为目标文件名；启动或下载前清理残存的 `.part` 文件。
- **Decision 2 (细粒度容错)**: `for (const { ann, type } of company.items)` 循环内部包裹独立的 `try/catch`；捕获到错误时仅增加 `summary.failed++`，发出携带 `ann.title` 的 `file` failed 事件，不中断循环中的后续报告。
- **Decision 3 (年份窗口收窄与翻页防御)**: 年报窗口设为 `${year + 1}-01-01 ~ ${year + 1}-12-31`，中报/季报窗口设为 `${year}-01-01 ~ ${year}-12-31`；翻页逻辑在 `pageNum === 100 && page.hasMore` 时抛出或发射 `queryError` 事件并计入失败。
- **Decision 4 (领域导出方案 A)**: 在 `crawlers/cninfo-reports/package.json` 中配置 `exports`:
  - `"."`: `./src/main.ts`
  - `"./domain"`: `./src/domain/index.ts`
  - `"./events"`: `./src/events.ts`
  工作台依赖 `"cninfo-reports": "workspace:*"`。
- **Decision 5 (流程引擎与 Reporter 分离)**: 拆分出 `run(opts, reporter)`；`ndjsonReporter` 负责将 `CrawlEvent` 序列化输出 stdout；`textReporter` 负责将 `CrawlEvent` 映射为原有控制台文本；main.ts 仅负责组装。
- **Decision 6 (工作台状态 Reducer)**: 提取 `applyEvent(task: TaskRecord, ev: CrawlEvent): TaskRecord` 为纯函数，`queue.ts` 只负责 I/O 调度与状态持久化调用。
- **Decision 7 (前端状态管理)**: `NewTask.tsx` 引入 `useReducer`，提取 `NewTaskState` 与 actions；将公司选择、时间类型选择、预览结果拆分为小型独立组件。

## Testing Decisions

- **外部行为测试原则**: 测试只验证 CLI 的 stdout 事件/文本流、磁盘文件正确性、API 端点响应与 Reducer 状态迁移，不刺探内部私有变量。
- **快照基准**: 在对 `main.ts` 分离 reporter 之前，录制默认输出的 baseline 快照，并在后续单测中严格断言 0 diff。
- **Seams 规划**:
  1. `http.ts` 的 `fetch` 替身（现有假巨潮服务器 seam 继续保留）；
  2. `queue.ts` 的 `runner` 注入替身（现有 fake runner 继续保留）；
  3. `applyEvent` 纯函数无外部 I/O 依赖，采用全分支纯单元测试。

## Out of Scope

- 新建 `packages/` 共享包体系（维持 monorepo 当前约束）。
- 修改巨潮原生的 19 个证监会行业门类支持粒度。
- 引入重量级前端组件库（如 AntD/Tailwind 等，继续手写遵循 Xanthil 规范）。

## Diff Gate (Auto Approved)

- 与 `.flow/proposal.md` 对比：
  - 无删除决策
  - 无冲突决策
  - 纯增补：明确了年报/季报具体窗口计算公式、exports 字段切分、Reducer 接口签名。
  - 符合 auto 模式要求，自审通过。
