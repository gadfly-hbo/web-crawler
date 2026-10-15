# dev-flow 交接卡 — WC-AR-05 执行治理增量（DONE 2026-10-15）

## 本批交付

- 提交 `ca9a6a6`（main，已推送 origin）：29 文件，+923/−193。
- 出口守卫：`packages/data-governance/src/egress.ts` 的 `egressBlockReason(url)`，已接线至 api-connector（校验期 + engine 逐跳重定向）、workbench web-scraper 校验、cninfo 两个 ORIGIN。
- runner 治理：任务级超时（默认 60min、`timeoutMs` 覆盖、超时先发结构化 error 事件）、detached 进程组 + 负 pid killGroup、幂等 terminate；`--api-key` 从 argv 消除（纯 env 注入）。
- queue 重启恢复：queued 任务脱敏密钥残留 → 直接标 failed。
- 验证：`pnpm test && pnpm typecheck && pnpm build` exit 0，151/151（基线 138+13），提交前 fail-closed 复跑一致。

## 下一批前置（WC-AR-04 RSS PoC）

本批已为 WC-AR-04 备齐执行层治理，下一批可直接复用：

- RSS/HTML 抓取器采集 URL 一律经 `data-governance/egress` 的 `egressBlockReason` 守卫（与 T2 同一接法，校验期调用即可）。
- 若 RSS 源有重定向，参考 api-connector `engine.ts` 的 `guardedFetch` 模式（manual 逐跳 + 5 跳上限 + 每跳计 budget）。
- 凭据一律 env 注入，禁止进 argv；需要超时时走 `TaskParams.timeoutMs`（已从 API → normalizeParams → runner 端到端贯通）。

## 递延项（评审 6 条 non-blocking，均未处理，按建议优先级排序）

详见 `.flow/review-findings.md`，recheck 判据逐条在内：

1. **N2（建议下一批处置）**：每跳计 budget 后 `maxCalls = maxPages + 5` 上限未重新定容，多附件任务可能中途熔断；分页期预算熔断的终态从 failed 降为 partial（行为变化需确认预期）。
2. **N1**：`egressBlockReason` 未剥尾随点，`http://localhost./` 可绕过字面检查（一行修复 + 探针用例）。
3. **N3**：`egress.ts:56-63` `::ffff:` 点分 mapped 分支为死代码且若可达有 bug，建议删除。
4. **N4**：超时回调未查 `canceled`，取消后可能多打一条「任务超时」日志行（一行 `if (canceled) return`）。
5. **N6**：四处覆盖缺口（5 跳上限、301/302 POST→GET、mock:true 脱敏不豁免、每跳计 budget 断言）。
6. **N5**：三处小异味（无效别名、`void` 压制解构、魔法字符串耦合）。

## 已知限制（PRD 已声明，非缺陷）

- `detached`/负 pid 进程组终止仅 macOS 实证；Linux 理论同源未实测，Windows 不支持负 pid 语义。
- DNS rebinding 不防（守卫基于 URL 字面主机，不做解析后校验）。
- Ctrl-C 杀 workbench 后已 spawn 的爬虫成孤儿（GRILL R1-Q7 记录的 delta；关停钩子清理留作后续小改）。

## 流程产物

`.flow/` 下 proposal / red-team / prd（含 GRILL 决议附录）/ tasks（含证据勾选）/ review-findings 均已随 ca9a6a6 入库；state.json 为本机状态（gitignored）。
