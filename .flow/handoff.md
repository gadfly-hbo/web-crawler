# dev-flow 交接卡 — WC-AR-04 RSS 适配器 PoC（DONE 2026-10-16）

## 本批交付

- 提交 `359816e`（main，已推送 origin）：44 文件，+2725/−326。
- **新包 `crawlers/rss-collector`**：公开 RSS/Atom 只读采集——快照（content.xml + 哈希 + 双时间戳 + truncated 标记）→ 规则式抽取（title/link/published/summary，缺失 null 不估算）→ 字段级证据（locateSnippet 解码前原文切片，回验命中 confidence 1.0）→ manifest（schema/limitations/operations/snapshotsDir，verifyDeliveryPackage 可核验）→ workbench 展示（进度/失败清单/终态分级/快照 XML 回看）。
- **治理复用实证**：出口门禁（校验期 + manual 重定向逐跳守卫，RSS_ALLOW_PRIVATE_ORIGIN 仅测试豁免）、任务级 timeoutMs、进程组取消（A13 e2e）、预算门禁（maxCalls=urls.length，重定向不占配额——N2 防复发公式）。
- **data-governance 加法**：SnapshotStorage 可选 xml 字段；egress 尾随点修复（N1）+ `::ffff:` 死分支删除（N3）。
- **验证**：`pnpm test && pnpm typecheck && pnpm build` 三段 exit 0，**194/194**（governance 10 + firecrawl 27 + api-connector 20 + rss 32 + cninfo 14 + workbench 91；基线 151 + 43），SHIP 前 fail-closed 复跑一致；评审 3 轮（FAIL/FAIL/PASS）独立复跑均逐包一致。

## 下一批前置（WC-AR-06 工作台体验与回归包）

依赖 WC-AR-04 已就绪，验收 = 主线样板 + RSS 样板双回归绿：

- **RSS 场景入口放开**：`apps/workbench/shared/task-params.ts` 的 `COLLECTOR_SCENARIOS` 当前零改动（本批刻意收起）；放开 = 新增 rss 场景卡 + 新建任务表单（urls 1-5、limit、deadlineMs）。表单校验直接调 `validateRssParams`（workbench 已依赖 rss-collector/domain）。
- **来源类型/限制声明展示**：后端已备好数据面——`CATEGORY_LABELS.rss`（📡 RSS 资讯 chip）、任务详情面板 rss 分支（Feed 数/条目上限/软超时）、边界声明文案，均在 `App.tsx`/`task-params.ts` 现成可扩展。
- **A 用例固化为常规回归**：A01（不装 Agent-Reach 可跑）/A18（mock 商品样板端到端）/A19（无隐式外呼）已有测试事实，WC-AR-06 需将其固化为显式回归用例。
- RSS 创建链路：`POST /api/tasks`（sourceType 'rss'）已端到端可用（dryRun 自动钳 false）。

## 递延项（评审记录在案，均 non-blocking/info）

WC-AR-05 遗留 N2（api-connector 预算定容）/N4/N5/N6 维持递延；本批新增：

1. **F3**：egress 只剥一个尾随点，`localhost..` 多点形态仍放行（本机 DNS ENOTFOUND 无可达旁路；修复一行 `/\.+$/` + 探针）。
2. **F2 裁决记录**：manifest 手工构造（非 createAndSaveDeliveryManifest）——helper 无法表达 snapshotsDir 与 Feed 级计数；正式化时评估扩展 helper。
3. **F4/F5/F6 小异味**：existsFileSync 冗余包装、guardReason 等价分支、feed-parser 永不 null 的返回类型、边界常量三处重复。
4. **F7**：manual 重定向 3xx 每跳不消费响应体（undici 连接占用，≤5 跳有界）。
5. **R3(info)**：anyTruncated 置位先于快照落盘的边角顺序；**R3(info 二轮)**：3xx 无 Location 归类为 queryError（reducer 语义等价）。
6. **firecrawl 布局地雷**（GRILL G4 发现，本批只标注不修）：engine 写快照到 outDir 顶层而消费端读 `outDir/snapshots/`——`--analyze` 路径实际读空目录，属既有缺陷，建议独立小批修复。

## 已知限制（PRD 已声明）

- 解析器冻结样本范围：真实世界 Feed 变体（命名空间、GBK 编码等）未覆盖，正式化前需评估引入 XML 库。
- DNS rebinding 不防（与既有爬虫一致）；RSS 无凭据无 LLM，凭据渠道接入前必须先过 WC-AR-00 治理。

## 流程产物

`.flow/` 下 proposal / red-team / prd（含 G1-G12 与评审补记）/ tasks（含证据勾选）/ review-findings（3 轮）均已随 359816e 入库；state.json 为本机状态（gitignored）。

## 降级披露

本批红队为主代理内联执行（子代理两次 429 限量后按技能降级），对抗距离弱于结构性独立评审；GRILL Round 1 与三轮 REVIEW 均为 fresh 子代理（其中二轮一次 429 后 resume 成功）。
