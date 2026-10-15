import { useEffect, useState } from 'react';
import { api } from '../../api';

export function ProductPricePicker(props: {
  urlsText: string;
  mock: boolean;
  baselineBrand: string;
  apiKey: string;
  baseUrl: string;
  onChangeUrlsText: (text: string) => void;
  onChangeMock: (mock: boolean) => void;
  onChangeBaseline: (brand: string) => void;
  onChangeApiKey: (apiKey: string) => void;
  onChangeBaseUrl: (baseUrl: string) => void;
  onLoadSample: () => void;
}) {
  const {
    urlsText,
    mock,
    baselineBrand,
    apiKey,
    baseUrl,
    onChangeUrlsText,
    onChangeMock,
    onChangeBaseline,
    onChangeApiKey,
    onChangeBaseUrl,
    onLoadSample,
  } = props;

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [rememberLocal, setRememberLocal] = useState(true);
  const [envStatus, setEnvStatus] = useState<{
    hasEnvApiKey: boolean;
    maskedEnvApiKey: string | null;
    envBaseUrl: string;
  } | null>(null);

  useEffect(() => {
    api.getFirecrawlSettings()
      .then((data) => setEnvStatus(data))
      .catch(() => {});
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testFirecrawlConnection({
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
      if (res.ok) {
        setTestResult({ ok: true, message: res.message || '连通性验证成功！' });
      } else {
        setTestResult({ ok: false, message: res.error || '连通性验证失败' });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: `请求错误: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleApiKeyChange = (val: string) => {
    onChangeApiKey(val);
    if (rememberLocal) {
      if (val.trim()) {
        localStorage.setItem('firecrawl_api_key', val.trim());
      } else {
        localStorage.removeItem('firecrawl_api_key');
      }
    }
  };

  const handleBaseUrlChange = (val: string) => {
    onChangeBaseUrl(val);
    if (rememberLocal) {
      if (val.trim()) {
        localStorage.setItem('firecrawl_base_url', val.trim());
      } else {
        localStorage.removeItem('firecrawl_base_url');
      }
    }
  };

  const urlCount = urlsText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#')).length;

  return (
    <div className="card">
      <div className="eyebrow">样板场景配置</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 className="card-h" style={{ margin: 0 }}>
          公开商品标价与价格带对比
        </h3>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: '4px 10px' }}
          onClick={onLoadSample}
        >
          🔄 填入 3 品牌对比示例 (9条)
        </button>
      </div>

      <p className="card-sub" style={{ marginBottom: 16 }}>
        输入获准采集的商品详情页 URL 列表（每行一个）。引擎将自动采集页面快照、提取商品标题与标价，并按品牌计算中位数与价格分布带。
      </p>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>目标商品 URL 清单</span>
          <span style={{ color: 'var(--text-muted, #666)', fontSize: 12 }}>已输入 {urlCount} 个有效页面</span>
        </label>
        <textarea
          rows={6}
          className="form-control"
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 8, borderRadius: 4 }}
          placeholder="https://brand-a.example/product/101&#10;https://brand-b.example/product/201"
          value={urlsText}
          onChange={(e) => onChangeUrlsText(e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">对比基准品牌 (Baseline)</label>
          <input
            type="text"
            className="form-control"
            style={{ width: '100%', padding: '6px 8px', borderRadius: 4 }}
            placeholder="例如: Brand A"
            value={baselineBrand}
            onChange={(e) => onChangeBaseline(e.target.value)}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted, #666)' }}>
            其他品牌的中位数将以此品牌为基准计算相对差异百分比
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">采集模式与环境</label>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="crawling_mode"
                checked={mock}
                onChange={() => onChangeMock(true)}
              />
              <span style={{ fontWeight: 600 }}>离线 Mock 演练 (内置样本)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="crawling_mode"
                checked={!mock}
                onChange={() => onChangeMock(false)}
              />
              <span style={{ fontWeight: 600, color: 'var(--accent-strong, #b44626)' }}>
                🚀 Firecrawl 真实抓取 (Cloud / 自建)
              </span>
            </label>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #666)', display: 'block', marginTop: 4 }}>
            {mock
              ? '使用本地合成数据跑通完整闭环，不产生外网请求与 Token 计费消耗。'
              : '调用 Firecrawl 真实抓取网页并落盘 HTML/Markdown 快照。'}
          </span>
        </div>
      </div>

      {/* 当选择真实抓取时，展示 Firecrawl 前端配置区域 */}
      {!mock && (
        <div
          style={{
            border: '1px solid var(--accent-line, #f4dcd6)',
            borderRadius: 6,
            background: 'var(--accent-soft, #fdf8f6)',
            padding: '14px 16px',
            marginTop: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <strong style={{ fontSize: 13, color: 'var(--accent-strong, #b44626)' }}>
                Firecrawl 引擎接入配置 (前端直接配置)
              </strong>
            </div>
            {envStatus?.hasEnvApiKey && !apiKey && (
              <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                ✔ 环境变量已就绪 ({envStatus.maskedEnvApiKey})
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Firecrawl API Key:
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  className="form-control"
                  style={{ flex: 1, fontFamily: 'monospace', padding: '5px 8px', fontSize: 12 }}
                  placeholder={
                    envStatus?.hasEnvApiKey ? '留空继承环境变量，或输入临时覆盖' : '例如: fc-xxxxxxxxxxxxxxxxxxxx'
                  }
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '0 8px', fontSize: 11 }}
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                服务端点 (Base URL):
              </label>
              <input
                type="text"
                className="form-control"
                style={{ width: '100%', fontFamily: 'monospace', padding: '5px 8px', fontSize: 12 }}
                placeholder="https://api.firecrawl.dev"
                value={baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberLocal}
                onChange={(e) => setRememberLocal(e.target.checked)}
              />
              记住配置到本机浏览器（下次新建任务自动回填）
            </label>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={testing}
              onClick={handleTest}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {testing ? '⏳ 正在测试...' : '⚡ 测试连通性'}
            </button>
          </div>

          {testResult && (
            <div
              style={{
                marginTop: 10,
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 11,
                background: testResult.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
                color: testResult.ok ? '#166534' : '#991b1b',
              }}
            >
              {testResult.ok ? '✔ ' : '❌ '}
              {testResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
