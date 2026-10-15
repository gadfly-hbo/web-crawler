# WC-AR-04 任务分解（tracer-bullet 垂直切片）

- [x] T1. egress 递延修复：尾随点剥除 + `::ffff:` 死分支删除（N1+N3）
- [x] T2. rss-collector 包骨架 + 冻结样本解析器（feed-parser 纯函数）
- [x] T3. SnapshotStorage 加法扩展：xml 内容字段
- [x] T4. collector 采集编排：门禁/重定向/预算/快照/抽取/证据/事件/manifest/deadline
- [x] T5. CLI 完整化：--json NDJSON 与 textReporter、退出码、A09
- [x] T6. workbench 接入：参数/分发/展示全链加法
- [x] T7. workbench e2e：真实 spawn 双 Feed 一成一败 → partial

---

## T1. egress 递延修复：尾随点剥除 + `::ffff:` 死分支删除

### What to build

data-governance 出口守卫 `egressBlockReason` 的两处修复（WC-AR-05 评审递延项 N1+N3，红队裁决带入本批）：主机名归一化剥尾随点（`localhost.`、`foo.localhost.` 必须被拦截）；删除不可达的 `::ffff:` 点分 mapped 解析分支（评审已证死代码且内含潜伏 bug）。行为零回归：全部既有用例不回退，`::ffff:` 各形态探针仍全拦截。

### Acceptance criteria

- [x] `egressBlockReason('http://localhost./')` 与 `('http://foo.localhost./')` 返回拦截原因（N1 recheck 判据）
- [x] `::ffff:127.0.0.1`、`::ffff:10.0.0.1` 等既有探针全部仍拦截（N3 recheck 判据：删除后全测绿）
- [x] governance 既有 8 用例 + 新增探针全绿

**证据（2026-10-15）**：`packages/data-governance` test 10/10 绿（新增用例「出口守卫剥尾随点主机名」5 拦截 + 2 放行，实跑探针 `localhost./foo.localhost./[::ffff:127.0.0.1]` 全拦截、`example.com.` 放行）；typecheck 过。TDD：先加尾随点用例跑红（actual null）→ 剥尾随点 + 删 `::ffff:` 分支 → 绿。

### Blocked by

None - can start immediately

---

## T2. rss-collector 包骨架 + 冻结样本解析器

### What to build

