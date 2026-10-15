# WC-AR-05 执行治理增量：runner 超时/进程组 + 出口门禁 + 凭据 argv 消除（proposal）

> 规格来源：《Agent-Reach 能力吸收采纳评审与融合方案 v1.1》（docs/AGENT_REACH_ADOPTION.md §8 WC-AR-05 行、§2.2 缺口表、§7 A02/A10 行），上一批 WC-AR-02 已 DONE（2c1d664），本批为其后续。本文件钉为本轮 dev-flow 的唯一规格源。

## 背景与定位

采纳评审确认：引入任何带凭据/联网新渠道（WC-AR-04 RSS PoC）前，必须先补齐执行治理三缺口。本包只做治理增量，不新增渠道、不改任务状态机、不动既有爬虫业务逻辑。

## 已定决策（约束，不可被后续阶段推翻）

1. **runner 任务级超时**：workbench runner 增加任务级超时机制（红队/评审确认的缺口：runner.ts:29-73 无任何超时）；超时到达时走与取消相同的终止路径（SIGTERM → 宽限 → SIGKILL）。验收对应报告 A02 的通用部分（"诊断/子进程永不返回"时任务能终结）。
2. **进程组终止**：终止信号作用于进程组/进程树，不只杀直接子进程（现状 runner.ts:64-73 只杀直接子进程；爬虫子进程再 spawn 的孙进程会泄漏）。
3. **URL 私网/回环拦截（对所有爬虫生效）**：采集目标 URL 在发起前经过私网/回环地址检查并拒绝（现状：全仓无对应代码）。验收对应 A10。
4. **`--api-key` 从 argv 消除**：web-scraper 的 Firecrawl API key 不再以命令行明文传递（runner.ts:154 现状），改为仅 env 注入。验收：spawn 的 argv 不再含密钥。
5. **既有取消测试不回退**：取消（SIGTERM→SIGKILL）语义与既有测试保持通过，超时/进程组改动不得破坏。
6. **范围排除**（本包不做）：浏览器 localStorage 明文凭据（SettingsModal.tsx:72）与服务端 process.env 重启即失的治理——采纳文档 §8 的 WC-AR-05 行未含此项，留待凭据治理专项；诊断桥（WC-AR-03 暂缓）；任务状态机扩展。
7. **兼容性硬约束**：全量测试保持全绿（当前 138）；typecheck/build 通过。

## 被拒绝的替代方案（记录，不再复议）

- ChannelRegistry 插件架构（采纳文档 §3 已定不建）——治理改动落在既有 runner/校验 seam 上。
- 审批态/DRAFT 状态机（§2.2 已定本地单用户不需要）。

## 验收标准

1. A02 通用部分：构造一个永不返回的爬虫子进程，任务在超时后终结（状态 failed，事件流有终态），无残留进程。
2. 进程组：子进程再 spawn 的孙进程随任务终止被杀。
3. A10：私网/回环 URL（如 `http://127.0.0.1`、`http://192.168.x.x`、`http://localhost`）被拦截并给出中文错误；对三个爬虫统一生效。
4. argv 无密钥：web-scraper spawn 的命令行参数中不出现 apiKey 值；密钥仅经 env 传递；爬虫端从 env 读取的功能正常（mock 路径可测）。
5. 全量门禁：`pnpm test && pnpm typecheck && pnpm build` 全绿。

## 开放问题（留给 PRD/GRILL）

- 超时的默认值与可配置面（任务参数字段 vs 全局常量；默认时长）。
- 私网拦截的实施层：workbench 校验期（validate*Params）拦截 vs 爬虫运行时拦截 vs 两者；DNS 解析后指向私网的间接形态（rebinding）是否在本包覆盖。
- 进程组终止的实现方式（detached 进程组 + 负 pid kill vs 其他），macOS/Linux 语义差异。
- apiKey 的 env 命名与爬虫端读取点的兼容性（既有自托管/云模式的行为不变式）。
