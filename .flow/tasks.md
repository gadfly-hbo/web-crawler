# 任务拆解：数据采集工作台 v1 + 一键启动

> 源：`.flow/prd.md`（含 GRILL 已决项）。无 issue tracker，本文件为任务事实源。

## 清单

- [x] 1. 爬虫 `--json` 事件流改造
- [x] 2. workbench 骨架 + 新建任务 + 任务列表（端到端贯通；真实爬虫 dry-run 冒烟通过：预览 1 家/1 份）
- [x] 3. 任务详情：实时进度、日志、取消、失败披露（真实采集 + SSE + 取消冒烟通过；路由命名空间改 `/api/task/:id` 规避 RegExpRouter 静态/参数段冲突）
- [x] 4. 文件服务：清单、下载、zip、Finder（真实服务器冒烟通过；zip 中文名经 ditto 解压验证）
- [x] 5. 一键启动 `.command` + 文档收尾（PATH 自愈/首跑构建/重复启动/Ctrl+C 清理四个分支实测通过）

---

## 1. 爬虫 `--json` 事件流改造

**Blocked by**: 无（可立即开始；同时是红队假设 3 的 cheapest test）

**User stories**: 19（CLI 行为不变）

### What to build

`crawlers/cninfo-reports` 新增 `--json` flag：开启后所有人类可读输出替换为 NDJSON 事件流（每行一个 JSON 对象），事件类型：`start`（totalCompanies）、`company`（index/total/code/name）、`file`（status: downloaded/skipped/failed + code/name/reportType/title/path/bytes/reason）、`preview`（dry-run 模式：companies/reports 计数）、`done`（summary 汇总）。默认模式输出逐字节不变。改造方式限定为在 main.ts 主循环注入事件发射点，不重写 cninfo.ts 查询/下载核心（触发重写则升级回 proposal 层）。

完成后顺手实测：制造业 2024 年报 `--dry-run` 计时与匹配量，结果记入本任务的完成备注（红队假设 1 数据点）。

### Acceptance criteria

- [ ] `--json --dry-run` 输出合法 NDJSON，含 preview 事件（companies/reports 计数正确）
- [ ] `--json` 正式跑输出 start/company/file/done 全序列，字段齐全
- [ ] 不传 `--json` 时 stdout 与改造前格式一致（人读文本）
- [ ] 参数校验失败在 --json 模式下输出 `{type:"error",message}` 并非零退出
- [ ] node:test 单测覆盖事件序列（http 层替身，不真打网络）；`pnpm --filter cninfo-reports run typecheck` 通过

## 2. workbench 骨架 + 新建任务 + 任务列表

**Blocked by**: 1（依赖 --json 事件契约）

**User stories**: 3, 4, 5, 6, 7, 8, 9, 10（部分）, 18, 20

### What to build

新增 `apps/workbench`（pnpm workspace 包，`pnpm-workspace.yaml` 加 `apps/*`）：`server/`（Hono，仅绑 127.0.0.1:4180）+ `web/`（Vite+React+TS，无 UI 组件库无路由库，Xanthil tokens 落 CSS 变量）+ `shared/`（TaskParams 校验纯函数，规则与 CLI validate 对齐，前后端共用）。

端到端切穿：新建任务表单（公司搜索补全多选 chip ← `GET /api/meta/stocks` server 缓存巨潮清单 TTL 1 天 stale-while-error；行业门类下拉 ← import 爬虫 industries.ts 数据；年份/日期互斥；类型复选默认全选；高级折叠 sleepMs/limit）→「预览数量」提交 dryRun 任务 → `POST /api/tasks`（共享校验，失败 400 中文文案）→ 串行队列（内存队列+单 worker，状态机 queued→running→succeeded|partial|failed|canceled）→ Runner spawn 子进程跑爬虫 `--json`（任务输出 `-o data/cninfo-reports/<taskId>`）→ 任务列表视图（卡片：摘要名/进度/状态 chip；空状态引导）。元数据落盘 `data/workbench/tasks.json`，日志落盘 `data/workbench/logs/<taskId>.ndjson`。三栏外壳 + 状态栏常驻边界声明。视图用 URL hash 同步。

### Acceptance criteria

