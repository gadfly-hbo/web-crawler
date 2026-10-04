/** 通用 API 采集器领域类型与参数定义。 */

export interface ApiConnectorParams {
  sourceType: 'api-connector';
  name: string;
  request: {
    url: string; // 支持 {{page}}, {{pageSize}} 模板插值
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    bodyTemplate?: string;
  };
  pagination: {
    type: 'page_number' | 'cursor';
    pageParam: string; // 如 "page" 或 "pageNo"
    pageSizeParam?: string; // 如 "pageSize"
    startPage: number;
    pageSize: number;
    maxPages?: number; // 默认 50，上限 200
    hasMorePath?: string; // 提取响应中的标志位，如 "data.hasMore"
    totalPath?: string; // 如 "data.total"
  };
  extraction: {
    listPath: string; // 提取列表路径，如 "data.items"
    titlePath: string; // 标题字段路径，如 "title"
    itemKeyPath?: string; // 唯一键，如 "id"
    downloadUrlPath?: string; // 文件下载 URL 路径，如 "pdfUrl"
    datePath?: string; // 发布日期，如 "publishDate"
  };
  sleepMs: number; // 频控间隔（最低 200ms）
}
