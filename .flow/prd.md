# PRD — 执行治理收尾批（N2 预算定容 + Ctrl-C 孤儿清理）

- 规格 precedence：`.flow/proposal.md` ＞ 本文件；红队 `.flow/red-team.md`（GO-WITH-CONDITIONS，6 条件）已逐条吸收并标注。
- 发布方式：无 issue tracker，落盘 `.flow/prd.md`（既有惯例）。

## Problem Statement

两处执行治理硬伤：①api-connector 的 BudgetGate 仍是分页时代定容（`maxCalls = maxPages + 5`），WC-AR-05 起每跳计费+附件下载同池后——红队探针实证出厂预设（pageSize=20/maxPages=10 → 配额 15）第 5 个附件即熔断、页 2 条目静默少收（matched 10≠20）；且只调 maxCalls 不够——默认 maxTokens 50000 给出 500 跳硬顶。②Ctrl-C/关窗杀 workbench 后 detached 爬虫成孤儿继续采集（探针实证 ppid=1 独立 pgid）。

## Solution

①预算分池：分页/下载各自配额、覆盖每页 1+5 跳 worst-case、显式关闭无意义的 token/cost 计费——熔断只在真实失控时发生。②server 信号处理（SIGINT/SIGTERM/SIGHUP）：terminate 活动子进程组 → flush 队列 → 退出；被关停任务保持 running 态落盘，下次启动按既有重启恢复语义标中断失败。

## User Stories

1. 作为运营人员，我想跑多附件接口采集时所有附件都下载成功（而不是第 5 个起熔断），以便任务产出完整。
2. 作为运营人员，我想让预算熔断只在真实失控（超大任务）时发生，而不是被默认 token 上限误伤。
3. 作为运营人员，我想按 Ctrl+C 或关窗口退出工作台时爬虫子进程被一并收割，不留孤儿继续占资源。
4. 作为运维，我想让被服务关停中断的任务在下次启动时如实标「中断失败」，而不是伪装成正常完成或用户取消。

## Implementation Decisions

### N2 预算分池（红队条件 1+2）

1. **双 BudgetGate 分池**（BudgetGate 现有 API 足够，不改 data-governance）：
   - **分页池**：`maxCalls = maxPages × (1 + MAX_REDIRECT_HOPS)`（每页最多 1+5 跳 worst-case，探针 B2 实证 `+5` 常数不够）；
   - **下载池**：`maxCalls = pageSize × maxPages × (1 + MAX_REDIRECT_HOPS)`（条目数上限 × 每条下载跳上限；fail-closed 熔断顶而非资源分配）。
2. **token/cost 显式关闭**（条件 1）：两池均 `maxTokens: undefined, maxCostUsd: undefined`（api-connector 无 LLM，token 估计无意义；探针 C 实证默认值造成 500 跳硬顶）。>500 总跳用例佐证不出现 `TOKENS_EXCEEDED`。
3. **guardedFetch 每跳计费语义保留**（WC-AR-05 G4），调用方按场景传入对应池：分页请求→分页池；附件下载→下载池。重定向跳计入所属请求的池。
4. **matched 静默少收随公式修复自然消失**（页 2 分页不再熔断 → 条目正常计数）；补一条断言钉死（探针 A 的 matched=10≠20 反例）。

### 终态语义（红队条件 3）

5. **分页池熔断 → `queryError` + failed 计入，终态走既有 classifyDone**（有产出 partial、无产出 failed）。论证以「如实呈现」为标准（**不引用「恢复旧语义」**——红队 KA2 实证旧 error→failed 路径是不可达死代码）：预算熔断是己方策略性停止，如实计入采集失败；**与 rss-collector 先例显式对齐**（其预算熔断同归 queryError，两引擎分类不分叉）。`[BudgetGate]` reason 前缀保持可识别。下载池熔断 → 附件 `file failed`（现状不变）。

### Ctrl-C 关停（红队条件 4+5）

6. **信号集 = SIGINT + SIGTERM + SIGHUP**（SIGHUP 覆盖启动器文档化的「关闭本窗口」退出路径，否则该路径仍泄漏孤儿——KA4）；**双击强退**：第二信号立即 `process.exit(130)`，不再等待 flush。
7. **shutdown 机制唯一化（三选一裁决）**：走 **terminate 而非 queue.cancel**——仅终止活动任务子进程组（复用 runner terminate/cancel 句柄），**不改写任务状态**，`await queue.close()` flush 日志/状态链后退出。被关停任务磁盘态保持 `running` → **下次启动按既有重启恢复语义标「服务重启导致任务中断」（failed）**——与提案决策 2 的可观测结果句一致；canceled 语义保留给「用户取消单个任务」，关停中断不冒充。需要 `TaskQueue` 增一个不改写状态的中断方法（如 `interruptActive()`，调用 `active.handle.cancel()`），纯加法。
8. **测试形态（条件 6）**：导出可注入依赖的 `installSignalHandlers({ queue, exit })` 例程（server/shutdown.ts），单测落 queue.test 既有基建（Runner fake + tmp dataRoot）；三个信号参数化各一断言 + 双击强退 + 「下次启动标中断失败」两阶段断言。**不做子进程级 e2e**（dataRoot 硬编码无 seam，红队 KA5 kill 判据）。

