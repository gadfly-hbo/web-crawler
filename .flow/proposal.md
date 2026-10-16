# 提案（讨论稿固化）— 执行治理收尾批（N2 预算定容 + Ctrl-C 孤儿清理）

来源：`.flow/handoff.md`（递延收敛批，2026-10-16）递延台账前两项 + WC-AR-05 评审 N2 recheck 判据 + WC-AR-05 GRILL Q7 记录的 Ctrl-C delta。
用户指令："继续下一批"（台账优先级 N2 居首）。
固化时间：2026-10-16。

## 已定决策（不可推翻，后续阶段只可细化）

1. **N2 api-connector 预算定容**（WC-AR-05 评审 non-blocking，红队实证）：现状 `maxCalls = maxPages + 5`（分页时代定容），WC-AR-05 起 guardedFetch 每跳计费、附件下载也计入同一池 → 合法多附件任务约 55 次调用后剩余附件全部 `[BudgetGate] 熔断` 失败。修复要求（N2 recheck 判据）：
   - 以 maxPages=2、单页 10 个附件跑引擎，全部附件下载成功（或上限已按「页数 + 预计附件量」重新定容）；
   - 分页期预算熔断的事件分类与终态语义须钉死并测试（红队指出现状有语义漂移：分页熔断原先 try 外抛出 → error 事件 + 整体 failed；现在可能被捕获为 queryError → 有产出任务终态从 failed 降为 partial——何为正确语义须裁决）。
   - 公式方案（分池 vs 单池重定容）留给红队/GRILL 裁决，但**必须维持 fail-closed**（下载调用不得无配额）。
2. **Ctrl-C 孤儿爬虫关停清理**（WC-AR-05 GRILL Q7 记录的 delta）：现状 Ctrl-C/SIGTERM 杀 workbench server 后，已 spawn 的 detached 爬虫进程组成孤儿继续采集。修复要求：server 收到 SIGINT/SIGTERM 时——终止活动任务子进程组（复用既有 terminate/cancel 路径）→ 等待队列落盘 flush（queue.close()）→ 再退出进程；无活动任务时直接干净退出。语义边界：关停是「尽力而为的清理」而非「优雅完成」——被关停任务在下次启动时按既有重启恢复语义处理（running → 中断失败），不新增状态。
3. **测试**：两项各有确定性用例（N2 用 recheck 场景；Ctrl-C 的可测形态——信号处理器单元级或子进程级——留 GRILL 钉死）；全量门禁 `pnpm test && pnpm typecheck && pnpm build` 保持绿，基线 205 零回退。
4. **范围**：仅动 api-connector engine 预算逻辑与 workbench server 生命周期两处；不改事件协议形状、不改 runner 进程管理既有语义（Ctrl-C 复用 terminate）。

## 约束与边界

- fail-closed 不动摇：任何调用（分页/下载/重定向跳）不得绕过 BudgetGate。
- Ctrl-C 清理不得引入新的异步复杂度到热路径（信号处理器只在关停时生效）。
- 无 UI 范围（本批跳过 UI-GATE）。

## 已拒绝/排除的替代方案

- 下载调用不进 BudgetGate（违背 fail-closed 治理前提）。
- server 关停时等待任务自然完成（Ctrl-C 语义是立即关停，不是等待）。
- N5/N6 其余项、FA1/FA2、view-desc（归质量收尾批）；AgentReachBridge（条件触发）。

## 开放问题（留待红队/PRD/GRILL）

- N2 公式：a) 分池（分页配额 + 下载配额各自计）vs b) 单池重定容（maxCalls = maxPages + 余量 + 预计附件量封顶）——各自的事件/熔断语义与测试面。
- 分页期预算熔断的终态语义：整体 failed（error 事件）vs 有产出 partial（queryError）——何为「如实」。
- 重定向跳的归属：分页请求的重定向跳与下载请求的重定向跳各计入哪个池。
- Ctrl-C 测试形态：直接对 server 入口发信号（子进程级 e2e）vs 导出 shutdown 例程单元测试；信号集（SIGINT/SIGTERM 两个都要？）。
- 双击 Ctrl-C 强退语义（第二次信号立即退出不等待 flush）是否纳入。