- [ ] `pnpm --filter workbench dev` 起前后端；表单全部校验规则与 CLI 一致（共享函数对拍测试）
- [ ] 创建一个 dryRun 预览任务，列表出现该任务并随队列推进状态，完成后展示「N 家公司、M 份报告」
- [ ] 公司补全支持名称/代码/拼音模糊匹配；巨潮不可达时 503 中文提示且不阻塞表单其他部分
- [ ] tasks.json 在状态迁移时落盘；重启 server 后历史任务可见
- [ ] 界面无「爬虫/CLI/参数」字样；侧栏底部+状态栏有本机边界声明
- [ ] Queue 单测（fake runner）：串行性、状态迁移、重启恢复；API 测试：校验 400、路径白名单

## 3. 任务详情：实时进度、日志、取消、失败披露

**Blocked by**: 2

**User stories**: 10（补齐）, 11, 12, 13, 14

### What to build

任务详情视图：进度条（x/N 公司）+ 下载/跳过/失败计数 + 实时日志滚动区（mono，自动滚底可暂停）+ 文件清单增量出现。SSE：`/api/tasks/:id/events`（server 从 logs/<id>.ndjson 回放后接实时）与 `/api/tasks/events`（列表级）；前端断线先 GET 全量对齐再续流。取消：queued 出队 / running 时 SIGTERM→5s→SIGKILL，文案「已下载的文件会保留」；结束后失败公司与原因用 fail-soft 卡列出（含「最后一份文件可能不完整」披露）。

### Acceptance criteria

- [ ] 运行真实采集任务（如平安银行 2024 年报），详情页进度/计数/日志实时刷新，与爬虫实际输出一致
- [ ] 取消 running 任务：状态变「已取消」，已下载文件保留在磁盘，披露文案出现
- [ ] 构造失败场景（如断网或无效公司）：任务标「部分失败/失败」，失败清单含原因
- [ ] SSE 断线重连后状态不丢（先全量对齐再续流）
- [ ] Queue/取消语义有 fake-runner 单测覆盖（SIGTERM 超时升级 SIGKILL 用可注入时钟/信号替身测）

## 4. 文件服务：清单、下载、zip、Finder

**Blocked by**: 2（任务与输出目录约定）；建议 3 之后做（详情页复用文件清单组件）

**User stories**: 15, 16, 17

### What to build

数据文件视图 + 详情页文件清单后端：`GET /api/tasks/:id/files`（磁盘实时扫描，名称/大小/修改时间）、`GET /api/tasks/:id/files/:path`（单文件下载，resolve 后强制前缀检查防路径穿越）、`GET /api/tasks/:id/archive`（spawn 系统 `zip -r -q - .` 流式输出）、`POST /api/tasks/:id/reveal`（macOS `open -R`）。前端：文件清单组件（图标+名称+大小 chip+操作）、详情页与独立文件视图复用。

### Acceptance criteria

- [ ] 文件清单与磁盘实际一致（手工删文件后刷新即消失）
- [ ] `../` 路径穿越请求返回 400/404（有测试）
- [ ] zip 下载可解压且内容完整；reveal 调起 Finder（macOS 人工验证）
- [ ] 空目录任务显示空状态而非报错

## 5. 一键启动 `.command` + 文档收尾

**Blocked by**: 2, 3, 4（v1 全部完成后）

**User stories**: 1, 2

### What to build

根目录 `启动采集工作台.command`（参考 `~/DevWorkSpace/Projects/deep-research/启动深度研究.command`）：cd 脚本目录 → 无 node/pnpm 时中文指引并非零退出 → 首跑自动 `pnpm install` 与 `pnpm --filter workbench build` → 起 `pnpm --filter workbench start`（后台 PID + trap 清理）→ 探活 `/api/tasks` → `open http://127.0.0.1:4180` → wait。文档：根 README 增加 `apps/` 结构约定、工作台章节（双击启动/命令行启动两种方式）；`apps/workbench/README.md`（开发模式、端口、数据位置）。`.gitignore` 确认 `data/`、`web/dist` 不入库；`.flow/state.json` 加进 .gitignore。

### Acceptance criteria

- [ ] 删除 node_modules 与 web/dist 后双击脚本，全自动完成安装/构建/起服务/开浏览器
- [ ] 无 pnpm 环境（PATH 临时置空模拟）输出中文指引且退出码非零
- [ ] Ctrl+C 或关闭终端后服务进程被清理（无孤儿）
- [ ] README 与实际行为一致（命令逐条可复现）
