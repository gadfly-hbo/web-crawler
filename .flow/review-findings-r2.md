# REVIEW 第 2 轮发现（code-reviewer 子代理返回，逐字存档；复审修复轮）

## 审查结论
PASS — 复审基线 d32b130 之后全部未提交改动中的 10 项第一轮发现处置，逐条核验均真实落地；验证命令亲自重跑与 `.flow/state.json` 记录证据（exit 0、crawler 6 绿、workbench 46 绿、build 成功）完全相符：本轮实测 typecheck exit 0、`pnpm -r test` crawler pass 6 / fail 0、workbench pass 46 / fail 0、`pnpm --filter workbench build` 成功（vite 7.3.6，39 模块，248.53KB）。测试数 35 → 46 与新增用例数（parity 8 + queue 2 + runner 1 = 11）精确吻合，无虚假证据。无阻断性问题。

## 十条处置逐项核验结果
1. **增量刷新 — 成立**。TaskDetail.tsx:169 refreshKey=`${task.status}:${task.counts.downloaded + task.counts.skipped}`；FileList.tsx:19-27 useEffect 依赖 refreshKey 触发重取；失败事件不产文件、无需触发，键选择正确。
2. **预览失败被吞 — 成立，状态机边界安全**。queue.ts:192 `if (task.status === 'running')` 守卫使 classifyDone 只在 running 生效；classifyDone(:207-215) 对 dryRun 按 `summary.matched` 判 partial/failed，与爬虫 main.ts 实际发出的 summary 字段契约一致。NewTask.tsx:355-375 新增 partial 卡（列失败原因 + 已匹配计数 +「仍要采集」），:376 兜底 failed/canceled。queue.test.ts:208 双侧（partial/failed）有测试。
3. **禁词 — 成立**。`rg "爬虫|CLI|参数" apps/workbench/web/src/` 命中 0；App.tsx:154 已改为「采集条件」。
4. **对拍测试 — 成立**。test/parity.test.ts 8 个拒绝用例，CLI 侧真实 spawn 断言非零退出，共享侧断言 `validateTaskParams` 非空；逐用例核对两侧规则判定一致。
5. **open -R 措辞 — 成立**。prd.md:51 已回写为「实现用 macOS `open <目录>`」并注明 REVIEW 修订；files.test.ts:87 注释同步；app.ts:191 实现 `spawn('open', [dir])` 与两处文档一致。
6. **EADDRINUSE — 成立**。index.ts:32-39 error 监听输出含「PORT=4181」的中文指引并 exit 1。
7. **时长预估 — 成立**。NewTask.tsx:330-334 估算文案仅依赖 `estimateMin != null`（无条件显示），:335 的 `>= 5` 门槛只留给「任务量较大」警告卡，符合 GRILL#10。
8. **done 无 catch — 成立，并发正确**。queue.ts:136-146：catch 内先清 `active`、仅 `status === 'running'` 时落 failed、`onProcessDone` 落盘后 `pump()` 续调度；queue.test.ts:231 覆盖「标 failed + 队列不停摆」。
9. **child error — 成立**。runner.ts:51-55 'error' 转 error 事件行并 resolve done；:57 `exited` 标志防 'close' 二次结案；cancel(:65-66) 对已 error 进程幂等。runner.test.ts:54 有测试。
10. **死 prop — 成立**。全仓 `rg onChanged apps/workbench/` 0 命中，FileList props 仅 `taskId`/`refreshKey`。

## 阻断性问题（BLOCKER）
无。

## 建议改进（SUGGESTION）
- [apps/workbench/server/queue.ts:144] `void this.onProcessDone(next)` 在新增 catch 分支复制了既有的未处理拒绝模式 — onProcessDone 内 `await this.persist()` 若磁盘写失败会产生 unhandledRejection（Node 默认使进程崩溃）；.then 分支(:133) 同样存在，属修复轮放大的既有模式。归属：implementation。复查标准：两处 `void this.onProcessDone(...)` 改为 `void this.onProcessDone(...).catch(() => {})` 或等效吞盘错误的兜底。
- [apps/workbench/web/src/views/NewTask.tsx:378] 兜底失败卡在 `error` 与 `failures` 均空时（如预览任务被他处取消）显示「预览失败：」加空白 — `''.join` 结果为空串不触发 `?? '未知原因'` 回退。归属：implementation。复查标准：join 结果为空串时回退到「未知原因」或对 canceled 单独出文案。
- [apps/workbench/test/parity.test.ts:18] 子进程未监听 'error' 事件 — 当前 command 恒为 `process.execPath` 不可触发，仅作 seam 记录（与第一轮 runner.ts 同类缺口、严重度更低）。归属：implementation。复查标准：可不修；若修，child.on('error', () => resolve(false))。

## 待确认（UNVERIFIED）
- server/index.ts:32 的 EADDRINUSE 分支无自动化测试，依赖 @hono/node-server 的 serve() 返回值透传 http.Server 'error' 事件——代码层面签名吻合，实际占用场景未亲测。
- 第一轮遗留的两条 UNVERIFIED（.command 信号扩散、resolveInside symlink）维持原状。
