import { useEffect, useState } from 'react';

interface ManifestData {
  manifestVersion: string;
  datasetId: string;
  datasetVersion: string;
  generatedAt: string;
  generator: {
    name: string;
    version: string;
    description: string;
  };
  sourceSummary: {
    sourceType?: string;
    succeeded: number;
    failed: number;
  };
  qualityMetrics: {
    totalRecords: number;
    validRecords: number;
    dataCompletenessRate: number;
    evidenceCoverageRate?: number;
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
  limitations?: string[];
}

export function UniversalManifestCard(props: { taskId: string }) {
  const { taskId } = props;
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    let canceled = false;
    fetch(`/api/tasks/${taskId}/manifest`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<ManifestData>;
      })
      .then((data) => {
        if (!canceled && data && data.manifestVersion) {
          setManifest(data);
        }
      })
      .catch(() => {});

    return () => {
      canceled = true;
    };
  }, [taskId]);

  if (!manifest) return null;

  return (
    <div
      className="card"
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '14px 18px',
        background: '#f8fafc',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
              标准化交付资产规范 (Delivery Manifest v{manifest.manifestVersion})
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              由统一底座 data-governance 自动签发 · 全文件 SHA-256 防篡改
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              background: '#dcfce7',
              color: '#166534',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            SHA-256 签名已就绪
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={`/api/tasks/${taskId}/delivery-package`}
            download={`delivery-${taskId}.zip`}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '5px 12px', background: '#b44626', borderColor: '#b44626', textDecoration: 'none' }}
            title="一键下载包含 manifest.json、数据、指纹与元数据的解耦标准交付包"
          >
            📦 导出标准化交付包 (ZIP)
          </a>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowDetail(!showDetail)}
            style={{ fontSize: 12, padding: '5px 10px' }}
          >
            {showDetail ? '收起规格 ▲' : '查看数据指纹 ▼'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>数据资产版本</div>
          <code style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{manifest.datasetVersion}</code>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>采集产出总数</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{manifest.qualityMetrics.totalRecords} 条</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>有效样本率</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
            {(manifest.qualityMetrics.dataCompletenessRate * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>生成引擎</div>
          <div style={{ fontSize: 12, color: '#334155' }}>{manifest.generator.name}</div>
        </div>
      </div>

      {manifest.limitations && manifest.limitations.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#334155', fontSize: 12 }}>
            ⚠️ 限制声明 (manifest limitations)
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
            {manifest.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {showDetail && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#334155' }}>
            📑 数据文件 SHA-256 防篡改指纹清单 ({Object.keys(manifest.checksums).length} 项):
          </div>
          <div
            style={{
              background: '#1e293b',
              color: '#f8fafc',
              padding: '8px 12px',
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 11,
              maxHeight: 140,
              overflowY: 'auto',
            }}
          >
            {Object.entries(manifest.checksums).map(([f, hash]) => (
              <div key={f} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: '#93c5fd' }}>{f}</span>
                <span style={{ color: '#cbd5e1' }}>{hash}</span>
              </div>
            ))}
          </div>

          {manifest.schema.fields.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                📋 数据集字段模式 (Schema 契约):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {manifest.schema.fields.map((field) => (
                  <span
                    key={field.name}
                    style={{
                      background: '#e2e8f0',
                      color: '#334155',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                    title={`${field.description} (${field.nullable ? '可为空' : '不可为空'})`}
                  >
                    <code>{field.name}</code>: {field.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