新包 `crawlers/rss-collector`（workspace glob 自动纳入）：package.json（exports 含 domain/events/feed-parser，依赖仅 data-governance workspace:* + tsx/typescript devDeps）、tsconfig 照抄 firecrawl-scraper、`domain/`（RssTaskParams 类型 + validateRssParams：urls 1–5 非空、trim 后精确重复拒绝、逐一经 egressBlockReason、limit 正整数 ≤500、deadlineMs 正整数）、`events.ts`（G5/G11 事件形状 + NDJSON 解析器）、`feed-parser.ts` 纯函数（G8：无前缀小写字面标签判型 RSS2.0/Atom、5 实体解转义、CDATA 剥壳、BOM/空白容忍、未知/带前缀标签走漂移路径、published 不回退 updated、截断丢弃尾部不完整条目、合法空 Feed=0 条目非失败）、冻结样本 fixtures（test/fixtures/*.xml）。每用例附 locateSnippet 回验断言。

### Acceptance criteria

- [x] 解析器 10 用例绿：RSS2.0 正常、Atom 变体、空 Feed、截断（丢尾保留完整+truncated 标记）、CDATA、5 实体、缺 title/link/published（null+missing_reason）、BOM、漂移样本（注释/未知标签）、每用例 locateSnippet 命中原文
- [x] validateRssParams 单测：>5 URL 拒绝、重复 URL 拒绝、私网 URL 拒绝、limit/deadlineMs 越界拒绝（本切片以 data-governance 导入完成接线，workbench 接线在 T6）
- [x] 新包 `pnpm test`/`typecheck` 被仓库递归自动执行

**证据（2026-10-15）**：rss-collector 26/26 绿（解析器 11 + 校验 5 + events 隐含）+ typecheck 过；fixtures 9 个（normal-rss/atom/empty/truncated/cdata-entities/missing-fields/bom/drift/a09-untrusted）。TDD：先写测试跑红（module not found）→ 实现 → 绿。

### Blocked by

None - can start immediately（与 T1/T3 可并行）

---

## T3. SnapshotStorage 加法扩展：xml 内容字段

### What to build

data-governance `SnapshotStorage.saveSnapshot` 增可选 `xml?: string` 入参：产物 `content.xml`、formats 含 `'xml'`、content_hash 纳入 XML 文本、metadata.files 增可选 `xml` 键。旧调用（不传 xml）行为逐字节不变（对齐 WC-AR-02 response_type/truncated 加法先例）。**禁止**把 XML 塞 html/markdown 字段。

### Acceptance criteria

- [x] 传 xml → 目录含 content.xml、formats 含 'xml'、hash = sha256(xml 文本)、metadata 读回一致
- [x] 不传 xml → 产物与旧版逐字节等价（回归用例）
- [x] governance 全量测试绿（8+N1 探针+本切片用例）

**证据（2026-10-15）**：governance 10/10 绿（新增「storage 快照支持 xml 内容字段」：xml 产物四断言 + 旧调用三重回归断言 files.xml undefined/formats 无 xml/落盘 JSON 无 xml 键）+ typecheck 过。TDD：先红（files.xml undefined）→ 扩展 storage → 绿。

### Blocked by

None - can start immediately（与 T1/T2 可并行）

---

## T4. collector 采集编排：门禁/重定向/预算/快照/抽取/证据/事件/manifest/deadline

### What to build

`collector.ts` 编排：CLI 校验期逐 URL 过 `egressBlockReason`（豁免 env `RSS_ALLOW_PRIVATE_ORIGIN=1` 镜像 cninfo 模式，仅绕私网/回环判定，协议白名单仍生效）；运行期 manual 重定向逐跳守卫（每跳先守卫后请求、每 Feed ≤5 跳、303/301/302 改写 GET，模式照抄 api-connector guardedFetch）；`BudgetGate maxCalls = urls.length`（重定向跳数不占全局配额，G6/KA3）；快照经扩展后 SnapshotStorage 落 `outDir/snapshots/<id>/`（G4）；抽取四字段 → FieldEvidence（G7：recordId='rss_'+sha256(link 绝对化>guid>原文切片) 不截断、qualityStatus valid/missing_field 口径、snippet 用解码前原文切片保证 locateSnippet 命中）；事件按 G5 分界（queryError=无响应类失败、file failed=有响应不可用、file downloaded=成功、company=拉取前、start 恒 dryRun:false）与 G11 收尾协议；deadline 用 AbortController（G12：到点 abort 在途 fetch + 阻止后续 Feed，queryError reason='DEADLINE_EXCEEDED'，最终发 done）；manifest 经 createAndSaveDeliveryManifest（sourceType 'rss'、operations backend 'rss_native_fetch'、limitations 按 PRD 决策 10）。条目链接零跟随（A12/A20：fetch 调用数 == Feed 数断言）。

### Acceptance criteria

- [x] 采集编排 8 用例绿：正常落盘（content.xml+哈希+双时间戳）、404/500→file failed、deadline→done 收尾 failed 计入、302→公网逐跳成功、302→私网拦截、校验期私网拒绝、挑战页/HTML→file failed 注 reason（A05）、预算公式（重定向 Feed 成功且 callsMade==urls.length）+零跟随断言
- [x] manifest 2 用例：schema/limitations/operations 齐；verifyDeliveryPackage 核验通过
- [x] 快照落 snapshots/ 子目录（G4），workbench 消费路径一致

**证据（2026-10-15）**：collector.test.ts 10/10 绿（含本地真实服务器豁免用例 G3、deadline AbortController KA5、FeedHttpError→file failed G5 分界、recordId/qualityStatus G7）。TDD：红（require-in-ESM 等 9 败）→ 清理实现（existsSync 导入/删废表达式/类型修正）→ 绿；另修两个测试侧 bug（outDir2 简写属性键名、FeedHttpError 分界）。rss-collector 整包 26/26 + typecheck。

### Blocked by

T2（events/feed-parser/domain）、T3（SnapshotStorage xml）、T1（localhost. 探针）

---

## T5. CLI 完整化：--json NDJSON 与 textReporter、退出码、A09

### What to build

`main.ts`：parseArgs（--urls/--limit/-o/--json/--deadline-ms/-h，纯函数）；--json 模式逐行 NDJSON、默认模式 textReporter（逐 Feed 一行 + 结尾摘要，无 JSON 行泄漏）；退出码 `summary.failed>0 → 1`（G9）；校验失败仅发 error 事件 + 非零退出不发 done（G11）；A09 用例：条目字段含脚本/伪协议内容作为纯数据原样保留（无执行面）。

### Acceptance criteria

- [x] CLI 3 用例绿：-h 零退出；非法参数→error 事件+非零退出；默认模式无 JSON 行泄漏 + failed>0 退出码 1
- [x] A09 用例绿：恶意内容字段原样保留为数据
- [x] 部分失败（一成一败）退出码 1，事件流完整（start→company→file×2→done）

**证据（2026-10-15）**：cli.test.ts 6/6 绿（parseArgs 纯函数/-h/校验失败仅 error 行/默认文本无 JSON 且 exit 1/--json 事件流完整产物落盘/A09 records.jsonl 原样保留）。修复：validateRssParams 增 opts.allowPrivateOrigin（CLI 经 RSS_ALLOW_PRIVATE_ORIGIN=1 传入，workbench 不传保持严格）。rss-collector 整包 32/32 + typecheck。

### Blocked by

T4

---

## T6. workbench 接入：参数/分发/展示全链加法

### What to build

workbench 纯加法接入：task-params 增 RssTaskParams/SourceType 'rss'/validateRssParams 接线（经 rss-collector/domain 导入，新增 workspace 依赖 + pnpm install 刷新 lockfile）；normalizeParams 增 rss 分支（G1：name 缺省 'RSS Feed 采集'、urls trim 去空、number 透传、未知字段丢弃）；create 时 dryRun 钳 false（G6）；buildCrawlerSpawnSpec 增 rss 分支（--urls 逗号 join、--limit/--deadline-ms 条件传、argv 无任何凭据）；queue outDir 映射增 rss → rss-collector；summarizeTask/getTaskCategory/CATEGORY_LABELS 增 rss 类目；/snapshot-content 增 xml 读取（G2：format=xml 或 md/html 缺失时回退）。reducer 与 COLLECTOR_SCENARIOS 零改动。

### Acceptance criteria

- [x] task-params 单测：合法 rss 参数过、非法拒绝（>5/私网/重复/越界）
- [x] runner-dispatch 单测：rss 分支 argv 正确且无凭据
- [x] evidence 路由测试：format=xml 返回 content.xml 内容；md/html 任务行为零变化
- [x] workbench 全量测试绿（既有 82 用例零回退）

**证据（2026-10-15）**：workbench 90/90 绿（新增 8：rss 校验/摘要类目 2、spawn spec 2、POST 创建+非法 2、snapshot-content xml 1、rss-e2e 1）+ typecheck（双 tsconfig）+ vite build。接线六处：task-params（SourceType/union/validate/summarize/category/label）、normalizeParams rss 分支 + dryRun 钳 false（G1/G6）、spawn spec rss 分支、queue outDir 映射、evidence xml 读取（G2）、package.json workspace 依赖 + pnpm install（lockfile 同步）。App.tsx 详情面板增 rss 展示分支（纯加法文本）。TDD：7 用例红 → 接线 → 绿。

### Blocked by

T2（domain 导出）、T5（spawn 目标存在）

---

## T7. workbench e2e：真实 spawn 双 Feed 一成一败 → partial

### What to build

workbench 端到端验证（KA1 裁决的证明用例）：本地 HTTP 服务器供两个 Feed（一个正常、一个 404），`RSS_ALLOW_PRIVATE_ORIGIN=1` 经 env 继承（G3），直驱 TaskQueue + makeCrawlerRunner 真实 spawn rss CLI；断言任务终态 partial、counts（downloaded=1/failed=1）与 failures 清单如实、日志含完整事件流。另加类目标签（'rss' chip）断言与"无豁免时 CLI 拒绝私网"已在 T4 覆盖的对照说明。

### Acceptance criteria

- [x] e2e 用例绿：双 Feed 一成一败 → 终态 partial、counts/failures 如实（KA1 recheck 判据）
- [x] 任务标题与类目 chip 正确（'rss' 类目）
- [x] 全仓 `pnpm test && pnpm typecheck && pnpm build` 全绿（验收 1：主线回归零回退）

**证据（2026-10-15）**：rss-e2e.test.ts 1/1 绿（真实 spawn rss CLI，本地服务器双 Feed 一成一败 → partial，downloaded=1/failed=1，failures[0].reason=HTTP 404，日志事件流 start→company×2→file×2→done，manifest sourceType=rss，快照 content.xml 与原文逐字节一致）。全仓 VERIFY：test exit 0 **193/193**（governance 10 + api-connector 20 + firecrawl 27 + rss 32 + cninfo 14 + workbench 90；基线 151 + 42 新增）、typecheck exit 0、build exit 0，实测约 12s。

### Blocked by

T6