## Testing Decisions

- N2：recheck 场景（maxPages=2、单页 10 附件、注入 fetchFn）全部下载成功 + matched=20；redirect 密集分页用例（探针 B2 场景）不熔断；>500 总跳用例无 TOKENS_EXCEEDED；分页熔断事件分类断言（queryError，终态 classifyDone）。
- Ctrl-C：installSignalHandlers 单测（三信号/双击/两阶段重启语义）。
- 新增测试净计数约 +6（N2×4 + shutdown×2）；基线 205 零回退；全量门禁 `pnpm test && pnpm typecheck && pnpm build`；timing 敏感用例偶发 flake 复跑一次（红队 V3 政策）。

## Out of Scope

N5/N6 其余、FA1/FA2、view-desc、firecrawl budget-gate 副本去重（N5 邻域）、AgentReachBridge、server dataRoot env 覆盖 seam（若未来要子进程 e2e 再补）。

## PRD Diff Gate（auto 模式，2026-10-16）

1. 分池公式与 token/cost 关闭（条件 1+2 落定，开放问题 1 裁决=分池，理由：BudgetGate 现有 API 免改治理包）——增量。
2. 终态语义=queryError+classifyDone（条件 3，开放问题 2 裁决；与 rss 显式对齐）——增量。
3. 信号集 +SIGHUP（条件 4，开放问题 4 落定）——增量。
4. shutdown 三选一=terminate 保 running 态（条件 5，开放问题落定；**与提案决策 2 可观测结果句一致**：下次启动 running→中断失败）——增量。
5. 测试形态=例程单测（条件 6，开放问题落定）——增量。
6. matched 少收随公式修复 + 断言钉死（探针新发现的附加验收）——增量。

无变更/丢弃提案已定决策；无需升级。

## GRILL 决议附录

### Round 1（作者盲审子代理 5 包，主代理核验后全采纳，2026-10-16）

- **G1（Q1）interrupting 标志封双竞态（阻塞项）**：`TaskQueue` 加私有 `interrupting` 标志，`interruptActive()` 同步置位——`onProcessDone` 在标志下跳过状态改写（running 原样落盘）、`pump()` 在标志下拒绝再调度（关停瞬间不拉起新任务造孤儿）；用户 `cancel(id)` 路径不动。这是对 PRD 决策 7「不改写状态」承诺的必要守卫——否则 done 落定后 onProcessDone 会把 running 静默改写为 failed「采集进程异常退出」。
- **G2（Q2）关停等待子进程落定**：`interruptActive()` 内 `await handle.done` 再返回（SIGTERM→5s SIGKILL 兜底保证有界；done 落定后 `close()` 才能刷尾部日志行——runner close 时冲刷残留 buf/stderr）；顽固子进程由既有 SIGKILL 升级收割，双击 `exit(130)` 是逃生门。不做自设超时（与既有宽限重复），不做 fire-and-forget（孤儿只修一半）。
- **G3（Q3）例程单测形态**：`installSignalHandlers({ queue, exit })` 真 `process.on` 注册三信号 + 返回 uninstall（防测试污染）；测试用 `process.emit(sig)` 发假信号（覆盖真实注册面——SIGHUP 漏注册可被测出）；双击强退 flag 在例程闭包内同步置位（queue 不感知信号）。注入面维持 `{ queue, exit }` 不扩。
- **G4（Q4）两阶段断言构造**：沿用 fakeRunner（cancel→resolveDone，生产忠实）+ G1 守卫——waitFor done 落定后读 raw `tasks.json` 断言 `status === 'running'`，再 `q2.init()` 断言 `failed`／`服务重启导致任务中断`（与既有重启用例拼完整两阶段）；断言对象是**磁盘 raw**（PRD 承诺对象）而非内存态。
- **G5（Q5）N2 熔断断言的确定性触发**：`RunApiConnectorOptions` 加可选预算注入 `budgets?: { pagination?: BudgetCounter; download?: BudgetCounter }`（缺省按公式建双池；与 fetchFn 注入先例同形）——测试传 maxCalls=1 小池确定性驱动熔断，断言 queryError + `[BudgetGate]` reason 前缀 + summary.failed 全链路。新公式下生产路径分页熔断不可达（worst-case 恰等配额），注入是唯一真实触发器。classifyDone 归宿由 queue.test 既有「失败分级」用例脚本补一行覆盖，不另起引擎用例。

### Round 2（主代理 2 包，2026-10-16）

- **G6 退出码**：优雅关停（信号处理完整走完）→ `process.exit(0)`；双击强退 → `exit(130)`（128+SIGINT 惯例，对 TERM/HUP 同值统一）。
- **G7 budgets 注入缺省语义**：`budgets` 整体缺省或某池缺省时按 PRD 公式建池（分页 `maxPages_eff × 6`、下载 `pageSize_eff × maxPages_eff × 6`，有效值取 clamp 后）；显式传入的池完全替换该场景池（测试用小池语义）。

**GRILL 收敛**：Round 2 后无新增开放问题，2 轮收敛。
