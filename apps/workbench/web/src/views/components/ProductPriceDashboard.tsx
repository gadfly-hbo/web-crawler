import { useEffect, useState } from 'react';
import { EvidenceDrawer } from './EvidenceDrawer';

interface BrandSummary {
  brand: string;
  validSampleCount: number;
  missingSampleCount: number;
  currency: string;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  avgPrice: number;
  relativeDiffToBaselinePercent?: number;
}

interface DistributionBucket {
  rangeLabel: string;
  count: number;
  percentage: number;
}

interface PriceReport {
  totalRecords: number;
  validRecords: number;
  baselineBrand?: string;
  brandSummaries: BrandSummary[];
  distributionBuckets: DistributionBucket[];
  observationFacts: string[];
  caveatsAndLimits: string[];
}

interface ProductRecordItem {
  recordId: string;
  url: string;
  brand: string;
  title: string;
  price: number | null;
  currency: string;
  category: string;
  qualityStatus: 'valid' | 'missing_price' | 'invalid_price';
}

interface DeliveryManifestInfo {
  manifestVersion: string;
  datasetId: string;
  datasetVersion: string;
  generatedAt: string;
  generator: {
    name: string;
    version: string;
    description: string;
  };
  qualityMetrics: {
    totalRecords: number;
    validRecords: number;
    missingPriceRecords: number;
    evidenceCoverageRate: number;
    dataCompletenessRate: number;
  };
  schema: {
    fields: Array<{
      name: string;
      type: string;
      description: string;
      nullable: boolean;
    }>;
  };
  checksums: Record<string, string>;
}

