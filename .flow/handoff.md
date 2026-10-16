# dev-flow 交接卡 — WC-AR-06 工作台体验与回归包（DONE 2026-10-16）

## 本批交付

- 提交 `3b86356`（main，已推送 origin）：23 文件，+1816/−373。
- **RSS 场景放开**（UI 合同经用户批准）：场景卡（第 3 位）+ `SCENARIO_SOURCE_TYPES` 显式映射（类型层消灭静默回落）+ RssPicker 表单（Feed URL 多行 + 条目上限）+ 「开始 RSS 采集」直采 + StageBar 两段式变体。
- **任务列表五类目分区**：`CATEGORY_ORDER` 单源数据驱动（cninfo→product-price→weather→api→rss），补齐既有 product-price 任务不可见缺口；空类目隐藏；`partitionTasks` 纯函数。
- **限制声明展示**：UniversalManifestCard 常显「⚠️ 限制声明」区块（RSS 任务详情可见，无则不渲染）。
- **A 用例固化**：A01（依赖 15 名基线/零 agent-reach/无安装脚本）+ A18（mock 商品样板采集链路冒烟，分析链路显式递延 F6）+ A19（51 文本文件主机名扫描，IP 经 egress 判类）。
- **验证**：三段 exit 0，**204/204**（基线 194 + 10），SHIP 前 fail-closed 复跑一致；评审 2 轮（FAIL/PASS）。

## 采纳文档工作包状态（全部完结）

00 基线 ✓ → 01 采纳评审 ✓ → 02 契约增量 ✓ → 05 执行治理 ✓ → 04 RSS PoC ✓ → **06 工作台体验与回归包 ✓（本批）** → 03 AgentReachBridge 暂缓（触发条件满足时另评审）。§6 PoC 三组验收、§8 WC-AR-06「主线样板 + RSS 样板双回归绿」均达成。

## 递延项（在案，按优先级）

1. **F6（firecrawl 快照布局地雷，最优先）**：engine 写快照到 outDir 顶层而 `--analyze`/workbench 读 `outDir/snapshots/`——mock 商品任务「成功但分析恒空」。修法约 3 行（engine 传 `path.join(outDir,'snapshots')`）；修复批同时更新 product-smoke-e2e 的 `TODO(F6)` 断言并补分析内容断言（A18 补强）。
2. **cninfo/api 补 manifest limitations**（各一行参数，PRD 决策 7 递延）+ 商品面板渲染 manifest 卡落点。
3. **A19 残留窄缺口**：R2-1 无点整数/十六进制公网编码（`134744072`）绕过判类（约 3 行：无点数字 token 先判类）；F-2 扩展名白名单前向缺口（.yaml/.csv/.snap）；F-3 `pnpm.overrides` 不设防。
4. **RSS 任务标题同质**（UI 合同 F2）：`summarizeTask` rss 分支附 Feed 数或首 host（shared 小改）。
5. WC-AR-05 遗留 N2（api-connector 预算定容）/N4/N5/N6 维持递延；N1/N3 已于 WC-AR-04 修复。
6. TaskList view-desc「先预览数量」措辞对直采场景不全真（UI 合同 F4，新 PRD 需求才动）。

## 已知限制

- UI 层无组件测试基建（本批 UI 验收 = vite build + UI 合同对照 + 分区纯函数测试）；如需引入 React 测试属独立基建批。
- A18 分析链路断言待 F6 修复批补强（本批显式不覆盖、TODO 标注在案）。

## 流程产物

`.flow/` 下 proposal / red-team / prd（含 G1-G11）/ ui-contract + ui/index.html（用户批准件）/ tasks（含证据）/ review-findings（2 轮）随 3b86356 入库；state.json 本机状态。

## 降级披露

UI 合同起草子代理在完成两份产物后最终返回时 400 中毒（疑似截图验证触发非文本内容），产物已落盘且经主代理完整性核验（六节/四裁决/N1-N10/recheck 判据/原型字符串抽查），流程未受影响。
