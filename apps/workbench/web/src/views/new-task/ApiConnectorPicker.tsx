import { API_PRESET_TEMPLATES, type ApiConnectorParams } from '../../../../shared/task-params';
import type { ApiConnectorFormState } from './types';

export function ApiConnectorPicker(props: {
  apiParams: ApiConnectorFormState;
  onChange: (patch: Partial<ApiConnectorFormState>) => void;
  onLoadTemplate: (template: Omit<ApiConnectorParams, 'sourceType'>) => void;
}) {
  const { apiParams, onChange, onLoadTemplate } = props;

  return (
    <>
      <div className="card">
        <h3 className="card-h">预设接口模板</h3>
        <p className="small" style={{ marginBottom: 12 }}>
          点击下方预设模板可一键回填接口配置与提取规则：
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {API_PRESET_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              className="btn btn-secondary btn-sm"
              title={tmpl.description}
              onClick={() => onLoadTemplate(tmpl.config)}
            >
              {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-h">请求配置</h3>
        <div className="fld">
          <label>任务名称</label>
          <input
            type="text"
            className="input-medium"
            value={apiParams.name}
            placeholder="如：行业研报批量抓取"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>

        <div className="fld-row">
          <div className="fld" style={{ flex: '0 0 140px' }}>
            <label>请求方法</label>
            <select
              value={apiParams.method}
              onChange={(e) => onChange({ method: e.target.value as 'GET' | 'POST' })}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
          <div className="fld" style={{ flex: 1 }}>
            <label>接口 URL</label>
            <input
              type="text"
              value={apiParams.url}
              placeholder="https://example.com/api/reports?page={{page}}"
              onChange={(e) => onChange({ url: e.target.value })}
            />
            <div className="hint">支持使用 &#123;&#123;page&#125;&#125; 与 &#123;&#123;pageSize&#125;&#125; 模板占位符</div>
          </div>
        </div>

        <div className="fld-row">
          <div className="fld">
            <label>分页参数名</label>
            <input
              type="text"
              value={apiParams.pageParam}
              placeholder="page 或 pageNo"
              onChange={(e) => onChange({ pageParam: e.target.value })}
            />
          </div>
          <div className="fld">
            <label>每页参数名（可选）</label>
            <input
              type="text"
              value={apiParams.pageSizeParam}
              placeholder="pageSize 或 limit"
              onChange={(e) => onChange({ pageSizeParam: e.target.value })}
            />
          </div>
          <div className="fld">
            <label>起始页码</label>
            <input
              type="number"
              min={0}
              value={apiParams.startPage}
              onChange={(e) => onChange({ startPage: Number(e.target.value) })}
            />
          </div>
          <div className="fld">
            <label>每页条数</label>
            <input
              type="number"
              min={1}
              value={apiParams.pageSize}
              onChange={(e) => onChange({ pageSize: Number(e.target.value) })}
            />
          </div>
          <div className="fld">
            <label>最大抓取页数（防死循环）</label>
            <input
              type="number"
              min={1}
              max={200}
              value={apiParams.maxPages}
              onChange={(e) => onChange({ maxPages: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-h">响应提取与落盘规则</h3>
        <div className="fld-row">
          <div className="fld">
            <label>数据列表路径</label>
            <input
              type="text"
              value={apiParams.listPath}
              placeholder="如 data.items 或 result.records"
              onChange={(e) => onChange({ listPath: e.target.value })}
            />
            <div className="hint">定位 JSON 响应中的数组对象</div>
          </div>
          <div className="fld">
            <label>标题字段路径</label>
            <input
              type="text"
              value={apiParams.titlePath}
              placeholder="如 title 或 name"
              onChange={(e) => onChange({ titlePath: e.target.value })}
            />
            <div className="hint">用于生成下载文件名或展示标题</div>
          </div>
        </div>

        <div className="fld-row">
          <div className="fld">
            <label>文件下载 URL 字段（可选）</label>
            <input
              type="text"
              value={apiParams.downloadUrlPath}
              placeholder="如 pdfUrl 或 downloadUrl（留空保存为 JSON）"
              onChange={(e) => onChange({ downloadUrlPath: e.target.value })}
            />
          </div>
          <div className="fld">
            <label>发布日期字段（可选）</label>
            <input
              type="text"
              value={apiParams.datePath}
              placeholder="如 publishDate 或 createTime"
              onChange={(e) => onChange({ datePath: e.target.value })}
            />
          </div>
          <div className="fld">
            <label>唯一标识字段（可选）</label>
            <input
              type="text"
              value={apiParams.itemKeyPath}
              placeholder="如 id 或 docId"
              onChange={(e) => onChange({ itemKeyPath: e.target.value })}
            />
          </div>
        </div>

        <div className="fld">
          <label>请求间隔（ms）</label>
          <input
            type="number"
            min={200}
            className="input-short"
            value={apiParams.sleepMs}
            onChange={(e) => onChange({ sleepMs: Number(e.target.value) })}
          />
          <div className="hint">相邻分页请求最低间隔 200ms，对目标服务器保持礼貌</div>
        </div>

        <details className="advanced" style={{ marginTop: 16 }}>
          <summary>高级选项（请求体模板与自定义 Headers）</summary>
          <div className="fld" style={{ marginTop: 12 }}>
            <label>POST Body 模板（JSON 字符串）</label>
            <input
              type="text"
              value={apiParams.bodyTemplate}
              placeholder='{"page": {{page}}, "pageSize": {{pageSize}}}'
              onChange={(e) => onChange({ bodyTemplate: e.target.value })}
            />
          </div>
          <div className="fld">
            <label>自定义 Headers（JSON 格式）</label>
            <input
              type="text"
              value={apiParams.headersJson}
              placeholder='{"Authorization": "Bearer token..."}'
              onChange={(e) => onChange({ headersJson: e.target.value })}
            />
          </div>
        </details>
      </div>
    </>
  );
}
