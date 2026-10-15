# PRD: WC-AR-05 执行治理增量——runner 超时/进程组 + 出口门禁 + web-scraper 凭据 argv 消除

> 规格源：`.flow/proposal.md` ＞ 本 PRD。红队：`.flow/red-team.md`（verdict GO，3 条附带条件已在本 PRD §实现决策 7/8/9 与 §Out of Scope 处置）。无 issue tracker，按 dev-flow 降级规则落盘本文件。

## Problem Statement

引入新联网渠道（WC-AR-04 RSS）前，执行面有三个实证缺口：runner 无任务级超时且只杀直接子进程（`runner.ts:26-73`，子进程永不返回时任务悬挂、孙进程泄漏路径无防护）；全仓无私网/回环 URL 拦截（SSRF 面无防护）；web-scraper 的 Firecrawl apiKey 以明文进 spawn argv（`runner.ts:152-155`，`ps` 可见）。

## Solution

四处最小治理增量：runner 增加任务级超时（默认 + 任务参数可覆盖）并改造为进程组终止（detached + 负 pid 信号）；共享 URL 出口守卫落在 data-governance（三爬虫公共依赖），校验期拦截 web-scraper/api-connector 的采集目标 URL，cninfo 对 `CNINFO_ORIGIN` 应用同一守卫，api-connector 引擎运行时对重定向逐跳重检；web-scraper 的 apiKey 仅从 argv 删除（env 链路已端到端存在，爬虫端行为不变）。另修一个红队发现的真实边缘：重启后带脱敏假密钥的 queued 任务直接标 failed。

## User Stories

1. As a 工作台用户，I want 永不返回的爬虫子进程在超时后任务自动终结为 failed，so that 队列不被悬挂任务卡死（A02 通用部分）。
2. As a 工作台用户，I want 终止信号覆盖整个进程组，so that 未来爬虫引入孙进程时不泄漏（前瞻性防护，当前爬虫无孙进程）。
3. As a 工作台用户，I want 任务级超时可按任务覆盖（timeoutMs），so that 合法的长时间 cninfo 采集不被全局默认误杀。
4. As a 安全维护者，I want 私网/回环/链路本地地址（含十进制/十六进制 IP 变体）在任务校验期被中文错误拒绝，so that 采集目标不会指向内网（A10）。
5. As a 安全维护者，I want api-connector 跟随重定向时每跳重新检查目标，so that 公网 URL 302 跳私网不能绕过预检。
6. As a 安全维护者，I want web-scraper spawn 的 argv 不含 apiKey 明文，so that `ps` 不再暴露凭据；CLI 直用 `--api-key` 的用户路径不受影响。
7. As a 工作台用户，I want 重启后残留 queued 任务若只持有脱敏假密钥则明确标 failed，so that 不以不可溯源的 401 静默失败。
8. As a 维护者，I want 既有 138 项测试全绿、取消语义不回退，so that 治理增量对主线零风险。

## Implementation Decisions

1. **任务级超时**：`spawnRunner` 增加 `timeoutMs` 选项；到点后先输出人读日志行（任务超时，已终止），再走与取消相同的终止路径（SIGTERM→宽限→SIGKILL，见决策 2）；终态沿用现有"runner 的 done 拒绝 → failed"分类。默认值 `DEFAULT_TASK_TIMEOUT_MS = 60 * 60 * 1000`（60 分钟）：本机无真实时长数据可校准（tasks.json 最长 5s），cninfo 多公司×多报告类型合法任务可达数十分钟，取宽裕默认 + 任务参数 `timeoutMs`（TaskParams 联合层可选字段，正整数校验）覆盖；测试用小值。
2. **进程组终止**：spawn 加 `detached: true`（POSIX 新进程组）；终止用 `process.kill(-pid, sig)`，对已退出进程组的 ESRCH 容错（try/catch）；`SpawnHandle` 暴露 `pid` 供测试断言残留。仅 macOS 实证，Linux 语义差异记录为未验证项；服务自身 SIGINT 关停清理不在本包（记录已知限制）。
3. **共享出口守卫**：data-governance 新增纯函数（如 `isPrivateOrLoopbackUrl(url): boolean` / `assertPublicHttpUrl`），覆盖：`localhost`/`*.localhost`、`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16`、`0.0.0.0`、`::1`、`fc00::/7`、`fe80::/10`，以及十进制/十六进制/短格式 IP 变体（如 `2130706433`、`0x7f000001`）；仅按 URL 字面解析，**不做 DNS 解析**（rebinding 记录为已知限制）。
4. **校验期拦截（红队条件 2 的可测化）**：`validateWebScraperParams` 对 `urls` 逐项、`validateApiConnectorParams` 对 `request.url` 调共享守卫，中文错误（风格随现有校验消息）；cninfo 对 `CNINFO_ORIGIN` 在 CLI 校验期调同一守卫——三个爬虫的**采集目标/请求发起对象**全部经过守卫（提案"对所有爬虫生效"的落地语义）。web-scraper 的 `baseUrl`（Firecrawl 服务端点）**豁免**：自托管合法指向私网（既有测试 api.test.ts:318 即用 localhost 端点），且 baseUrl 不是"采集目标 URL"。
5. **重定向逐跳重检**：api-connector 引擎请求路径改 `redirect: 'manual'` 自行跟随，每跳对 Location 目标调守卫，限 5 跳；web-scraper 的实际抓取由 Firecrawl 服务端执行，其重定向目标不受本地门禁约束——记录为已知限制（云端代抓固有能力边界）。
6. **apiKey argv 消除**：`buildCrawlerSpawnSpec` 的 web-scraper 分支删除 `--api-key` argv 注入，保留既有 env 注入（runner.ts:153）与 adapter 的 `config.apiKey || process.env.FIRECRAWL_API_KEY` 回退（adapter.ts:21）；爬虫 CLI 的 `--api-key` 解析保留（直用 CLI 的用户路径不变）。**同批必须改写 `runner-dispatch.test.ts:110-136`**：argv 断言从"含密钥"反转为"不含密钥"（红队条件 3，列入"不回退"清单）。
7. **重启脱敏假密钥边缘（红队 KA4）**：queue 重启恢复时，queued 任务的 `params.apiKey` 若为脱敏形态（含 `****`）则标 failed 并记录原因（密钥随服务重启失效，需重新提交）。
8. **api-connector headers 泄漏的显式排除（红队条件 1）**：api-connector 的 `request.headers` 经 `--config-json` 整体进 argv 且 tasks.json 不脱敏——属实，但本包不修：headers 是任意键值集合，脱敏/注入机制需专项设计，与单字段 apiKey 的现成 env 链路不同构；采纳文档 §8 的 WC-AR-05 范围本就只列 `--api-key`。记录为凭据治理专项缺口（与 localStorage/process.env 持久化同类）。
9. **不做的事**：不改任务状态机；不动爬虫业务逻辑；不引入 ChannelRegistry；不做服务关停的进程组清理；不做 DNS rebinding 防护。

