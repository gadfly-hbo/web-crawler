import { useEffect, useState } from 'react';
import { api } from '../api';

export function SettingsModal(props: {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}) {
  const { isOpen, onClose, showToast } = props;

  const [envStatus, setEnvStatus] = useState<{
    hasEnvApiKey: boolean;
    maskedEnvApiKey: string | null;
    envBaseUrl: string;
    isSelfHosted: boolean;
  } | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // 读取本地存储中的配置缓存
    const cachedKey = localStorage.getItem('firecrawl_api_key') || '';
    const cachedUrl = localStorage.getItem('firecrawl_base_url') || '';
    setApiKey(cachedKey);
    setBaseUrl(cachedUrl);
    setTestResult(null);

    // 查询后端当前环境变量感知状态
    api.getFirecrawlSettings()
      .then((data) => {
        setEnvStatus(data);
        if (!cachedUrl && data.envBaseUrl) {
          setBaseUrl(data.envBaseUrl);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testFirecrawlConnection({
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
      if (res.ok) {
        setTestResult({ ok: true, message: res.message || '连通性测试通过！' });
      } else {
        setTestResult({ ok: false, message: res.error || '连通性验证失败' });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: `请求错误: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. 同步至前端 localStorage
      if (apiKey.trim()) {
        localStorage.setItem('firecrawl_api_key', apiKey.trim());
      } else {
        localStorage.removeItem('firecrawl_api_key');
      }

      if (baseUrl.trim() && baseUrl.trim() !== 'https://api.firecrawl.dev') {
        localStorage.setItem('firecrawl_base_url', baseUrl.trim());
      } else {
        localStorage.removeItem('firecrawl_base_url');
      }

      // 2. 同步至后端进程运行时环境
      await api.saveFirecrawlSettings({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
      });

      showToast('Firecrawl 配置已保存，后续新建任务将自动采用');
      onClose();
    } catch (err: any) {
      showToast(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.48)',
        backdropFilter: 'blur(3px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 540,
          maxWidth: '100%',
          background: '#ffffff',
          borderRadius: 8,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.16)',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card, #fcfbf9)',
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>
              ENGINE & CREDENTIALS · 采集引擎配置
            </div>
            <h3 className="card-h" style={{ margin: 0 }}>
              ⚙️ Firecrawl 采集配置与凭证
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ fontSize: 16, padding: '2px 8px', color: 'var(--text-3)' }}
          >
            ✕
          </button>
        </div>

        {/* 主体表单 */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 环境变量感知提示 */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: envStatus?.hasEnvApiKey ? 'var(--accent-soft, #fdf8f6)' : '#f8fafc',
              border: `1px solid ${envStatus?.hasEnvApiKey ? 'var(--accent-line, #f4dcd6)' : '#e2e8f0'}`,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>{envStatus?.hasEnvApiKey ? '🛡️' : '💡'}</span>
            <div>
              {envStatus?.hasEnvApiKey ? (
                <span>
                  <strong>已检测到服务端环境变量</strong>：
                  <code style={{ marginLeft: 4, color: 'var(--accent-strong, #b44626)' }}>
                    FIRECRAWL_API_KEY={envStatus.maskedEnvApiKey}
                  </code>
                  （在此处留空将自动继承环境变量）
                </span>
              ) : (
                <span style={{ color: '#475569' }}>
                  未检测到系统环境变量 <code>FIRECRAWL_API_KEY</code>。您可以在下方填写 API Key 并保存为本机默认凭证。
                </span>
              )}
            </div>
          </div>

          {/* API Key 输入框 */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Firecrawl API Key</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>调用 Cloud (api.firecrawl.dev) 必填</span>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showKey ? 'text' : 'password'}
                className="form-control"
                style={{ flex: 1, fontFamily: 'monospace', padding: '7px 10px', fontSize: 13 }}
                placeholder={envStatus?.hasEnvApiKey ? '继承服务端环境变量 (留空即可)' : '例如: fc-xxxxxxxxxxxxxxxxxxxx'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? '隐藏明文' : '查看明文'}
                style={{ padding: '0 10px' }}
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
              凭据仅保存在本机环境中，不上传第三方服务器，测试与任务结束后敏感明文自动脱敏。
            </span>
          </div>

          {/* Base URL 输入框 */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>服务端点 Base URL</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>默认官方云端</span>
            </label>
            <input
              type="text"
              className="form-control"
              style={{ width: '100%', fontFamily: 'monospace', padding: '7px 10px', fontSize: 13 }}
              placeholder="https://api.firecrawl.dev"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
              默认为官方 Cloud；若使用 Docker 自建或内网实例，可填写如 <code>http://localhost:3002</code>（自建实例通常免 API Key）。
            </span>
          </div>

          {/* 连通性测试按钮与反馈 */}
          <div style={{ paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={testing}
                onClick={handleTest}
              >
                {testing ? '⏳ 正在测试...' : '⚡ 测试端点连通性'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                即时发起端点拨测，确认网络可达与 Key 是否有效
              </span>
            </div>

            {testResult && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 12,
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
        </div>

        {/* 底部按钮栏 */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card, #fcfbf9)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
