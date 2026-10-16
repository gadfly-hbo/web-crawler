# 执行治理收尾批 任务分解（tracer-bullet 垂直切片）

基线：205/205（2026-10-16 红队实跑 + 递延收敛批 VERIFY 确认）。

- [x] T1. N2 预算分池：双 BudgetGate + budgets 注入 + token/cost 关闭（G5/G7 + 条件 1+2）
- [x] T2. Ctrl-C 关停：interruptActive（G1 interrupting 标志 + G2 等待落定）+ installSignalHandlers（G3/G6）+ 两阶段断言（G4）
- [x] T3. VERIFY 全量门禁

---

## T1. N2 预算分池

### What to build

`crawlers/api-connector/src/engine.ts`：①双 BudgetGate 分池——分页池 `maxCalls = maxPages_eff × (1+MAX_REDIRECT_HOPS)`、下载池 `maxCalls = pageSize_eff × maxPages_eff × (1+MAX_REDIRECT_HOPS)`（有效值取 clamp 后），两池显式 `maxTokens: undefined, maxCostUsd: undefined`；②guardedFetch 两调用点各传各池（分页/下载，签名不变）；③`RunApiConnectorOptions` 增可选 `budgets?: { pagination?: BudgetCounter; download?: BudgetCounter }`（缺省按公式建池，显式传入替换该场景池，G7）；④分页 catch 的 queryError 归类保持（G5/条件 3：与 rss 对齐，reason 前缀 `[BudgetGate]`）。

### Acceptance criteria

- [x] recheck 场景绿：maxPages=2、单页 10 附件 → 20 附件全下载成功 + matched=20（探针 A 反例修复）
- [x] redirect 密集分页绿（探针 B2 场景：maxPages=3、每页 1+5 跳）不熔断
- [x] >500 总跳用例绿且无 TOKENS_EXCEEDED（条件 1 佐证）
- [x] budgets 注入小池确定性熔断 → queryError + `[BudgetGate]` reason + summary.failed 计入（G5 全链路断言）
- [x] 既有 20 用例零回退

### Blocked by

None

---

## T2. Ctrl-C 关停清理

### What to build

①`TaskQueue.interruptActive(): Promise<void>`——置 `interrupting` 标志（`onProcessDone` 跳过改写、`pump` 拒绝再调度，G1）→ `active.handle.cancel()` → `await handle.done`（G2 有界等待）；用户 cancel 路径不动。②`apps/workbench/server/shutdown.ts`：`installSignalHandlers({ queue, exit })`——真 `process.on` 注册 SIGINT/SIGTERM/SIGHUP（G3），首信号→shutdown 流程（interruptActive → queue.close() → exit(0)，G6），第二信号同步 exit(130)；返回 uninstall。③`server/index.ts:42-43` 裸 handler 替换为接线调用。④测试：例程单测（process.emit 三信号各一 + 双击 + uninstall）；两阶段断言（fakeRunner cancel→resolveDone，done 落定后读 raw tasks.json 断 `running`，q2.init 断 `failed`/`服务重启导致任务中断`，G4）；queue 失败分级既有用例脚本补一行 `[BudgetGate]` reason 覆盖（G5）。

### Acceptance criteria

- [x] 三信号各一断言 + 双击强退（exit(130)）+ uninstall 防污染
- [x] 两阶段断言绿：磁盘 raw running → 重启 init → failed/服务重启导致任务中断
- [x] shutdown 期间不拉起新任务（interrupting 挡 pump——用排队第二任务断言）
- [x] 既有 queue/runner 用例零回退

### Blocked by

None（与 T1 可并行，零代码耦合）

---

## T3. VERIFY 全量门禁

### Acceptance criteria

- [x] `pnpm test && pnpm typecheck && pnpm build` 三段 exit 0；基线 205 + 新增（预期 +6：N2×4 + shutdown×2）
- [x] timing 敏感用例偶发 flake 复跑一次确认（红队 V3 政策）

---

## 完成证据（2026-10-16）

- **T1 N2 分池**：engine.ts 双 BudgetGate（分页 maxPages_eff×6、下载 pageSize_eff×maxPages_eff×6，两池显式 maxTokens/maxCostUsd=undefined）+ RunApiConnectorOptions.budgets 注入 seam（G5/G7）+ guardedFetch 两调用点各传各池。api-connector 24/24 绿（+4 N2 用例）：recheck（20 附件全下载、matched=20 无静默少收）、redirect 密集（每页 1+5 跳×3 页=18 跳不熔断）、>500 跳（600 跳无 TOKENS_EXCEEDED——条件 1 佐证）、budgets 小池确定性熔断（queryError + [BudgetGate] reason + failed 计入）。**红灯修复记录**：两用例曾假绿——`items.length < pageSize` 短页终止让引擎只跑 1 页（修 mock 为满页 items）；budgets 用例 maxPages:1 不触发分页池（改 maxPages:2）。
- **T2 Ctrl-C 关停**：TaskQueue.interruptActive（interrupting 标志封 onProcessDone 改写 + pump 再调度双竞态，G1）+ await handle.done 有界等待（G2）；server/shutdown.ts installSignalHandlers（真 process.on 注册 INT/TERM/HUP + uninstall + 双击 exit(130)，G3/G6）；index.ts 裸 handler 替换接线。workbench 106/106 绿（+4：三信号各一/uninstall/两阶段断言——磁盘 raw running → 重启 init → failed「服务重启导致任务中断」，并断言关停中不拉起排队任务）；queue 失败分级补 [BudgetGate] 归类行（G5）。
- **T3 VERIFY**：三段 exit 0，**213/213**（governance 10 + firecrawl 27 + api 24 + rss 32 + cninfo 14 + workbench 106；基线 205 + 8 新增——tasks 预估 +6，实际 +8【shutdown 用例 4 而非 2】，以实测为准）。
