# WC-AR-06 独立评审报告（REVIEW · 第 2 轮）

- **日期**：2026-10-16
- **评审者**：dev-flow REVIEW 阶段第二轮独立子代理（未参与实现、未参与第一轮评审；全部结论以代码与命令实测为证）
- **fixed point（review_base）**：`2f6a931`（= HEAD，0 提交；范围 = `git diff 2f6a931` + 未跟踪新文件）
- **上轮上下文**：第一轮 verdict=FAIL，唯一 blocking 为 F-1（A19 扫描器对数字/括号 IP 字面量整体放行）；本轮任务 = 核实 F-1 闭合、对抗探针验证判类边界、复跑全量门禁、回归扫、确认 F2-F5 处置记录

## Verdict：**PASS**

F-1 已按其 recheck 判据闭合（注入 `https://8.8.8.8/x` → A19 红，实测复现），任务指定的全部对抗探针判类边界逐项正确，全量门禁三段 exit 0 且 204/204 逐包吻合，修复面收敛在 `adoption.test.ts` 单文件，F2-F5 处置记录在案。本轮新发现 2 条 **non-blocking**（R2-1 无点整数/十六进制公网 IP 编码绕过判类——G7 文字的残留窄缺口，今日零实害；R2-2 tasks.md T4 证据描述未随修复更新），均不构成阻塞。

## 1. F-1 闭合核实：**成立**

**现实现**（`apps/workbench/test/adoption.test.ts:95-114`）：新增 `BOUNDARY_PUBLIC_IPS = {11.0.0.1, 172.15.0.1}`（egress 边界测试对象）与 `ipLiteralAllowed`——构造 `http://${h}/` 后复用 `data-governance/egress` 的 `egressBlockReason` 判类：非公网段（门禁拦截 → 返回非 null reason）放行；公网（返回 null）仅边界清单放行。接线点：括号 IPv6 走 `adoption.test.ts:108`，点分数字字面量走 `adoption.test.ts:114`。

**判类底座实测**（直接调用 `packages/data-governance/src/egress.ts` 的 `egressBlockReason`，tsx 真值表）：

| 主机 | egressBlockReason | A19 侧效果 |
|---|---|---|
| `0.1.2.3` / `169.254.169.254` / `127.1` / `0x7f000001` / `0177.0.0.1` / `[fe80::1]` / `[fc00::1]` / `[::]` / `[::1]` | 拦截（非公网） | 放行 ✓ |
| `8.8.8.8` / `1.1.1.1` / `[2600::]` | null（公网） | 拒绝 ✓（不在边界清单） |
| `11.0.0.1` / `172.15.0.1` | null（公网） | 放行 ✓（命中边界清单，修复设计生效） |

短格式/十六进制经 `new URL()` 归一化（`127.1`→`127.0.0.1`、`0x7f000001`→`127.0.0.1`）后判类，符合 G7「parse 后判」。

**Recheck 判据复现（沙箱法，未触碰仓库文件）**：将仓库 rsync 复刻到 `/tmp/wc-ar06-r2-probe`（排除 node_modules 等，`adoption.test.ts` 原样未改，软链 `data-governance`），在沙箱 `test/probe.ts` 注入全部探针后运行 `tsx --test test/adoption.test.ts`：

- **exit 1，违规清单恰为 `8.8.8.8`、`1.1.1.1`、`[2600::]` 三条**（F-1 recheck「注入 `https://8.8.8.8/x` → 应红」满足，且红得点名）；
- 任务指定的 7 条应放行探针（`0.1.2.3`/`169.254.169.254`/`127.1`/`0x7f000001`/`[fe80::1]`/`[fc00::1]`/`[::]`）及附加探针（`0177.0.0.1`/`[::1]`/`11.0.0.1`/`172.15.0.1`）全部未触发违规。

## 2. 全量门禁复跑（本机实测，2026-10-16）

| 段 | 命令 | exit | 结果 |
|---|---|---|---|
| 1 | `pnpm test` | **0**（~10.7s） | data-governance 10 + firecrawl-scraper 27 + api-connector 20 + rss-collector 32 + cninfo-reports 14 + workbench 101 = **204 pass / 0 fail** |
| 2 | `pnpm typecheck` | **0** | 六包 Done，含 workbench `tsc --noEmit && tsc --noEmit -p web` |
| 3 | `pnpm build` | **0** | vite 71 modules transformed，built in 633ms，dist 产物落盘 |

