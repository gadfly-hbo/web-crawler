# PRD：数据采集工作台（web-crawler workbench）v1 + 一键启动

> 规范源：`.flow/proposal.md`（已确认决策不重复论证）。红队报告：`.flow/red-team.md`。

## Problem Statement

运营同学需要采集 A 股财报等公开数据，但现有能力只有命令行爬虫（`pnpm --filter cninfo-reports start -- ...`）：要装环境、记参数、看英文 flag、手动管理输出文件。这堵死了非技术人群的自助使用，所有采集需求都得转给技术同学代跑。

## Solution

一个本机运行的 Web 工作台：运营在浏览器里用表单描述采集需求（公司/行业、年份/日期、报告类型），先「预览数量」确认范围，再一键开始；采集过程实时可见（进度、日志），结果文件可直接下载或在 Finder 打开。双击一个 `.command` 脚本即可启动整个工作台，无需任何命令行知识。

## User Stories

1. 作为运营，我想双击一个图标就打开工作台，以便不需要找技术同学帮我起服务。
2. 作为运营，我想在首次使用时脚本自动完成依赖安装和构建，以便我不用理解 pnpm/node 是什么。
3. 作为运营，我想看到「新建采集任务」的醒目入口，以便不知道从哪开始时也有引导。
4. 作为运营，我想按公司名称（或代码、拼音）搜索并选中多家公司，以便精确采集我关注的对象。
5. 作为运营，我想从预置的行业门类下拉清单中选择行业，以便批量采集整个行业而不用背门类名称。
6. 作为运营，我想按「报告年份」或「公告发布日期范围」二选一指定时间，以便覆盖「要 2024 年年报」和「要三季度发布的所有中报」两类需求。
7. 作为运营，我想勾选报告类型（年报/中报/一季报/三季报，默认全选），以便只下载我需要的类型。
8. 作为运营，我想在开始采集前看到「共匹配 N 家公司、M 份报告」的预览，以便确认范围没选错再花时间去跑。
9. 作为运营，我想提交的任务在已有任务运行时进入排队，以便我不需要守着等空闲。
10. 作为运营，我想在任务列表看到每个任务的状态（排队中/运行中/已完成/部分失败/失败）和进度，以便一眼知道进行到哪。
11. 作为运营，我想在任务详情看到实时进度（已处理 x/N 家公司）和下载/跳过/失败计数，以便判断还要等多久。
12. 作为运营，我想看到实时滚动的运行日志，以便技术同学问我「卡在哪了」时我能截图。
13. 作为运营，我想取消一个跑错了的任务，并被明确告知「已下载的文件会保留」，以便我放心取消。
14. 作为运营，我想在任务结束后看到失败公司和原因的清单，以便我知道缺了什么、是重试还是放弃。
15. 作为运营，我想按任务浏览下载到的文件并单个下载，以便直接取用。
16. 作为运营，我想一键「在 Finder 中显示」任务输出目录，以便用我习惯的方式管理文件。
17. 作为运营，我想打包下载某个任务的全部文件（zip），以便发给同事或归档。
18. 作为运营，我想界面常驻提示「数据仅保存在本机」，以便我对数据边界放心。
19. 作为技术维护者，我想爬虫 CLI 的默认行为完全不变，以便既有命令行用法和文档不失效。
20. 作为技术维护者，我想任务元数据持久化在本机 JSON 文件，以便重启服务后历史任务还在。

## Implementation Decisions

### 架构与模块

