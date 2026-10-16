# Red-Team: 执行治理收尾批（N2 api-connector 预算定容 + Ctrl-C 孤儿爬虫关停清理）

- **日期**：2026-10-16
- **提案**：`/Users/huangbo/Dev/Projects/web-crawler/.flow/proposal.md`（完整阅读）
- **评审对象仓库**：main @ `5b762d4`，只读评审 + `/tmp` 探针实证（探针目录 `/tmp/n2probe/`，评审后无残留进程）
- **方法**：按 `strategy-red-team` 技能——提取承重 claim → steelman → 攻击，按 影响 × 可能性 × 验证成本 排名；所有 N2/Ctrl-C 关键断言均以仓库代码与可执行探针实证。

## 基线验证（全部实跑）

| 项 | 结果 |
|---|---|
| `pnpm test` 全量 | **205/205 绿**（data-governance 10 + firecrawl 27 + api-connector 20 + rss 32 + cninfo 14 + workbench 102），与提案基线一致 |
| N2 recheck 场景现状（探针 A：maxPages=2、单页 10 附件、注入 fetchFn） | **6/20 下载成功**；页 1 末 4 附件 `file failed`（reason=`[BudgetGate] CALLS_EXCEEDED`）、页 2 分页 `queryError`（同 reason）、`done` 事件、reducer 复算终态 **partial**；无 `error` 事件；`matched=10`（页 2 的 10 条**从未被计数**——静默少收） |
| 纯分页重定向密集（探针 B2：maxPages=3、每页 1+5 跳、dryRun 零下载） | 页 1 耗 6 跳后页 2 第 3 跳熔断 → `queryError` → partial。**即公式 `maxPages+5` 在每跳计费下连自己的原场景（纯分页）都不够** |
| 默认 token 上限陷阱（探针 C） | `new BudgetGate({ maxCalls: 1000 })` 在**第 501 跳**以 `TOKENS_EXCEEDED`（49900+100 > 50000）熔断；显式 `maxTokens: undefined, maxCostUsd: undefined` 后 600 跳全过 |
| detached 孤儿实证（探针 D，macOS） | 父进程退出后子进程存活，**ppid=1、自成 pgid**（setsid 会话）；`kill -TERM -pgid` 收割成功——runner 既有 `terminate` 机制直接可用 |
| 真实启动链信号传递（探针 E/E2） | 链为 `pnpm → tsx CLI → node 孙进程` 三层；对该孙进程或对 pnpm 顶层发 SIGINT，**整链 ~14ms 全退**——无信号吞噬，但 e2e 断言须定位**孙进程** pid |
| 「语义漂移」历史核验（git `15950a3` vs 当前） | 旧引擎 `checkAndReserve` 确在内层 try 之外（熔断将 → `error` 事件 + rethrow）——**但旧引擎下载完全不进预算池，`callsMade ≤ maxPages < maxCalls`，该路径永不可达，是死代码**（详见 KA2） |

## Top Kill-Assumptions（按 影响 × 可能性 × 验证成本 排序）

### 1. 「N2 修复 = 重新定容 maxCalls 公式」——只调 maxCalls 修不完，>500 跳仍熔断

- **Claim**：决策 1/开放问题 1 的两个候选（分池 / 单池重定容）都是 **maxCalls 公式**问题。
- **Steelman**：recheck 判据场景（2 页 + 20 附件 = 22 跳）远小于 500，公式修好后 recheck 确实会绿；提案也明确预留了公式裁决空间，没有把公式写死。
- **Fails if**：`BudgetGate` 构造只传 `maxCalls` 时继承默认 `maxTokens: 50000`（每跳记 100 token → **500 跳硬顶**）与 `maxCostUsd: 0.20`（每跳 0.0002 → 1000 跳硬顶）。引擎上限场景 maxPages=200 × pageSize（校验仅要求 ≥1、无上界）→ 合法任务轻松 >500 跳 → 修复后大任务仍以 `TOKENS_EXCEEDED` 熔断，只是换了个熔断面孔。**本仓已踩过并解决过这个坑**：`crawlers/rss-collector/src/collector.ts` 用 `checkAndReserve(0, 0)` + `recordUsage({})` 中和默认估计；探针 C 证明 `undefined` 显式关闭亦可。
- **Kill criterion**：PRD 公式若只出现 `maxCalls` 而不处置 `maxTokens`/`maxCostUsd`（中和或按跳数放大），则 N2 在 maxPages=2 的验收内绿、在大任务上依旧熔断——修复不完整，PRD 打回补这一项。
- **Cheapest test**：引擎测试加一个 >500 总跳的重定向/多附件用例（现有 mock fetchFn 基建零成本），断言不出现 `TOKENS_EXCEEDED`。

