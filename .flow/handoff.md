# dev-flow 交接卡 — 执行治理收尾批（DONE 2026-10-16）

## 本批交付

- 提交 `fca14df`（main，已推送 origin）：12 文件，+530/−290。
- **N2 预算分池**：api-connector 双 BudgetGate（分页/下载各池，worst-case 覆盖 1+5 跳/请求，显式关闭 token/cost 硬顶）+ budgets 注入 seam。红队探针 A 的 6/20 熔断场景修复为 20/20 + matched=20；600 跳大任务不再误熔断。预算熔断归 queryError（与 rss 分类一致，终态 classifyDone 如实）。
- **Ctrl-C/关窗孤儿清理**：INT/TERM/HUP 三信号 → interruptActive（terminate 子进程组并等待落定，interrupting 标志封双竞态）→ flush → 退出；双击 exit(130)。被关停任务磁盘保持 running，重启如实标「服务重启导致任务中断」。
- **验证**：三段 exit 0，**213/213**（基线 205 + 8）；SHIP 前 fail-closed 复跑一致；评审一轮 PASS（0 blocking）。

## 剩余批次（路线图收口）

1. **质量与体验收尾批（规划内最后一批）**：N5 三处异味（runner cancel 别名/void 解构/魔法字符串耦合）+ N6 四处覆盖缺口（5 跳上限/301/302 改写/mock 脱敏不豁免/每跳计费断言）+ A19 观察项（engine.test 顶层断言措辞、N4 用例时序前提注记）+ FA1/FA2 视觉收敛（商品详情双导出按钮与 caveats 双呈现、卡头副标措辞）+ TaskList view-desc 措辞 + 本批 F1（queue.test 清理竞态 flake 修 finally）+ F3（>500 跳用例扩到 >1000 或断言 getConfig）。
2. **条件触发：WC-AR-03 AgentReachBridge**——采纳文档定的触发条件（真实平台采集需求）满足时另启评审，不在规划序列内。

## 递延项台账（更新后）

已清偿：F6、cninfo/api limitations、商品面板 manifest 卡、A19 R2-1/F-2、RSS 标题、N4、**N2（本批）**、**Ctrl-C 孤儿（本批）**。
仍递延：N5/N6、A19 残余观察项、FA1/FA2、view-desc、F1/F2/F3（本批评审 non-blocking——F2「完成瞬间被关停窄窗口误标中断」记录在案，与旧 Ctrl-C 磁盘结果等价属非回归；如不接受可改「interrupting 下仅跳过改写、终态仍落盘」）、firecrawl budget-gate 副本去重（N5 邻域）。

## 已知限制

- 关窗 SIGHUP 已在册但未实测（POSIX 语义 + 会话隔离推断；实现期可手动关窗验证一次）。
- HTTP server 不随关停关闭（关停窗口极窄，API 或可短暂 create/cancel；PRD 承诺序列外）。
- 下载池对「服务端单页超发条目」不加保护——fail-closed 熔断顶按设计（超发条目如实 file failed）。

## 流程产物

`.flow/` 下 proposal / red-team（探针 A/B2/C/D/E2 实证）/ prd（G1-G7）/ tasks（含证据）/ review-findings（含对抗探针）随 fca14df 入库；state.json 本机状态。

## 降级披露

本批无降级：红队、GRILL 盲审、REVIEW 均为 fresh 子代理；UI-GATE 跳过（无 UI 范围）。
