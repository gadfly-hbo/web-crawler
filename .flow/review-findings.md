# 评审报告：WC-AR-02 契约增量 rev2（fixed point 5a3a98c，工作区 diff）

> 评审执行：全新上下文只读子代理（explore），按 matt-code-review 双轴评审；VERIFY 命令亲自复跑。

## Verdict: **PASS**

VERIFY 命令亲自复跑：`pnpm test && pnpm typecheck && pnpm build` → **exit 0**。测试 **138/138 全绿**（data-governance 7 + firecrawl-scraper 26 + api-connector 16 + cninfo-reports 13 + workbench 76，fail 0），typecheck 5 项目全过，vite build 成功——**与实现方记录的证据完全一致，无不符**。运行后 `git status` 与评审开始时逐字相同（12 文件），无测试副作用。tasks.md 四个切片的打勾证据（7/7、26/26、76/76、用例名）逐条与实跑输出对上，无虚假证据；diff 范围无超出（12 文件全部在 spec 覆盖面内，cninfo/api-connector 两个构造器调用方零改动，工作区无范围外文件）。

## Spec 轴（proposal rev2 已定决策 + PRD/GRILL 决议）

九条已定决策与十条 GRILL 决议逐条命中，无冲突：

| 冻结决策 | 实现证据 | 结果 |
|---|---|---|
| 不加 `backend` 字段，复用 `provider` | `crawlers/firecrawl-scraper/src/engine.ts:57`；`SnapshotMetadata` 无 backend（`packages/data-governance/src/storage.ts:5-23`） | ✅ |
| provider 透传修复（一行级） | `engine.ts:57` `{ ...result, provider: capabilities.provider }` + 断言测试 `crawlers/firecrawl-scraper/test/engine.test.ts:60-79` | ✅ |
| schemaVersion 挂联合层、不动 domain 包 | `apps/workbench/shared/task-params.ts:35-37`；domain 包不在 diff | ✅ |
| response_type/truncated snake_case、API 层 camelCase | `storage.ts:16-17, 50-51, 99-100` | ✅ |
| limitations/operations 可选 + 空数组归一化键不存在 | `packages/data-governance/src/manifest.ts:46-47, 122-123, 178-179` | ✅ |
| 白名单三值收敛 unknown/键缺失/非白名单、顺序按声明序 | `crawlers/firecrawl-scraper/src/pipeline.ts:18-22, 63-65, 130-132`（Set 插入序=声明序，确定性）；封堵用例 `test/pipeline.test.ts:40-94` | ✅ |
| 双路径机制、2 个构造器调用方零改动 | grep 全仓确认调用方仅 `crawlers/cninfo-reports/src/engine.ts:335`、`crawlers/api-connector/src/engine.ts:372`，均未修改 | ✅ |
| schemaVersion 零生产者、未知值放行、无版本协商 | grep 确认生产代码无写入者；`task-params.ts:63-69` trim 非空校验 + 中文错误 | ✅ |
| SourceType 'rss' 不在本包 | `task-params.ts:18` 仍三值 | ✅ |

Q4 计入边界（在 extract 之前收集、与 record 产出无关、parse 失败沿既有 catch 静默跳过）与 Q6 fixture 构造方式（saveSnapshot 造 unknown、手写 metadata.json 造 key-absent 并注释缘由，`pipeline.test.ts:45, 66-67`）均按决议落地。

**Spec 轴发现（均 non-blocking，判断层气味）**：

1. **(non-blocking, implementation)** `apps/workbench/shared/task-params.ts:81` — 未知 `sourceType` 的 fallthrough 分支 `return [\`不支持的数据源类型…\`]` 丢弃了 `sharedErrors`：sourceType 非法且 schemaVersion 非法同时发生时，schemaVersion 错误不出现。校验整体仍失败（返回非空），无正确性漏洞，仅错误清单不完整。Recheck：`validateTaskParams({sourceType:'bogus', schemaVersion:''} as any)` 返回是否含 schemaVersion 错误。
2. **(non-blocking, verify)** 拒绝用例只走 cninfo 分支（`base()` 缺省 sourceType），`task-params.ts:76,79` 的 api-connector/web-scraper 分支 `[...sharedErrors, ...]` 拼接无直接负向用例（PRD 未要求，属测试广度缺口）。Recheck：补一条 `sourceType:'web-scraper'` + 空串 schemaVersion 的拒绝断言。
3. **(non-blocking, verify)** `packages/data-governance/test/governance.test.ts:181` 测试标题含“不传新参数行为不变”，但测试体两次调用都显式传了空数组；“不传参数”路径实际由既有 4 个测试间接覆盖。标题轻微过誉。Recheck：标题删去后半句，或补一次不传新参数的调用。

## Standards 轴

仓库无项目级 `AGENTS.md`、CONTRIBUTING、CODING_STANDARDS、prettier/eslint 配置（Glob 均无命中）——仅有 smell baseline（全部为判断层）。改动最小且聚焦，沿用各文件既有模式（中文错误消息、mkdtemp fixture、node:test 风格均与既有测试一致）。发现：

4. **(non-blocking, implementation)** `crawlers/firecrawl-scraper/src/pipeline.ts:63-64` — 同一表达式 `meta.provider as AcquisitionCapabilities['provider']` 连续断言两次（Duplicated Code，判断层）。可提取局部变量。安全性无虞（`.has()` 守卫后才 `add`）。Recheck：`const provider = meta.provider` 提取后测试仍 26/26。
5. **(non-blocking, task)** `.flow/tasks.md:25-29, 42-43, 56-59, 72-74` — 四个切片内部的 acceptance criteria 复选框全部保持 `- [ ]` 未勾，与切片顶层 `[x]` + 证据记录不一致；证据本身经我复跑全部属实，仅文档记录层次不齐。Recheck：勾选内层框或改为非复选清单。

## 总结

Standards 轴 2 条（最重：重复断言，纯气味）；Spec 轴 3 条（最重：fallthrough 丢弃共享错误，无正确性影响）。**无 blocking finding**：spec 轴九条硬约束全部命中，VERIFY 证据真实复现，无虚假证据、无范围外改动、无被拒方案复活。可合入。
