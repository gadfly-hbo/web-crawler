/** RSS 任务参数模型（workbench 共享契约的 rss 分支）。 */
export interface RssTaskParams {
  sourceType: 'rss';
  name: string;
  /** 已批准的 Feed URL 列表（任务即白名单：仅访问这些端点），1-5 个，不允许重复 */
  urls: string[];
  /** 每 Feed 条目上限（缺省 50，上限 500） */
  limit?: number;
  /** 整任务级软超时（毫秒）；缺省 60000。与 workbench timeoutMs 硬熔断双层独立（G6） */
  deadlineMs?: number;
}
