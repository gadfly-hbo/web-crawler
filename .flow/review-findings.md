# REVIEW 阶段评审 — 执行治理收尾批（N2 预算定容 + Ctrl-C 孤儿清理）

- **日期**：2026-10-16
- **Fixed point**：`5b762d4`（范围 = `git diff 5b762d4` + 未跟踪新文件）
- **评审人**：REVIEW 独立评审者（未参与实现与红队；双轴评审按 `matt-code-review` 执行）
- **baseline_dirty**：[]（`.flow/` 流程产物扫读不计入范围违规）
- **Verdict：PASS**

## 1. 复跑实际结果（亲自执行，含一次 flake）

| 轮次 | 命令 | 结果 |
|---|---|---|
| 第 1 次 | `pnpm test && pnpm typecheck && pnpm build` | **exit 1**：workbench **212/213**，1 红 = `queue.test.ts:270`「重启恢复：带脱敏密钥的 queued 任务标 failed」`ENOTEMPTY`（tmp 清理竞态）；其余 10+27+24+32+14 全绿 |
| 第 2 次（红队 V3 flake 政策） | 同命令 | **三段 exit 0，213/213**（governance 10 + firecrawl 27 + api 24 + rss 32 + cninfo 14 + workbench 106）；typecheck 6 包全过；`vite build` 成功 |

计数核对：213 = 205 基线 + 8（api 20→24、workbench 102→106，其余持平），与 tasks.md 完成证据一致；tasks 预估 +6、实际 +8（shutdown×4）已如实披露。第 1 次红的用例**本批 diff 未触碰**，fixed point 同样存在清理缺口（见 F1）。

## 2. 对抗探针（/tmp，仓库零改动）

1. **BudgetGate 默认值反例（条件 1 的测试有效性）**：`new BudgetGate({ maxCalls: 1000 })` 不传 maxTokens → **第 501 跳 `TOKENS_EXCEEDED`**；显式 `maxTokens/maxCostUsd: undefined` 后 600 跳全过，`getConfig()` 证实 spread 显式 `undefined` 真覆盖默认。→ 若引擎漏传 `undefined`，「>500 总跳」用例必然红。**次级反例**：只关 maxTokens、漏 maxCostUsd 时 600 跳仍全过（默认成本顶 ≈976 跳）——见 F3。
2. **interruptActive 内存/磁盘一致性**：fake runner 先 emit `done`（内存 `succeeded`）、`handle.done` 未落定时 `interruptActive()` → `close()` → **磁盘 raw 停在 `running`** → `q2.init()` 标 `failed / 服务重启导致任务中断`。已完成任务在窄窗口内被误标中断——见 F2。

## 3. 红队 6 条放行条件逐条核验（全 ✅）

| # | 条件 | 证据 |
|---|---|---|
| 1 | token/cost 处置 + >500 跳佐证 | `engine.ts:206-211` 两池显式 undefined；600 跳用例；探针反例 |
| 2 | 分页配额覆盖 1+5 跳 worst-case | `engine.ts:205-208` 公式恰等 guardedFetch 单请求 6 跳上界；B2 用例 18 跳不熔断 |
| 3 | 终态=queryError 与 rss 一致 | catch 分类未动；`[BudgetGate]` 前缀自带；queue.test 归类行（partial） |
| 4 | SIGHUP 在册 | `shutdown.ts:14` 三信号；测试 `process.emit('SIGHUP')` |
| 5 | shutdown 三选一唯一化 | `queue.ts:137-143` 仅 terminate 不改写；两阶段测试断言磁盘 running + 重启中断 |
| 6 | 例程单测形态 | `installSignalHandlers({queue, exit})` + uninstall，无子进程 e2e |

## 4. GRILL G1-G7 与竞态边界猎查

- **G1 双竞态封堵真实**：`queue.ts:254`（onProcessDone 早退）+ `queue.ts:194`（pump 拒绝调度）；测试断言磁盘 t1=running、t2=queued、cancels==[t1] 可分辨守卫缺失。
- **G2 等待有界 + 尾部 flush**：await done 由 SIGTERM→5s SIGKILL 收敛；runner close 先冲残留行再 resolve。双击 exit(130) 逃生门。
- **竞态/边界**：无活动任务 no-op ✓；双击同步 exit(130) ✓；uninstall 无残留 ✓；shutdown IIFE 无 catch（生产路径 cancel/close 不抛，理论风险不列）；HTTP server 不随关停关闭（PRD 承诺序列外，窗口极窄，不列）。
- **N2 公式正确性**：clamp 后取有效值 ✓；pageSize 缺省 20 ✓；budgets 按池 ?? 替换语义 ✓；下载池对服务端超发条目不加保护——PRD 明文「熔断顶非资源分配」按设计接受。
- **虚假证据/范围**：tasks.md 与实测相符（一处形式瑕疵 F4）；改动仅 engine + workbench 生命周期 + 测试 + 流程产物，无范围外改动。

## 5. 双轴评审

**Standards**：0 硬违规；1 个测试 mock 同构小重复（judgement call，engine.test.ts 两段重定向循环）；budgets seam 与 ShutdownQueue 窄接口为 spec 明文要求不计 Speculative Generality。

**Spec**：提案两件决策完整落地；PRD 决策 1-8 逐条对应实现与测试；Diff Gate 六项增量全部实现；0 缺失 0 creep。

## 6. Findings（按严重度）

**Blocking：无。**

| # | 严重度 | 位置 | 归属阶段 | 判定 | 一行 recheck 判据 |
|---|---|---|---|---|---|
| F1 | minor | `queue.test.ts:270-298`（finally 直接 rm，q2 从不 close） | 上游既有测试缺陷（fixed point 即存在，本批 diff 未触碰） | non-blocking | 首跑红（ENOTEMPTY）复跑绿；finally 补 `await q2.close()` 后连跑 ≥5 次不再现即认定已修 |
| F2 | minor | `queue.ts:254`（interrupting 早退跳过 persist） | G1 边界语义（与旧 Ctrl-C 磁盘结果等价，非回归） | non-blocking | 探针 2 场景：内存 succeeded → 磁盘 running → 重启误标中断；若裁决不接受，改法=interrupting 下仅跳过改写、终态仍落盘 |
| F3 | minor | `engine.test.ts:446-465`（>500 用例为 600 跳） | 条件 1 佐证形态覆盖不足 | non-blocking | 漏传 maxCostUsd 的回归在 600 跳下仍绿（默认成本顶 ≈976 跳）；扩到 >1000 跳或断言 getConfig() 即封死 |
| F4 | trivial | `.flow/tasks.md`（T1-T3 勾 [x] 但其下验收项仍 [ ]） | 流程产物一致性 | non-blocking | 勾选自相矛盾但完成证据段如实；勾上验收项即消 |

## 7. 一句话总结

- **Standards**：0 硬违规，最重即测试 mock 小重复。
- **Spec**：0 缺失/0 creep，红队 6 条件与 G1-G7 全数落地有测试钉死——最重即 F2 的完成瞬间被关停窄窗口误标（非回归）。
- **Verdict：PASS**（4 条 non-blocking，均不阻塞放行）。