### 2. 「分页期熔断语义漂移需要裁决恢复」——漂移为真，但「原先语义」是从未执行过的死代码，且分页池公式有同源缺陷

- **Claim**：决策 1 引 WC-AR-05 红队记录：「分页熔断原先 try 外抛出 → error 事件 + 整体 failed；现在被捕获为 queryError → 降为 partial——何为正确语义须裁决」。
- **Steelman**：漂移断言在**结构上完全属实**——核验了 `15950a3`（checkAndReserve 在内层 try 外）与当前代码（`guardedFetch` 在 try 内）；提案把它列为须裁决的开放问题而非预设答案，姿态正确。
- **Fails if**：裁决以「恢复原先语义」为论据。旧引擎**下载不进预算池**，`callsMade ≤ maxPages` 恒成立 → 旧 `error→failed` 路径**不可达、从未在生产执行过**——这是一次全新语义设计，不存在回归参照。且仓内已有直接先例：rss-collector 把预算熔断归为 `queryError` + `failed++` + 继续循环 → 终态走 partial/failed——与 api-connector **当前**行为一致。若裁决结果与 rss 相反（error→failed），两个引擎对同类事件的分类将分叉。
- **Kill criterion**：若把「回到 error→failed」写成「恢复历史语义」→ 论据不成立，须以「如实呈现」标准重新论证；若保留 queryError，须补「预算熔断 reason 可被识别」的说明或接受不可区分。
- **Cheapest test**：redirect 密集分页用例断言事件类型与终态——顺带钉死：**分页池若保留「+常数」形态公式，worst-case 需要 `maxPages × (1 + MAX_REDIRECT_HOPS)` 配额**（B2 已证 `+5` 不够）。

### 3. 决策 2 内部矛盾：「复用 terminate/cancel 路径」与「下次启动按 running→中断失败处理」指向三个不同的可观测终态

- **Claim**：决策 2 同时说「终止活动任务子进程组（复用既有 terminate/cancel 路径）」和「被关停任务在下次启动时按既有重启恢复语义处理（running → 中断失败）」。
- **Steelman**：两条都是既有代码路径（`queue.cancel()`：`queue.ts:141-148`；`handle.terminate`：`runner.ts:80-88`；重启恢复：`queue.ts:56-62`），「不新增状态」约束真实成立。
- **Fails if**：三条路径产出**三种不同终态**——(a) `queue.cancel(id)`：状态 `canceled` 并落盘 → 下次启动看到 canceled；(b) 仅 `handle.cancel()` 后等 done：`onProcessDone` 把 running 写成 `failed`（"采集进程异常退出"）；(c) 不等 flush 就退出：磁盘残留 running → 下次启动 `failed`（"服务重启导致任务中断"）。提案文字同时暗示 (a) 和 (c)。
- **Kill criterion**：PRD 不唯一化该选择并写明对应测试断言 → 打回一句话裁决即可。
- **Cheapest test**：GRILL 一行裁决；测试断言终态字串。

### 4. 「SIGINT/SIGTERM 两个信号集」漏了启动器自己文档化的另一半退出路径（SIGHUP）

- **Claim**：决策 2/开放问题 4 只列 SIGINT/SIGTERM。
- **Steelman**：Ctrl-C 与 `kill`（SIGTERM）确实是两大主路径，收窄信号集是克制的设计。
- **Fails if**：`启动采集工作台.command` 头部注释明写退出方式是「**关闭本窗口**或按 Ctrl+C」。关闭 Terminal 窗口向前台进程组发 **SIGHUP**；server 无 SIGHUP handler → 默认终止 → 修复后的清理代码不执行 → 孤儿依旧。而 detached 爬虫自成会话**不收终端 SIGHUP**——只有 server handler 能杀它。修复若不含 SIGHUP，启动器自述的退出路径一半仍泄漏孤儿。
- **Kill criterion**：信号集若定为仅 SIGINT/SIGTERM，须显式记录「关窗退出仍泄漏孤儿」为已知限制；否则补 SIGHUP 是一行成本。
- **Cheapest test**：shutdown 单测对三个信号各断言一次（同一例程，参数化）。

### 5. 「Ctrl-C 测试形态可选子进程级 e2e」——真实 server 子进程 e2e 缺隔离基建

