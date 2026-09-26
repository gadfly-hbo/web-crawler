# cninfo-reports

抓取 A 股上市公司定期财报（年报 / 中报 / 一季报 / 三季报）PDF 原文，支持按**公司、行业、时间**自定义筛选。

## 数据来源

全部来自 [巨潮资讯网](https://www.cninfo.com.cn)（证监会指定信息披露网站）公开接口：

- `szse_stock.json`：全量证券清单（公告查询所需的内部 orgId，每次运行请求一次约 1MB）
- `hisAnnouncement/query`：公告检索（按公司 / 行业门类 / 发布日期 / 报告类型）
- `static.cninfo.com.cn`：公告 PDF 下载

> 注：曾评估用东方财富行业板块接口做「行业 → 成分股」映射，实测其在 Node fetch 下被 CDN 指纹识别拒连（curl 偶通、Node 全挂），已改用巨潮原生行业参数，单一数据源更稳。

## 使用

```bash
# 平安银行 2024 年年度报告
pnpm --filter cninfo-reports start -- -c 平安银行 --year 2024 -t annual

# 招商银行、兴业银行 2024 年全部定期财报
pnpm --filter cninfo-reports start -- -c 600036,601166 --year 2024

# 金融业全部公司 2024 年年报（先 dry-run 预览再全量）
pnpm --filter cninfo-reports start -- -i 金融业 --year 2024 -t annual --dry-run
pnpm --filter cninfo-reports start -- -i 金融业 --year 2024 -t annual

# 指定公告发布日期窗口（不按报告期年份过滤）
pnpm --filter cninfo-reports start -- -c 000001 --from 2025-07-01 --to 2025-09-30 -t semi
```

完整参数说明：`pnpm --filter cninfo-reports start -- -h`

## 时间语义

- `--year 2024`：抓「报告期为 2024 年」的财报。A 股年报在次年 3~4 月才发布，因此检索窗口自动取 `2024-01-01 ~ 2025-12-31`（按公告发布日检索），再按公告标题中的「2024年」过滤。
- `--from/--to`：直接按公告发布日期窗口抓取，不做报告期年份过滤。

## 行业粒度

`--industry` 走巨潮原生的证监会**行业门类**筛选（19 类：金融业、制造业、房地产业、综合…），不支持更细的大类/中类。需要更精准的范围（如只要银行不要券商）时，用 `--company` 列举目标公司。

## 输出

```
data/cninfo-reports/
├── reports/<证券代码>_<公司简称>/<发布日期>_<公告标题>.pdf
└── index.jsonl    # 下载元数据流水（状态、URL、本地路径），JSON Lines，可直接 grep/jq
```

已存在的同名文件自动跳过，重跑安全（增量补齐）。

## 实现要点与已知限制

- 公告查询 `stock` 参数必须携带巨潮内部 `orgId`（仅传代码沪市公司返回 0 结果，已实测）。
- 巨潮 `category` 多值必须用**分号**分隔（逗号会导致过滤失效返回全量公告，已实测）。
- 标题过滤排除「摘要 / 英文版 / 更正 / 补充 / 关于…」类公告，只保留报告正文；极少数仅发布更正版报告的公司会漏抓。
- 行业模式按门类全量检索（金融业两年年报窗口约 500 条公告、17 页请求），配合 `--sleep` 默认 1s 限速 + 失败退避重试，全量抓取需要一定时间。
- 仅用于公开数据个人研究，请保持合理请求频率。
