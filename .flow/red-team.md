# Red-Team: web-crawler 架构重构与缺陷修复

## Top Kill-Assumptions (ranked)

### 1. 爬虫拆分为领域/事件导出后，CLI 的纯净独立性与逐字节输出不变
- **Claim:** 将 `crawlers/cninfo-reports` 的类型、校验与事件抽取后，CLI 本身的独立执行能力不受任何影响，且不带 `--json` 时输出逐字节一致。
- **Steelman:** 抽取的都是纯领域数据结构与字符串/日期处理纯函数，TextReporter 完整继承原有 `log()` 逻辑，架构更清晰且更易做字符级比对。
- **Fails if:** 拆分时误将 Node 特有依赖（fs/path/process）带入公共 domain，或 reporter 换行/缩进细节产生 1 个字符的漂移。
- **Evidence to get this week:** 重构前先为现有 CLI 输出录制基准输出快照；重构后用快照对拍断言 0 diff。
- **Kill criterion:** 快照比对出现任何意外字符差异，或外部直接 `tsx src/main.ts` 报解析依赖错误。
- **Cheapest test:** 重构前写一个简单的 snapshot 测试固化当前输出。

### 2. 检索时间窗口收窄不会误杀合规延迟披露的财报
- **Claim:** 年报窗口设为 Y+1 全年、中报与季报设为 Y 全年，能大幅压降单次查询量并彻底远离 3000 条上限，同时覆盖 100% 正规财报。
- **Steelman:** 证监会法定披露要求严格限定了报告期与发布日的关系（年报次年4月底、中报当年8月底）。给予全年余量足够吸收任何正常审批延迟。
- **Fails if:** 极个别重组、退市或被立案调查的公司跨年补发更正前历史年报，且刚好被窗口卡死。
- **Evidence to get this week:** 核对窗口边界，并增加硬防御：只要达到第 100 页且 `hasMore == true`，立即触发 `queryError` 事件，将未知风险转为明确披露，绝不静默丢弃。
- **Kill criterion:** 正常 A 股公司的有效法定报告被时间窗口过滤。
- **Cheapest test:** 本地模拟翻页到达 100 页时断言必须发出 `queryError`。

### 3. 工作台依赖爬虫包在 monorepo 内能够无阻碍解析与打包
- **Claim:** 工作台 `package.json` 添加 `"cninfo-reports": "workspace:*"`，Vite 与 TS 编译器能够无缝识别并打包。
- **Steelman:** pnpm workspace 原生支持 `workspace:*` 跨包链接，Vite 对 monorepo 内部依赖的 TS 源码编译支持成熟。
- **Fails if:** Vite build 或 tsx 运行时遇到 exports 条件导出（如 `import` vs `require`）解析失败或类型报错。
- **Evidence to get this week:** P1 落地后立即运行 `pnpm --filter workbench run typecheck` 与 `pnpm --filter workbench build`。
- **Kill criterion:** `vite build` 报错或无法解析 workspace 依赖。
- **Cheapest test:** P1 完成后一条 `pnpm -r run typecheck && pnpm --filter workbench build`。

## What's Well-Reasoned

- **原子落盘杜绝增量污染**：用 `.part` + rename 解决断网/取消产生的假文件问题，直接击中“增量补齐”逻辑的致命隐患。
- **细粒度错误隔离**：单文件 try/catch 避免整家公司因单篇报告网络抖动而直接被放弃，大幅提升长时间爬取的鲁棒性。
- **拒绝盲目抽取 packages/**：遵守当前 monorepo 约定（等 2~3 个爬虫后再建 packages/），采用 package exports 的方案 A，改动范围最小且架构自洽。

## What I Couldn't Assess

- 巨潮源站在连续密集大门类请求下的动态频控封禁策略（已保留 1000ms 默认延迟与退避重试，不可调低）。

## Verdict: **go**

所有假设均有明确防御性设计与自动化测试验证手段，无阻断性风险，立即推进至 PRD 阶段。
