# WC-AR-04 RSS 适配器 PoC — REVIEW 阶段第三轮独立评审报告

- **日期**：2026-10-16
- **评审轮次**：第 3 轮（review_cycles 3/3，全新实例，未参与实现与前两轮评审）
- **Fixed point（review_base）**：`c14a5cb`（docs(flow): WC-AR-05 handoff）
- **评审范围**：`git diff c14a5cb` + 未跟踪新文件（`crawlers/rss-collector/**`、`apps/workbench/test/rss-e2e.test.ts`）；本轮聚焦第二轮 R1/R2 修复核实 + 全量门禁亲自复跑，其余范围沿用第二轮已全面核验的结论并做回归扫
- **评审方法**：matt-code-review 双轴（Standards / Spec），Spec 优先级 proposal > prd > tasks > red-team；全部结论以代码与实跑输出为证

## Verdict: **PASS**

第二轮唯一 blocking（R1：G10 第四子句「manifest limitations 注明 Feed 可能截断」未实现）与 info 级 R2（PRD 补记插错位置）**均已真实闭合**；本轮亲自复跑三段门禁全绿且计数与声明逐包一致；修复 diff 未引入范围外改动。第三轮对抗性检查另记录一处 info 级边角注记（R3，无需动作，不构成 blocking）。

---

## R1 闭合核实（本轮重点 1）：**已闭合**

实现（`crawlers/rss-collector/src/collector.ts`）：

- `:209` 循环前声明 `let anyTruncated = false;`
- `:239` 每 Feed 成功解析后 `if (parsed.truncated) anyTruncated = true;`（附 G10 注释）
- `:341-342` manifest.limitations 在静态四条之后条件展开附加「部分 Feed 传输截断：已保留完整条目、丢弃未闭合尾部，详见快照 metadata.truncated」

测试（`crawlers/rss-collector/test/collector.test.ts:283-298`，位于既有 G6/G10 用例内）：

- **正向**：截断任务（`truncated-rss.xml`，第三条 item 无闭合——真实传输截断样本）断言 `manifest.limitations.some(l => l.includes('截断'))`，失败时打印实际 limitations 便于诊断；
- **负向**：normal fixture 二次运行断言 `!some(l => l.includes('截断'))`——两方向均覆盖。静态四条 limitations 均不含「截断」子串，判别式有效。

对抗性检查（逐路径核实无误触发/漏触发）：

| 路径 | 结果 |
|---|---|
| 校验期失败（`RssValidationError`，`collector.ts:189`） | 循环前抛出、无 manifest → 无虚假条目 ✓ |
| deadline 预检拦截（`:218-222`）与 AbortError（`:267-268`） | 未跑 parseFeed，flag 不置位 → 不误触发 ✓ |
| A05 非 Feed（`parseFeed` 返回 null，`:230-234`） | `continue` 先于 `:239` 置位行 → 不误触发 ✓ |
| HTTP 404/500、超跳数、EGRESS 拦截 | 均在 parse 前抛出 → 不误触发 ✓ |
| `--limit` 条目切片 | `parsed.truncated` 为 `openCount > closeCount`（`feed-parser.ts:124/155`），与 limit 无关 → 切片不触发注记，与 G6（limit 为每 Feed 正常口径）/G10（注记绑定 A07 传输截断）分工一致 ✓ |
| RSS/Atom 双型 | flag 读取 kind 无关的 `parsed.truncated`，两型对称覆盖 ✓ |
| limitations 顺序/内容语义 | 追加在静态四条末尾（条件展开）；措辞「已保留完整条目、丢弃未闭合尾部」忠实对应 G10 前两子句，指针指向快照 `metadata.truncated`（`storage.ts:109` 落盘，`collector.ts:248` 传入）✓ |

Recheck 判据（「任一 Feed truncated 时附加截断条目，并在测试断言之；194 用例保持全绿」）**全部满足**。本轮实跑该用例绿（22.8ms）。

## R2 闭合核实（本轮重点 2）：**已闭合**

`.flow/prd.md` 当前结构：`### Round 2`（`:121`）→ 引言（`:123`）→ G10/G11/G12（`:125-127`）→ `**GRILL 收敛**`（`:129`）→ `### 评审周期 1 补记`（`:131-134`，文件止于 134）。G10–G12 与收敛行在文档结构上完整归属 Round 2 小节，补记位于收敛行之后，不再拆散任何小节。Recheck 判据满足。

## 回归扫（本轮重点 4）

修复仅触碰声明中的 3 个文件，无范围外改动：

- `collector.ts`：新增恰为上述 4 行（`:209/:239/:341/:342`）；第二轮报告引用的旧行号因这些插入整体平移（如 metadata.truncated `:246`→`:248`），其余代码与第二轮核验状态一致。
- `collector.test.ts`：仅既有 G6/G10 用例内新增断言块；`collector.test.ts` 仍为 10 个编排用例，rss 包总用例数维持 32（扩展未增删用例）。
- `.flow/prd.md`：仅补记小节位置移动，内容无变化。
- 其余 20 个脏文件为第二轮已全面核验范围，本轮以计数回归（workbench 91、governance 10 等全绿）确认无行为漂移，未重审。

## Findings

### R3【non-blocking/info】`anyTruncated` 置位先于快照落盘的边角顺序

- **证据**：`collector.ts:239`（置位）在 `:240` `storage.saveSnapshot` 之前。若某截断 Feed 的快照写入抛错（磁盘类故障），该 Feed 计 failed 且无快照、无记录，但 flag 已置位 → manifest 仍会附加截断注记，此时「详见快照 metadata.truncated」对该 Feed 无处可查。
- **风险评估**：观察事实本身（该次传输确实截断）仍为真，注记非虚假；触发前提是 G11 本就归类为致命错误的 outDir 写失败路径（该路径既有归类行为第二轮已审过、未判缺陷）。纯理论边角。
- **Recheck 判据**：无需动作；如正式化阶段重排，将置位移至 `file downloaded` emit 之前即可。

除 R3 外 **无其他 findings**：无虚假证据、无未使用导入、无死分支新增、无范围外改动。

## 复跑 verify 实际结果（2026-10-16，仓库根，本轮亲自实跑）

| 阶段 | exit code | 计数 |
|---|---|---|
| `pnpm test` | **0** | **194/194**：data-governance 10、firecrawl-scraper 27、api-connector 20、rss-collector 32、cninfo-reports 14、workbench 91（各包 fail 0 / cancelled 0 / skipped 0） |
| `pnpm typecheck` | **0** | 6 包过（workbench 双 tsconfig：`tsc --noEmit && tsc --noEmit -p web`） |
| `pnpm build` | **0** | vite build 过（69 modules，679ms） |

三段合计实测约 11.3s（300s 上限内）。计数与第二轮报告声明（194/194 = 10+27+20+32+14+91）**逐包完全一致**。

## 结论

R1 按判据闭合（条件附加 + 双向断言 + 全绿）、R2 排版修正到位、门禁复跑与声明零偏差、修复 diff 干净无外溢。第二轮遗留的唯一 blocking 消除，无新增 blocking。verdict **PASS**，WC-AR-04 可进入下一阶段。
