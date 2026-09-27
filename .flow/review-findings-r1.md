# REVIEW 发现（code-reviewer 子代理返回，逐字存档；2026-09-27，基线 d32b130）

## 审查结论
PASS — 对照 proposal/PRD/tasks 三个规范工件审查了基线 d32b130 之后的全部未提交改动（爬虫 `--json` 改造 + 新增 apps/workbench + 一键启动脚本），验证命令全部亲自重跑且与 `.flow/state.json` 记录的证据一致；未发现阻断性问题，发现 10 条建议级偏差（3 条触及规范轴明文条款）。

验证实测（本人重跑，非引用记录）：`pnpm -r run typecheck` 双包通过；`pnpm -r test` crawler 6 绿 + workbench 35 绿；`pnpm --filter workbench build` 成功（vite 7.3.6，39 模块）。与记录证据（exit 0 / 6 / 35 / build 成功）完全相符，无虚假证据。

## 阻断性问题（BLOCKER）
无。

## 建议改进（SUGGESTION）
按严重级排序；每条标注归属上游阶段与一行复查标准。

- [中] `apps/workbench/web/src/views/TaskDetail.tsx:170` 运行中文件清单不增量刷新 — `refreshKey={task.status}` 只在状态迁移时变化，running 期间（大门类任务可达小时级）清单一直显示「还没有产出文件」，违反 PRD 前端节「文件清单在任务推进中增量出现」。归属：implementation（PRD）。复查标准：running 状态下新下载文件无需手动刷新即可出现（如以 `counts.downloaded + counts.skipped` 或定时器作为 refreshKey）。

- [中] `apps/workbench/server/queue.ts:197` + `NewTask.tsx:325` 预览任务检索失败被吞为「已完成」— `classifyDone` 对 dryRun 恒返回 `succeeded`；NewTask 阶段 2 只在 `status !== 'succeeded'` 时才展示失败卡，于是 queryError（如巨潮查询 400/断网一半）的预览显示「共匹配 0 家公司、0 份报告」并给出「开始采集」按钮，failures 只在详情页可见。触碰 proposal 决策 3「失败如实披露」。归属：implementation（proposal 级约束）。复查标准：dryRun 的 done 含 failed>0 时状态为 partial/failed，或 NewTask 预览卡直接展示 `previewTask.failures`。

- [低] `apps/workbench/web/src/App.tsx:154` 界面出现禁词「任务参数」— proposal 决策 3 与 tasks.md 切片 2 验收均要求「界面无『爬虫/CLI/参数』字样」，Inspector 标题违规（已全站 grep，仅此一处）。归属：implementation（spec 级约束）。复查标准：`rg "爬虫|CLI|参数" apps/workbench/web/src/` 命中 0 处。

- [低] `apps/workbench/test/task-params.test.ts:1` 对拍测试名不副实 — 头注释与 tasks.md 切片 2 验收均称「与 CLI validate 规则对拍」，PRD Testing Decisions 要求「同一批用例两边跑」，实际只测了共享函数单侧；人工核对两边规则当前一致，但漂移无防线。归属：verify/implementation。复查标准：存在同一批用例同时驱动 `cli.ts validate` 与 `validateTaskParams` 的断言。

- [低] `apps/workbench/server/app.ts:191` reveal 用 `open <dir>` 而非 PRD 契约的 `open -R`（打开目录内容 vs 在 Finder 中选中该目录）；`files.test.ts:87` 注释自称「open -R 的替身」与实现不符。归属：implementation（PRD API 契约）。复查标准：`spawn('open', ['-R', dir])` 或回写修订 PRD 措辞。

- [低] `apps/workbench/server/index.ts:28` 端口被占时无友好报错 — `serve()` 无 EADDRINUSE 处理，`pnpm start` 直起会裸栈崩溃；`.command:65` 有中文提示但未按 PRD 要求「提示用环境变量 PORT 改端口」。归属：implementation（PRD 端口节）。复查标准：占用场景输出包含「PORT」字样的中文指引。

- [低] `apps/workbench/web/src/views/NewTask.tsx:330` 预计最短时长仅 `estimateMin >= 5` 才显示 — GRILL 已决项 10 要求预览确认页展示预计最短时长（无条件）；小预览（1 家/1 份）无任何时长预期。归属：implementation（PRD GRILL#10）。复查标准：任意成功预览均展示估算时长文案。

- [低] `apps/workbench/server/queue.ts:130` `handle.done.then(...)` 无 `.catch` — Runner seam 的 `done` 若拒绝（生产 spawnRunner 不会，但接口未约束），产生 unhandledRejection 且 `active` 永不清空、队列停摆。归属：implementation。复查标准：拒绝路径落 `failed` 并继续 `pump()`。

- [低] `apps/workbench/server/runner.ts:29` 未监听 child `'error'` 事件 — spawn 同步失败（ENOENT 等）会抛 unhandled 'error' 使 server 崩溃；当前 command 恒为 `process.execPath` 故不可触发，属 seam 健壮性缺口。归属：implementation。复查标准：'error' 转为 error 事件行并 resolve `done`。

- [微] 杂项归并：`TaskDetail.tsx:13` 的 `onChanged` prop 声明后从未调用（死代码）；`summarizeTask`（task-params.ts:87）缺 GRILL#7 示例中的时间后缀（侧栏已单列创建时间，可接受）；`package.json` 的 `dev` 只起 server 不并行 vite（PRD 架构节称 dev 并行起前后端，README 与实际一致、可接受）；`app.css` 有 4 处裸 hex（`#fff`、`#1f1e1b` 等，值与 token 相同，UI 视觉超范围仅记录）。归属：implementation。复查标准：死 prop 删除；其余可回写规范或忽略。

## 待确认（UNVERIFIED）
- `.command` 的四个分支（PATH 自愈/首跑构建/重复启动/Ctrl+C 清理）是 tasks.md 记录的手工实测声明；`kill $SERVER_PID` 杀的是 pnpm 包装进程，子进程清理依赖同一前台进程组的信号扩散——无法在不拆除本机环境的前提下复核，依赖作者实测记录。
- `resolveInside`（app.ts:52）不解析符号链接：outDir 内若存在指向外部的 symlink 可绕过前缀检查。当前目录只由爬虫写入 PDF，利用需本机写权限，评估为低风险，未列为发现。

## 覆盖确认
- 已检查：`.flow/proposal.md`、`prd.md`、`tasks.md`、`state.json` 全文；10 个修改文件的全部 diff（含 `main.ts` 逐行核对其改造仅限注入事件发射点、默认模式输出路径未动）；apps/workbench 全部 31 个新增文件（server/shared/web/test 全读）；`启动采集工作台.command` 全文；tokens.css 与 `~/.zcode/design/DESIGN.md` token 值逐项核对（一致）；重跑 verify 命令三条并读取完整输出；`git check-ignore` 实测 `data/`、`web/dist` 已忽略；安全面（路径穿越单测含编码绕过用例并通过、spawn 全数组参数无 shell 注入、无用户控 URL 的 SSRF、仅绑 127.0.0.1 已核实）。
- 未检查：UI 渲染与视觉（派发方明确出范围）；真实巨潮网络冒烟（不触网原则）；`pnpm-lock.yaml` 881 行逐行内容；macOS 手工场景（Finder 双击、ditto 解压 zip——tasks.md 已记录人工验证）。