- **新增 `apps/workbench`**（pnpm workspace 包；`pnpm-workspace.yaml` 增加 `apps/*`；根 README 结构图与清单同步更新）。内部分 `server/`（Hono 后端）与 `web/`（Vite+React 前端），同包内两个子目录、一个 package.json，脚本：`dev`（并行起 vite dev + server）、`build`（产出 `web/dist`）、`start`（生产模式：server 托管静态文件+API）。
- **任务运行器 Runner（关键 seam）**：server 内的接口抽象——输入「任务参数 + 事件回调」，实现为 spawn 子进程跑 `tsx crawlers/cninfo-reports/src/main.ts --json ...`，逐行解析 NDJSON 转发给回调。测试时用 fake runner 替换，不起真子进程。
- **任务队列 Queue**：内存队列 + 串行 worker（同时仅 1 个运行）；任务状态机 `queued → running → succeeded | partial | failed | canceled`。元数据持久化到 `data/workbench/tasks.json`（每次状态迁移落盘），日志落盘 `data/workbench/logs/<taskId>.ndjson`（重开页面可回放）。
- **SSE 推送**：`/api/tasks/:id/events` 与 `/api/tasks/events`（列表级）推送任务事件；前端断线自动重连。
- **API 契约**（REST，全部 JSON）：
  - `GET /api/meta/stocks` — 公司搜索补全（name/code/pinyin 模糊，server 端缓存巨潮 szse_stock.json，TTL 1 天）
  - `GET /api/meta/industries` — 证监会行业门类清单（来自爬虫 industries 数据的静态导出）
  - `POST /api/tasks` — 创建任务（body 同 `TaskParams`，`dryRun: true` 表示预览）；创建即入队
  - `GET /api/tasks` / `GET /api/tasks/:id` — 列表/详情（含计数、文件清单）
  - `POST /api/tasks/:id/cancel` — 取消（queued 直接出队；running 杀子进程，已下载保留）
  - `GET /api/tasks/:id/files/:path` — 单文件下载；`GET /api/tasks/:id/archive` — zip 打包下载（server 端流式打包，不写临时文件）
  - `POST /api/tasks/:id/reveal` — 在 Finder 中打开输出目录（实现用 macOS `open <目录>`，直接打开目录窗口；REVIEW 后修订措辞，原为「`open -R`」）
- **TaskParams 模型**（与 CLI 参数一一对应）：`{ companies: string[], industries: string[], year?: number, from?: string, to?: string, types: ('annual'|'semi'|'q1'|'q3')[], limit?: number, sleepMs: number }`；校验规则平移 CLI `validate()`（公司/行业至少其一；year 与 from/to 互斥且必选其一；from/to 成对、格式、先后；sleepMs≥200）。前后端共享同一份校验纯函数（放在 workbench 包内 `shared/`，前端 import、server import，不跨包引用爬虫代码）。
- **爬虫改造（`crawlers/cninfo-reports`，行为兼容）**：新增 `--json` flag——所有人类可读输出改为 NDJSON 事件流：`{type:"start",totalCompanies}` / `{type:"company",index,total,code,name}` / `{type:"file",status:"downloaded"|"skipped"|"failed",code,name,reportType,title,path?,bytes?,reason?}` / `{type:"done",summary}`；默认模式输出完全不变。新增输出目录约定：调用方传 `-o data/cninfo-reports/<taskId>` 实现任务级隔离（CLI 已支持 `-o`，无需新参数）。
- **dry-run 预览**：预览也是一条任务（`dryRun: true`，走完队列），爬虫 `--dry-run` 在 json 模式下输出 `{type:"preview",companies,reports}` 汇总事件后正常结束；前端据此展示「N 家公司、M 份报告」。
- **端口**：默认 `4180`（刻意避开 deep-research 的 4173，保证两个工作台可在同机同时运行；被占时启动报错文案提示用环境变量 `PORT` 改端口）。

### 前端（React + Vite + TS，无 UI 组件库，无路由库）

- **视图状态**：单页三栏外壳，视图用状态切换（列表/新建/详情/文件四视图 + URL hash 同步，支持刷新还原）。
- **Xanthil token**：`web/src/styles/tokens.css` 把 DESIGN.md 全部 token 落为 CSS 变量；组件类名用规范里的 `.btn/.fld/.card/.filelist/.tbl/.empty/.chip`。
- **新建任务页**：阶段条三步（选择范围 → 预览确认 → 开始采集）；表单校验函数与 CLI 规则一致并附中文错误文案；「预览数量」按钮提交 dryRun 任务并轮询结果，展示后解锁「开始采集」。
- **任务详情页**：SSE 订阅实时更新进度条/计数/日志（mono 预格式块，自动滚底可暂停）；文件清单在任务推进中增量出现。
- **状态文案全站统一**：排队中/运行中/已完成/部分失败/失败/已取消，chip 带文字+语义色，不只用颜色。
- **常驻边界声明**：侧栏底部 + 状态栏「本机运行 · 数据仅保存在本机 data/ 目录」。

### 一键启动 `.command`（v1 完成后开发）

- 根目录 `启动采集工作台.command`：参考 deep-research 实现——`cd "$(dirname "$0")"`；无 `node_modules` 则 `pnpm install`；无 `apps/workbench/web/dist` 则 `pnpm --filter workbench build`；启动 `pnpm --filter workbench start`（后台、记录 PID、trap EXIT 清理）；循环 curl 探活 `/api/tasks` 后 `open http://127.0.0.1:4173`；`wait` 挂住脚本。
- 脚本内自检：无 `node`/`pnpm` 时输出中文指引（安装指引文案）并以非零码退出，不静默失败。
- 中文文件名与 deep-research 保持一致风格。