export function ProductPriceDashboard(props: { taskId: string }) {
  const { taskId } = props;
  const [report, setReport] = useState<PriceReport | null>(null);
  const [records, setRecords] = useState<ProductRecordItem[]>([]);
  const [manifest, setManifest] = useState<DeliveryManifestInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // 抽屉状态
  const activeDrilldownState = useState<{
    recordId: string;
    field: string;
    fieldLabel: string;
    value: any;
  } | null>(null);
  const [activeDrilldown, setActiveDrilldown] = activeDrilldownState;

  const loadData = () => {
    let canceled = false;
    Promise.all([
      fetch(`/api/task/${taskId}/files/analysis_summary.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/task/${taskId}/files/records.jsonl`).then((r) => (r.ok ? r.text() : '')),
      fetch(`/api/tasks/${taskId}/manifest`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([rep, jsonlText, mf]) => {
        if (canceled) return;
        if (rep) setReport(rep);
        if (mf) setManifest(mf);

        if (jsonlText) {
          const lines = jsonlText.split('\n').filter(Boolean);
          const parsed = lines.map((l) => JSON.parse(l));
          setRecords(parsed);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
    };
  };

  useEffect(() => {
    return loadData();
  }, [taskId]);

  if (loading) {
    return <div style={{ padding: 16, color: '#666' }}>⏳ 正在加载分析报告与证据索引...</div>;
  }

  if (!report) {
    return null;
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="eyebrow">业务样板分析成果 · 标准化交付与证据闭环</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 className="card-h" style={{ margin: 0 }}>
          📊 品牌标价中位数与价格带对比看板
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href={`/api/task/${taskId}/files/analysis.csv`}
            download="analysis.csv"
            className="btn btn-secondary"
            style={{ fontSize: 13, textDecoration: 'none' }}
          >
            📥 导出 CSV
          </a>
          <a
            href={`/api/task/${taskId}/files/analysis_summary.json`}
            download="analysis_summary.json"
            className="btn btn-secondary"
            style={{ fontSize: 13, textDecoration: 'none' }}
          >
            📥 导出 JSON
          </a>
        </div>
      </div>

      {/* FA1 收敛（已批准 UI 增量 A0 终裁 2）：原内嵌证书面板去重（唯一呈现移交 UniversalManifestCard），独有指标并入看板指标行 */}
      {manifest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>原文证据覆盖率</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>
              {(manifest.qualityMetrics.evidenceCoverageRate * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>下游解耦兼容性</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Parquet / DuckDB / JSONL</div>
          </div>
        </div>
      )}

      {/* 品牌对比表 */}
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color, #e0e0e0)' }}>
              <th style={{ padding: '8px 12px' }}>品牌</th>
              <th style={{ padding: '8px 12px' }}>有效样本</th>
              <th style={{ padding: '8px 12px' }}>缺失样本</th>
              <th style={{ padding: '8px 12px' }}>标价中位数 (¥)</th>
              <th style={{ padding: '8px 12px' }}>标价均值 (¥)</th>
              <th style={{ padding: '8px 12px' }}>价格区间</th>
              <th style={{ padding: '8px 12px' }}>相对基准中位数</th>
            </tr>
          </thead>
          <tbody>
            {report.brandSummaries.map((b) => {
              const isBaseline = b.brand.toLowerCase() === (report.baselineBrand || 'brand a').toLowerCase();
              return (
                <tr key={b.brand} style={{ borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {b.brand} {isBaseline && <span className="chip chip-ok" style={{ marginLeft: 6, fontSize: 11 }}>基准</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{b.validSampleCount}</td>
                  <td style={{ padding: '8px 12px', color: b.missingSampleCount > 0 ? '#b44626' : 'inherit' }}>
                    {b.missingSampleCount}
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--color-accent, #b44626)' }}>
                    ¥{b.medianPrice}
                  </td>
                  <td style={{ padding: '8px 12px' }}>¥{b.avgPrice}</td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>
                    ¥{b.minPrice} ~ ¥{b.maxPrice}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {isBaseline ? (
                      <span style={{ color: '#888' }}>-</span>
                    ) : b.relativeDiffToBaselinePercent !== undefined ? (
                      <span style={{ fontWeight: 500, color: b.relativeDiffToBaselinePercent > 0 ? '#b44626' : '#267b46' }}>
                        {b.relativeDiffToBaselinePercent > 0 ? `+${b.relativeDiffToBaselinePercent}%` : `${b.relativeDiffToBaselinePercent}%`}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 价格带分布 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>📈 整体价格分布带</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {report.distributionBuckets.map((bucket) => (
            <div
              key={bucket.rangeLabel}
              style={{
                border: '1px solid var(--border-color, #e0e0e0)',
                padding: '10px 14px',
                borderRadius: 6,
                background: '#fafafa',
              }}
            >
              <div style={{ fontSize: 12, color: '#666' }}>{bucket.rangeLabel} 元</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{bucket.count} 件</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>占比 {bucket.percentage}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* 商品样本明细与证据链下钻表 */}
      {records.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              🔬 商品样本明细（点击数值或按钮可下钻高亮原文证据）
            </div>
            <span style={{ fontSize: 12, color: '#718096' }}>共 {records.length} 条记录</span>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '8px 12px' }}>品牌</th>
                  <th style={{ padding: '8px 12px' }}>商品标题 (点击溯源)</th>
                  <th style={{ padding: '8px 12px' }}>标价 (点击溯源)</th>
                  <th style={{ padding: '8px 12px' }}>品类</th>
                  <th style={{ padding: '8px 12px' }}>质量状态</th>
                  <th style={{ padding: '8px 12px' }}>证据操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.recordId} style={{ borderBottom: '1px solid #edf2f7' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.brand}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        onClick={() =>
                          setActiveDrilldown({
                            recordId: r.recordId,
                            field: 'title',
                            fieldLabel: '商品标题',
                            value: r.title,
                          })
                        }
                        style={{ cursor: 'pointer', color: '#2b6cb0', textDecoration: 'underline' }}
                        title="点击下钻快照原文"
                      >
                        {r.title}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.price !== null ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveDrilldown({
                              recordId: r.recordId,
                              field: 'price',
                              fieldLabel: '标价',
                              value: r.price,
                            })
                          }
                          style={{
                            background: '#fffaf0',
                            border: '1px solid #fbd38d',
                            color: '#c05621',
                            padding: '2px 8px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                          title="点击查看证据与原文定位"
                        >
                          ¥{r.price} 🔍
                        </button>
                      ) : (
                        <span style={{ color: '#a0aec0' }}>未标价</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#4a5568' }}>{r.category}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: r.qualityStatus === 'valid' ? '#c6f6d5' : '#fed7d7',
                          color: r.qualityStatus === 'valid' ? '#22543d' : '#742a2a',
                        }}
                      >
                        {r.qualityStatus === 'valid' ? '合格' : '缺失/无效'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          setActiveDrilldown({
                            recordId: r.recordId,
                            field: 'price',
                            fieldLabel: '标价',
                            value: r.price,
                          })
                        }
                        style={{ fontSize: 11, padding: '3px 8px' }}
                      >
                        查看证据链
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 证据下钻侧边抽屉 */}
      {activeDrilldown && (
        <EvidenceDrawer
          taskId={taskId}
          recordId={activeDrilldown.recordId}
          field={activeDrilldown.field}
          fieldLabel={activeDrilldown.fieldLabel}
          currentValue={activeDrilldown.value}
          onClose={() => setActiveDrilldown(null)}
          onRevisionSaved={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
