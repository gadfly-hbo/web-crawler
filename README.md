# web-crawler

网络爬虫项目仓库：多个爬虫项目统一管理（pnpm workspace monorepo）。

## 结构

```
web-crawler/
├── crawlers/          # 每个爬虫一个自包含目录，可独立运行
├── apps/              # 面向用户的应用（如数据采集工作台 workbench）
├── packages/          # 共享库（暂未抽取，见下方约定）
├── data/              # 各爬虫与工作台统一输出目录（gitignore，不入库）
└── scripts/           # 仓库级脚本（预留）
```

## 数据采集工作台（非技术同学入口）

双击根目录 **`启动采集工作台.command`** 即可：首次运行自动安装依赖、构建界面并打开浏览器。在页面里选公司/行业 → 预览数量 → 开始采集，进度实时可见，产出的 PDF 可直接下载或在 Finder 中管理。

技术细节见 [`apps/workbench`](./apps/workbench/README.md)。

## 爬虫清单

| 目录 | 目标 | 说明 |
| --- | --- | --- |
| [`crawlers/cninfo-reports`](./crawlers/cninfo-reports) | 巨潮资讯网 | A 股上市公司财报（年报/中报/季报），支持按公司、行业、年份筛选下载 PDF；`--json` 输出 NDJSON 事件供工作台消费 |
| [`crawlers/api-connector`](./crawlers/api-connector) | 通用 API 接口 | 声明式 HTTP/RESTful 接口数据与附件采集引擎，支持自动翻页、JSONPath 提取与原子落盘 |

| 应用 | 说明 |
| --- | --- |
| [`apps/workbench`](./apps/workbench) | 数据采集工作台：面向非技术运营的本机 Web 界面（双击 `启动采集工作台.command` 启动） |

## 快速开始

前置：Node ≥ 18、pnpm。

```bash
pnpm install

# 例：下载平安银行 2024 年年度报告
pnpm --filter cninfo-reports start -- --company 平安银行 --year 2024 --type annual
```

## 约定

- 每个爬虫位于 `crawlers/<name>`，自包含、可独立运行，必须附带 README（目标站点、运行方式、输出说明）。
- 输出数据统一写入仓库根 `data/<crawler-name>/`，不入库。
- 密钥与本地配置走各爬虫目录下的 `.env`（提供 `.env.example` 模板），`.env` 不入库。
- 共享代码暂不抽取：待 2~3 个爬虫出现重复后，把稳定部分抽到 `packages/`，以 `workspace:*` 协议引用。
- 新增爬虫：在 `crawlers/` 下新建目录（已被 workspace 通配覆盖）→ 完善其 README → 更新本文件爬虫清单。

## 多机同步

Mac mini 提交推送后可经 SSH 自动把 MacBook 同步到最新（fast-forward only，安全跳过脏工作区）。按机器做局部配置（不入库）：

```bash
git config --add sync.targets 'macbook:/Users/huangbo/Dev/Projects/web-crawler'
```

配置后用 `git-sync` 技能（或 `/git-sync`）提交推送，完成即自动同步 MacBook；MacBook 侧改完代码建议自行提交推送，避免两端分叉。

## 合规

所有爬虫仅用于公开数据的个人研究用途；遵守目标站点 robots.txt 与合理请求频率（各爬虫内置限速与重试），登录态凭据不得提交入库。
