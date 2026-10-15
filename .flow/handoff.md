# Handoff: WC-AR-02 完成后的下一批前置

> 本流程（WC-AR-02 契约增量 rev2）已于 2026-10-15 DONE，提交 2c1d664 已推送 origin/main。

## 本批交付

- SnapshotMetadata `response_type`/`truncated`（可选，snake_case；saveSnapshot camelCase 写入入口已备）
- DeliveryManifest `limitations`/`operations`（可选；构造器可选参数 + 空数组归一化键不存在）
- firecrawl engine provider 透传修复（落盘真实后端标识）
- firecrawl pipeline：caveats → limitations 升格；operations 白名单聚合（`KNOWN_OPERATION_BACKENDS`，pipeline.ts 导出）
- TaskParams 联合层 `schemaVersion` + 共享校验（零生产者，纯预留）
- 138/138 测试全绿（+8），typecheck/build 通过

## 下一批前置条件（WC-AR-04 RSS PoC 开工前必读）

1. **WC-AR-05 先行**：RSS 验收含私网 URL 拦截（A10），依赖 runner 出口门禁；凭据三暴露面治理也在 WC-AR-05。
2. **provider 联合类型扩展**：`rss_local` 不在 `crawlers/firecrawl-scraper/src/port.ts:52` 的联合内；RSS 落地时需扩类型**并同步** `pipeline.ts` 的 `KNOWN_OPERATION_BACKENDS`（隐性耦合点，GRILL Q3 已标注）。
3. **快照新字段填充**：`response_type`（建议取值如 `feed_xml`/`markdown`）与 `truncated` 由 RSS 适配器经 saveSnapshot 新参数写入；本包只备了通路。
4. **schemaVersion 生产者**：首个写入者留给 WC-AR-04 决定；现在打标只是 queue.create 一处追加，但会引出"版本号归谁管"——届时一次性裁决。

## 遗留与延期项（不阻塞，记录备查）

- 评审 5 条 non-blocking 气味（`.flow/review-findings.md`）：validateTaskParams fallthrough 丢弃 sharedErrors、schemaVersion 拒绝用例只覆盖 cninfo 分支、governance 测试标题过誉、pipeline 重复类型断言、tasks.md 内层复选框未勾。
- 旧快照 metadata 遗留 `schema_version: "1.0"` 键（类型中无此字段）——未清理，知晓即可。
- `toolVersion` 填充来源未定（本包缺省不填）。
- WC-AR-03 AgentReachBridge 维持暂缓，触发条件：出现需检测外部 CLI/环境状态的真实渠道。
- 前端展示 limitations/operations 随 WC-AR-04/06 一并设计（`ProductPriceDashboard` 的 `DeliveryManifestInfo` 子集接口届时扩展）。