各包计数取自测试日志 `ℹ tests/pass/fail` 行，与 tasks.md T6 声明的「204/204（10+27+20+32+14+101）」**逐包逐数吻合**。真实仓库运行中 `A01`、`A19` 两条用例均 ✔（workbench 101 内）。

## 3. 回归扫：修复面收敛确认

- **mtime 证据**：全部实现文件落在第一轮评审时间窗内；第一轮之后唯一被改动的代码文件是 `adoption.test.ts`。当前 porcelain 15M+8?? 相对第一轮「14 修改+8 未跟踪」多出的 1 个 M 即 `.flow/review-findings.md` 本身（第一轮报告写入），无范围外文件出现。
- **无既有用例回退**：204/204，六包计数 = 基线 194（10+27+20+32+14+91）+ 新增 10（workbench 101），两处 fixture 修正包（firecrawl 27/27、api-connector 20/20）仍绿。

## 4. F2-F5 处置记录核实：在案

`.flow/state.json` history 含完整链条：`REVIEW→CONVERGE`（第一轮 FAIL 摘要）→ `CONVERGE→IMPLEMENT`（「确认 F-1 blocking 成立；工作项=IP 判类改为复用 egressBlockReason…F2-F5 non-blocking 记录不行动」）→ `IMPLEMENT→VERIFY`（修复+探针）→ `VERIFY→REVIEW`（三段 exit 0）。四条均为前向缺口/加固建议/风格 nit/文档性 nit，无一是 correctness bug，**无升级项**。

## Findings（本轮新增，均 non-blocking）

### R2-1【non-blocking】无点整数/十六进制公网 IP 编码绕过判类——G7 枚举形式的残留窄缺口

- **证据**：`apps/workbench/test/adoption.test.ts:110-113`——`hostAllowed` 对一切无点 token 直接放行（注释自知「纯数字（如 2130706433）是 IP 编码 fixture」），未经 `ipLiteralAllowed` 判类。沙箱探针实证：`https://134744072/x`（=8.8.8.8 十进制）与 `https://0x62626262/x`（=98.98.98.98 十六进制）**过闸**（真值表两层均确认其为公网编码）。G7（`.flow/prd.md` GRILL 附录）枚举「点分/整数/十六进制/八进制统一 parse 后判类」，且「无点 token 忽略」条款明文限定为「非 IP」token——规格文字上此形式应判类。
- **定级理由（non-blocking）**：今日零实害（全仓 test 目录无点数字 URL 仅 `http://2130706433/` 回环编码，即使判类也放行）；A19 威胁模型是「误引真实端点」，无点编码是非自然形态、不会误写发生，与第一轮 F-2（扩展名白名单前向缺口）同性质、同量级；第一轮 blocking 的核心（自然形态 `8.8.8.8`/`[2600::]` 过闸）已修复。
- **归属**：spec（G7）× implementation（残留面）
- **Recheck**：无点分支内对 `/^\d+$/` 与 `/^0x[0-9a-f]+$/i` 先经 `ipLiteralAllowed` 判类（字母 token 维持忽略）→ 注入 `https://134744072/x` → A19 应红（当前绿）。

### R2-2【non-blocking】tasks.md T4 证据描述未随 F-1 修复更新

- **证据**：`.flow/tasks.md` T4 证据仍描述「数字字面量（含 0x/八进制/纯整数）、IPv6 括号」整体放行；修复后点分数字与括号 IPv6 均已改为判类（`8.8.8.8`/`[2600::]` 拒绝），该行对这两类已不属实（仅「纯整数」仍整体放行，即 R2-1）。修复处置更新了 state.json 而未同步 T4 证据行。
- **归属**：task（T4 证据）/ 文档漂移
- **Recheck**：T4 证据行更新为判类语义（点分/括号经 egressBlockReason 判类、边界公网 11.0.0.1/172.15.0.1、无点整数现状整体放行——或随 R2-1 一并收敛）。

## 观察项（不构成 finding）

- state.json history 的 `at` 时间戳为流程记事性标称时间，与文件 mtime 实际序列存在整体平移；属 orchestrator 记录风格，链条完整性与内容不受影响。
- 探针沙箱与真值表脚本位于 /tmp（均为 /tmp 产物，仓库零改动）。

## 结论

F-1 按其 recheck 判据闭合，判类边界经对抗探针与真值表双重实证，门禁 204/204 三段全绿与声明逐包吻合，修复面收敛单文件，F2-F5 处置记录在案。R2-1/R2-2 两条 non-blocking 建议随后续批次收敛（R2-1 若采纳修复约 3 行：无点数字 token 先判类再放行）。**REVIEW 第 2 轮：PASS。**