## Testing Decisions

好测试的标准：只测外部行为（API 响应、事件流、校验结果、文件产物），不测内部实现；网络一律不真打（在 Runner/HTTP seam 上替身）。

- **爬虫 --json 改造**：在既有 `http.ts` fetch 封装层替身（项目现有 seam），驱动 main 流程断言 stdout 的 NDJSON 事件序列（类型、字段、顺序）；另断言默认模式输出不变。
- **共享校验函数**：参数化测试覆盖 CLI validate 的全部规则（互斥、成对、格式、下限），与 CLI 校验对拍（同一批用例两边跑）。
- **Queue**：fake runner（可控成功/失败/慢取消）测串行性、状态迁移、取消语义、tasks.json 落盘与重启恢复。
- **API 层**：Hono `app.fetch` 直接发请求（不起监听），覆盖任务创建校验失败 400、dry-run 流程、文件下载 404 防护（路径穿越）、cancel 语义。
- **前端**：只测纯函数（校验、参数→CLI argv 映射、状态文案映射）；组件不做快照测试。
- 测试框架：Node 内置 `node:test`（爬虫与 server 都是 ESM/TS，tsx --test 可直接跑；不引 vitest 以减少依赖——若 tsx --test 对 TS 支持有坑再降级为 vitest，记录在案）。

## Out of Scope

定时采集、第二数据源接入、局域网共享/多用户、桌面 App 打包、结果数据二次加工（Excel 汇总导出）、前端组件级测试、暗色主题。

## Further Notes

- 红队 top 假设的测试节点：①「制造业 2024 年报 dry-run 计时」安排在爬虫 --json 改造完成后顺手实测（数据记入 tasks.md 对应任务）；②运营陪同观察在 v1 交付后进行。
- 若 `--json` 改造被迫重写爬虫核心（kill 假设 3 触发），降级方案：server 解析爬虫默认 stdout 文本——该降级需升级回 proposal 层讨论（escalate），不自行其是。

## GRILL 已决开放问题（self-grill，全部按推荐定案；无一项触碰 proposal 已决决策，无升级项）

1. **公司补全数据来源**：server 自行 HTTP 拉取巨潮 `szse_stock.json`，内存缓存 TTL 1 天；拉取失败时用旧缓存（stale-while-error），无缓存可用时 `/api/meta/stocks` 返回 503 + 中文提示；不阻塞任务创建（公司名在爬虫运行时仍可解析）。理由：保持爬虫包自包含，不跨包 import 其 HTTP 层。
2. **行业门类清单来源**：workbench server 直接相对路径 import 爬虫 `industries.ts` 的纯数据数组（无运行时依赖、tsx 可加载），单一事实源零漂移；不复制副本、不给爬虫加导出接口。
3. **取消运行中任务的文件一致性**：SIGTERM → 5s 宽限 → SIGKILL；任务标 `canceled`；详情页披露「最后一份文件可能不完整」；半成品文件保留在现场，不清理不重试。
4. **任务数据清理策略**：v1 不做自动清理/归档；任务文件清单以磁盘实时扫描为准（tasks.json 不冗余记录文件列表，避免双写不一致）。
5. **zip 打包实现**：spawn macOS 系统 `zip -r -q - .`（任务输出目录为 cwd），stdout 流式直出响应；零新依赖、无临时文件；macOS-only 与仓库使用场景一致。
6. **SSE 断线恢复**：前端断线重连时先 `GET /api/tasks/:id` 全量对齐，再续事件流；server 侧从 `logs/<taskId>.ndjson` 回放历史事件后接实时事件。
7. **任务命名**：运营不填名称；server 自动生成范围摘要（如「金融业 · 2024 · 年报 · 09-27 14:30」）。
8. **预览任务生命周期**：预览是独立任务（标注「预览」，进历史列表），正式采集另建新任务；不复用预览任务的状态，简单可审计。

### IMPLEMENT 期间增补（任务 1 落地时确认，纯增量不改既有决策）

9. **--json 事件契约增补 `queryError`**（target/reason）：检索目标级失败必须如实披露（规范第三条），对原 5 类事件是纯增量。
10. **预览确认页展示预计最短时长**（报告数 × 请求间隔下界）。实测依据（红队假设 1 数据点，2026-09-27 真实巨潮）：制造业 2024 年报 dry-run = 1434 家公司 / 1452 份报告 / 查询仅 28.4s；正式下载 1452 份 × ≥1s 间隔 ≈ 25 分钟起。结论：预览快（<1 分钟）、大门类正式任务小时级——UI 必须给时长预期，队列串行设计不变。