- **Claim**：开放问题 4 把「直接对 server 入口发信号（子进程级 e2e）」列为候选。
- **Steelman**：探针 E2 证明真实启动链信号传递可靠，e2e 技术上跑得通；仓里已有真子进程测试先例。
- **Fails if**：三个隔离缺口——(a) `dataRoot` 硬编码自模块路径（`server/index.ts:13-15`），无 env 覆盖 → e2e 将读写**真实** `data/workbench/tasks.json`；(b) 制造「活动任务」需要长任务，而 server 入口无 fixture 注入 seam；(c) 真实链中 server 是孙进程，断言须先定位孙 pid。对照：导出 shutdown 例程单测完全落在既有基建上（queue.test 的 Runner fake + tmp dataRoot 模式）。
- **Kill criterion**：若选子进程 e2e 而不先加 dataRoot/任务注入 seam → 不可行或污染真实数据，应降级为例程单测。
- **Cheapest test**：GRILL 钉形态为例程单测（信号处理收敛为可注入依赖的 `installSignalHandlers()`），薄 e2e 可选。

## What's Well-Reasoned

- **N2 问题陈述完全属实，且比提案说的更严重**：探针 A 精确复现 6/20；工作台内置场景预设（研报 pageSize=20/maxPages=10 → 配额 15；定制 pageSize=50/maxPages=5 → 配额 10）意味着**出厂预设**在多附件接口上第 5 个附件就开始熔断——不是边缘场景。另实测 `matched=10` 而非 20：熔断的「静默少收」比失败事件更值得如实呈现。
- **fail-closed 约束与既有治理叙事自洽，修复机制现成**：BudgetGate 现有 API **足以支撑双实例分池，无需改 data-governance**；反而单池「运行时重定容」需要新 API（无 setMaxCalls）或池重建（丢失已记用量）——两候选中分池实现摩擦更小。
- **Ctrl-C 孤儿问题与修复机制均实证**：现状 `index.ts:42-43` 确为裸 `process.exit(0)`；提交历史自认「Ctrl-C 后爬虫成孤儿」；探针 D 直接证明 detached 子进程父死后存活、负 pid 组杀有效。
- **「尽力而为清理而非优雅完成」边界正确**：queue.close() 语义与提案描述一致；persist 走 tmp+rename 原子写，中断最坏丢最后一次状态写、不损坏 tasks.json。
- **测试基建撑得起全部验收**；**批次切分合理**（两处改动零代码耦合）。
- **提案的自我要求质量高**：公式、终态语义、信号集、测试形态全部列为开放问题——五条 KA 有四条正是对这些开放问题的可裁决输入。

## What I Couldn't Assess

- 关闭 Terminal 窗口的 SIGHUP 实际行为（无法从 CLI 模拟关窗；基于 `.command` 注释 + POSIX 语义 + 会话隔离推断，建议实现期手动关窗验证或直接纳入信号集）。
- `tsx watch`（dev 脚本）下的信号语义未探。
- 「预计附件量」的现实分布（历史任务太少，无法校准公式常数）。
- firecrawl-scraper 自带 `budget-gate.ts` 副本与 data-governance 的重复（N5/N6 邻域，仅提示存在）。

## Verdict: GO-WITH-CONDITIONS

条件（进入 PRD/GRILL 前必须收敛）：

1. **N2 公式必须同时处置 `maxTokens`/`maxCostUsd` 默认值**（rss 先例或显式 `undefined`），并以 >500 总跳用例佐证。
2. **分页配额公式须覆盖每页 1+5 跳 worst-case**（`maxPages × (1+MAX_REDIRECT_HOPS)` 或采纳 rss「重定向跳不占配额」并显式记录取舍）。
3. **终态语义裁决不得引用「恢复旧语义」**（死代码），须以「如实呈现」论证，并显式对齐或说明与 rss 先例的分歧。
4. **Ctrl-C 信号集评估 SIGHUP**（启动器文档化的关窗退出路径），或显式记录该路径仍泄漏为已知限制。
5. **钉死 shutdown 走 cancel 还是 terminate**（canceled / failed-异常退出 / 下次启动 running→failed 三选一）并写入测试断言。
6. **测试形态首选导出 shutdown 例程单测**；子进程级 e2e 仅在补齐 dataRoot/任务注入 seam 后可选。

**给决策者的一句话**：先在 PRD 里写下一行公式（含 token/cost 处置）、一行终态裁决、一行信号集——三个一行决策落地后，剩余实现与测试都是本仓已验证过的低摩擦路径。