## Testing Decisions

好测试标准：只测外部可观察行为（任务终态、进程存活、校验错误清单、argv 内容）；沿用既有测试基建——真子进程 fixtures（fake/slow/stubborn-crawler.mjs 模式）、Runner fake seam（queue.test.ts:27-51）、waitFor 轮询（queue.test.ts:65-72）；毫秒级超时参数保证不 flaky（既有 SIGKILL 用例 135ms 稳定，本仓无 CI 仅本地跑）。

- **runner 超时**：新增 `hang-forever.mjs` fixture + `timeoutMs: 200` → 断言任务终态 failed、事件流有终态、fixture 进程不存活（pidfile 或 `process.kill(pid, 0)` ESRCH 轮询）。
- **进程组**：fixture spawn 孙进程并写 pidfile、emit ready 行 → cancel → 轮询孙进程 pid 至 ESRCH。
- **出口守卫**：data-governance 纯函数参数化用例（上列地址族 + 公网对照 + 十进制/十六进制变体）；workbench 校验测试断言中文拒绝；cninfo CLI 校验期对 CNINFO_ORIGIN 的守卫用例。
- **重定向**：api-connector 引擎测试用本地 server 302→`127.0.0.1`，断言被拦。
- **argv**：`buildCrawlerSpawnSpec` web-scraper 分支断言 argv 不含 apiKey 值且 env 含 `FIRECRAWL_API_KEY`（改写既有 runner-dispatch 断言）；爬虫端 env 回退路径功能测试。
- **重启边缘**：queue 重启恢复模式（176-194 行先例）+ 带脱敏 apiKey 的 queued 任务 → failed。

## Out of Scope

- api-connector `request.headers` 的 argv/落盘凭据泄漏（决策 8 记录排除理由，凭据治理专项）。
- localStorage 明文凭据、process.env 重启即失（采纳文档 §8 未列入 WC-AR-05，同属凭据专项）。
- DNS rebinding 防护；web-scraper 云端重定向约束；服务 SIGINT 关停清理；Windows 进程组语义。
- RSS 渠道本身（WC-AR-04）。

## Further Notes

- 验收口径映射：A02 通用部分=决策 1+2；A10=决策 3+4+5（重定向）；argv=决策 6；既有取消测试不回退 + runner-dispatch 断言反转=决策 6 的同批改写。

---

## PRD diff gate 记录（auto 模式）

相对 proposal.md 的 diff（全部纯增量/开放问题裁决，无改变或丢弃提案已定决策，自批准）：

