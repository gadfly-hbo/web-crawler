# Code Review Report (Cycle 2 Final): web-crawler 架构重构与缺陷修复

- **Target Repository**: `/Users/huangbo/Dev/Projects/web-crawler`
- **Fixed Point**: `207e956c297e6ab27c8e6fda840fc1a1eee660c2`
- **Overall Verdict**: **PASS** (Standards Axis: PASS, 0 findings; Spec Axis: PASS, 0 findings)

---

## 1. Verify Command Re-run Evidence

- **Command**: `pnpm test && pnpm typecheck && pnpm build`
- **Working Directory**: `/Users/huangbo/Dev/Projects/web-crawler`
- **Exit Code**: `0`
- **Output Evidence**:
  - `crawlers/cninfo-reports`: 13 passed, 0 failed
  - `apps/workbench`: 55 passed, 0 failed
  - Total: **68 tests pass, 0 fail**
  - `pnpm -r run typecheck`: **0 errors**
  - `pnpm -r --filter workbench build`: **succeeded in 634ms** (`dist/` generated)
- **Match Status**: 完全匹配记录证据（0 差异）。

---

## 2. Recheck of Previous Findings

### [Resolved] P1: 失败清单与日志格式化丢失报告标题，且单测夹具掩盖缺陷
- **Check Evidence**:
  1. `apps/workbench/shared/log-format.ts` (第 16–21 行):
     ```ts
     const label = `${ev.name ?? ''} ${ev.title ?? ''}`.trim();
     if (ev.status === 'downloaded') return `↓ 已下载 ${label}${ev.bytes != null ? `（${fmtBytes(ev.bytes)}）` : ''}`;
     if (ev.status === 'skipped') return `＝ 已存在，跳过 ${label}`;
     return `✗ 下载失败 ${label}：${ev.reason ?? '未知原因'}`;
     ```
     失败分支现使用包含公司名与报告标题的 `label`，完整保留了报告标题。
  2. `apps/workbench/web/src/components/FailureList.tsx` (第 16–23 行):
     ```tsx
     const itemDesc = f.target
       ? `检索「${f.target}」`
       : [f.code, f.name, f.title].filter(Boolean).join(' ');
     return <li key={i}>{itemDesc}：{f.reason}</li>;
     ```
     渲染时通过 `[f.code, f.name, f.title].filter(Boolean).join(' ')` 清晰展示失败报告的标题。
  3. `apps/workbench/test/log-format.test.ts` (第 28–31 行):
     已补充带有 `title` 的测试用例：
     ```ts
     assert.equal(
       formatLogLine(JSON.stringify({ type: 'file', status: 'failed', name: '平安银行', title: '2024年年度报告', reason: '连接超时' })),
       '✗ 下载失败 平安银行 2024年年度报告：连接超时',
     );
     ```
  4. `apps/workbench/server/reducer.ts` 与 `apps/workbench/test/reducer.test.ts`:
     `applyEvent` 正确将 `ev.title` 存入 `failures`，单测中已覆盖该属性断言。
- **Status**: **PASS**

### [Resolved] S1: 校验规则与常量重复 (Duplicated Code)
- **Check Evidence**:
  1. `crawlers/cninfo-reports/src/cli.ts` (第 2–5 行):
     ```ts
     import { MIN_SLEEP_MS, type ReportType } from './domain/types.js';
     import { DATE_RE } from './domain/validation.js';
     export type { ReportType } from './domain/types.js';
     ```
  2. `crawlers/cninfo-reports/src/cli.ts` (第 158–164 行):
     消除了本地重复声明的 `DATE_RE` 与硬编码 `200`，直接使用 `MIN_SLEEP_MS` 与 `DATE_RE`。
- **Status**: **PASS**

### [Resolved] S2: 流程引擎参数耦合 CLI 专属标记 (Speculative Generality / Data Clumps)
- **Check Evidence**:
  1. `crawlers/cninfo-reports/src/engine.ts` (第 132–134 行):
     ```ts
     export type EngineOptions = Omit<CliOptions, 'json' | 'help'>;

     export async function run(opts: EngineOptions, reporter: Reporter): Promise<CrawlSummary>
     ```
     `engine.ts` 显式解耦 CLI 专属字段 `json` 与 `help`，仅消费引擎所需参数契约。
- **Status**: **PASS**

---

## 3. Standards Axis

- **Documented Repo Standards & Global Conventions**:
  - TypeScript ESM 模块语法与 `.js` 扩展名对齐无误。
  - Monorepo 依赖声明规范：`apps/workbench` 正确通过 `"cninfo-reports": "workspace:*"` 引入，跨包相对路径 `../../../crawlers/` 扫描为 0。
  - 前端循环依赖：经 `npx madge --circular --extensions ts,tsx apps/workbench/web/src` 检查，确认为 **0 循环依赖**。
  - 组件职责分离：公共组件 `StatusChip` 与 `FailureList` 已收敛至 `components/`，`NewTask.tsx` 主入口收敛为 117 行（符合 ≤ 150 行要求）。
  - 后端路由架构：`app.ts` 单文件精简至 24 行，路由模块清晰拆解至 `routes/`。
- **Baseline Smell Check (Fowler)**: 0 findings.

---

## 4. Spec Axis

- 全部 7 项可靠性缺陷修复（B1~B7）经代码与单测双重验证。
- 爬虫领域契约（exports `./domain`, `./events`）统一，跨包相对路径彻底消除。
- 核心引擎解耦，默认人读文本快照测试逐字节 100% 对齐。
- 后端 Reducer 纯函数抽取，路由模块化。
- 前端状态机 `useReducer` 重构，0 环依赖，主文件精简至 117 行。

**Spec Findings**: 0 findings.

---

## 5. Summary

- **Total findings per axis**:
  - **Standards**: 0 findings
  - **Spec**: 0 findings
- **Verdict**: **PASS**
