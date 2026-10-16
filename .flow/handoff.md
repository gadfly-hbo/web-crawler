# dev-flow 交接卡 — 递延项收敛批（F6 领衔）（DONE 2026-10-16）

## 本批交付

- 提交 `3aec771`（main，已推送 origin）：24 文件，+940/−334（产品代码约 15 行，其余为测试与流程产物）。
- **F6 修复**：firecrawl engine 快照改落 `outDir/snapshots/`——`--analyze`、workbench `/snapshot-content` 与 `/evidence` 三消费端首次真实对齐；**A18 补强**：mock 商品样板分析真实产出（totalRecords=9、三品牌中位数），冒烟用例改产物等待（`waitForFile`，规避 done 事件先于分析管线的既有竞态）。
- **limitations 闭环**：cninfo/api manifest 各传 2 条如实声明；商品任务详情渲染 manifest 卡（UI 增量 S5，合同补记用户批准）——四类正式任务限制声明展示面收敛一致。
- **A19 收口**：无点数字/十六进制 IP 编码经 egress 判类（`134744072` 拒绝）；扩展名补 .yaml/.yml/.csv/.snap + fixture 佐证。
- **RSS 标题**：`RSS 采集 · 名（N Feed）` 去同质；**N4**：超时回调补 canceled 检查，取消任务不再被伪「任务超时」污染。
- **验证**：三段 exit 0，**205/205**（基线 204 + 1）；SHIP 前 fail-closed 复跑一致；评审一轮 PASS（0 blocking，两处实现偏差裁必要且正确）。

## 递延项台账更新

已清偿：F6、cninfo/api limitations、商品面板 manifest 卡、A19 R2-1/F-2、RSS 标题（UI 合同 F2）、N4。

仍递延（按优先级）：

1. **N2（api-connector 预算定容）**：每跳计费后 `maxCalls = maxPages + 5` 未重新定容，多附件任务可能中途熔断——需要公式设计决策（分页/下载分池 or 上限重定容）。
2. **N5/N6**：三处代码异味（runner 无效别名等）与四处覆盖缺口（5 跳上限/301/302 改写/mock 脱敏/每跳计费断言）。
3. **Ctrl-C 孤儿爬虫关停清理**（WC-AR-05 GRILL Q7 遗留，需信号处理设计）。
4. **A19 残余观察项**（评审 non-blocking）：engine.test 顶层断言措辞、N4 用例时序前提（极端负载假红风险，复跑政策在案）、PRD 两处口径 nit。
5. **FA1/FA2**（UI 合同增量披露）：商品详情双导出按钮与 caveats 双呈现收敛、卡头副标 data-governance 措辞——属后续视觉批。
6. **TaskList view-desc 措辞**（「先预览数量」对直采场景不全真，需新 PRD）。
7. **WC-AR-03 AgentReachBridge**：维持暂缓，触发条件满足时另评审。

## 已知限制

- `/snapshot-content`、`/evidence` 的 HTTP 路由级端到端未单独起服探针（PRD 决策 3 裁定以落盘产物为准；可用性由三证合成推理，置信度高）。
- firecrawl `done` 事件先于分析管线完成是既有协议语义（状态 succeeded 时产物可能仍在写）——UI 侧 manifest 卡为打开时拉取天然容忍；如未来需要严格时序属协议批。

## 流程产物

`.flow/` 下 proposal / red-team / prd（含 G1-G6）/ ui-contract（含已批准增量补记）+ ui/（index + addendum）/ tasks（含证据）/ review-findings 随 3aec771 入库；state.json 本机状态。

## 降级披露

本批无降级：红队、GRILL 盲审、UI-GATE 增量、REVIEW 均为 fresh 子代理；实现期两处红队预判偏差（pipeline.test 驱动路径、waitForFile 竞态）经调试脚本实证后修正并如实记录（评审裁「必要且正确」）。