1. api-connector headers 泄漏的显式排除理由（红队 GO 条件 1；提案决策 4 本就限定 web-scraper apiKey，此处补叙事完整性，范围不变）。
2. 验收 3 可测化（红队 GO 条件 2）：cninfo 对 CNINFO_ORIGIN 应用同一守卫以兑现"对所有爬虫生效"；baseUrl 豁免（非"采集目标 URL"语义）；web-scraper 云端重定向记录为已知限制。
3. 新增决策 7：重启后带脱敏假密钥的 queued 任务标 failed（红队 KA4，提案未提及的边缘，纯增量修复）。
4. 超时默认值 60min + 任务参数 timeoutMs 覆盖（裁决提案开放问题 1；本机无时长数据，取宽裕默认防误杀）。
5. api-connector 引擎 redirect: 'manual' 逐跳重检（裁决提案开放问题 2 的重定向维度；A10 行含"重定向越界"）。
6. runner-dispatch.test.ts:110-136 的 argv 断言反转列入"不回退"同批改写清单（红队 GO 条件 3）。

---

## GRILL 决议附录

### Round 1（author-blind 子代理，7 个问题包，主代理核验关键证据后全部采用推荐答案）

1. **Q1 cninfo 守卫与既有 e2e 冲突**：引入显式豁免 env `CNINFO_ALLOW_PRIVATE_ORIGIN=1`（先例：http.ts:28 的 env override = 本地测试模式惯例）；`CNINFO_ORIGIN` 与 `CNINFO_STATIC_ORIGIN`（cninfo.ts:7-8，两个都是请求发起对象）一并纳入守卫；既有两个 e2e 测试文件 env 各加豁免行，另写正向拒绝用例。
2. **Q2 timeoutMs 入口**：扩展 `normalizeParams`（tasks.ts:14-96）三个分支透传 `timeoutMs`（仅 typeof number 保留），校验正整数、不设上限；UI 本包不做；`makeCrawlerRunner`（runner.ts:172-176）把 `task.params.timeoutMs` 传入 spawnRunner opts。注：schemaVersion 同被 normalizeParams 剥离，属既有 seam 盲点，本包只透传 timeoutMs（schemaVersion 零生产者，无影响）。
3. **Q3 超时终态可观测性**：超时触发时 runner 先发结构化事件 `{"type":"error","message":"任务超时（N ms），已终止子进程"}`（reducer 置 failed 并写清 task.error），随后走进程组 SIGTERM→SIGKILL；done 不 reject（保持 SpawnHandle 既有不变式），onProcessDone 兜底不覆盖。
4. **Q4 下载路径纳入守卫**：api-connector 两条 fetch（分页 engine.ts:162 + 附件下载 :242）都改 redirect manual 逐跳重检；`downloadUrl` 首跳也检查（响应可控的二阶 SSRF 向量）；方法改写语义 = 303→GET、301/302 POST→GET；每跳计入 budgetGate。
5. **Q5 守卫严格解析器**：`new URL` 归一（含 `{{...}}` 模板占位替换）→ 协议白名单仅 http/https（其余含 file:/data: 一律拒绝）→ host 解析（剥 `[]`、zone-id、十/十六/八进制/短格式 IPv4、IPv6 含 `::ffff:` mapped、`fc00::/7`、`fe80::/10`、`::`、全段 `0.0.0.0/8`）→ CIDR 判定；拒绝文案分两种（"仅支持 http/https URL" / "目标地址指向内网/回环，已被出口门禁拦截"）；基于 `new URL` 的 host 字段防 userinfo 欺骗。**机械前置**：workbench package.json 新增 `data-governance: workspace:*` 依赖；data-governance exports map 注册 `./egress` 子路径。
6. **Q6 重启脱敏判定**：init 时凡 `sourceType==='web-scraper'` 且 status queued 且 `params.apiKey` 含 `****` → failed，`error: '检测到重启前残留的脱敏密钥，密钥不随服务重启保留，请重新提交任务'`；mock 不豁免；照抄 init 既有 running→failed 模式（queue.ts:56-65）+ persist。
7. **Q7 detached 的 Ctrl-C 行为 delta 记录**：detached 后终端 SIGINT 不再连带杀爬虫（爬虫成孤儿）；本包不做关停清理，PRD 已知限制明确记录该行为回退；最小清理（SIGINT handler 调 cancel）留作紧随的独立小改。

### Round 2（主代理，3 个问题包）

1. **R2-Q1 守卫 API 形态**：新文件 `packages/data-governance/src/egress.ts`，导出 `egressBlockReason(url: string): string | null`（返回中文拦截原因或 null 放行）——校验器 push 消息与引擎抛错两用的最小形态；exports map 加 `"./egress": "./src/egress.ts"`，同时从 index.ts re-export。
2. **R2-Q2 api-connector manual 重定向细节**：Location 相对解析用 `new URL(location, currentUrl)`；上限 5 跳，超限报错；每跳先 `egressBlockReason` 后请求；保持既有错误分类（`!res.ok` 分支）不变。
3. **R2-Q3 超时与取消并发**：两者共用同一终止函数（进程组 SIGTERM→宽限→SIGKILL），重复触发幂等（ESRCH 容错），取消与超时并发不产生双重事件/双重终态。

Round 2 之后无新增开放问题（预算 2 轮用完），GRILL 收敛。本批无用户可见 UI（Q2 裁决 UI 不做），UI-GATE 不适用。
