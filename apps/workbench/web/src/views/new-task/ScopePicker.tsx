import { useEffect, useRef, useState } from 'react';
import { api, type StockEntry } from '../../api';

export function ScopePicker(props: {
  mode: 'company' | 'industry';
  companies: StockEntry[];
  industryList: string[];
  industries: string[];
  onModeChange: (mode: 'company' | 'industry') => void;
  onAddCompany: (company: StockEntry) => void;
  onRemoveCompany: (code: string) => void;
  onAddIndustry: (industry: string) => void;
  onRemoveIndustry: (industry: string) => void;
}) {
  const {
    mode,
    companies,
    industryList,
    industries,
    onModeChange,
    onAddCompany,
    onRemoveCompany,
    onAddIndustry,
    onRemoveIndustry,
  } = props;

  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<StockEntry[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const searchSeqRef = useRef(0);

  // 公司搜索防抖（带请求序号防竞态）
  useEffect(() => {
    const q = searchText.trim();
    if (!q) {
      setSuggestions([]);
      setSuggestError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeqRef.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.searchStocks(q);
        if (searchSeqRef.current === seq) {
          setSuggestions(r.stocks);
          setSuggestError(r.error ?? null);
        }
      } catch (err) {
        if (searchSeqRef.current === seq) {
          setSuggestError(err instanceof Error ? err.message : String(err));
          setSuggestions([]);
        }
      } finally {
        if (searchSeqRef.current === seq) {
          setSearching(false);
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  return (
    <div className="card">
      <h3 className="card-h">采集对象</h3>
      <div className="fld">
        <div className="radio-row">
          <label>
            <input type="radio" checked={mode === 'company'} onChange={() => onModeChange('company')} /> 按公司
          </label>
          <label>
            <input type="radio" checked={mode === 'industry'} onChange={() => onModeChange('industry')} /> 按行业门类
          </label>
        </div>
      </div>

      {mode === 'company' ? (
        <div className="fld">
          <label>公司（可多家）</label>
          <div className="chips">
            {companies.map((c) => (
              <span key={c.code} className="chip chip-accent">
                {c.name} {c.code}
                <button
                  className="btn-x"
                  onClick={() => onRemoveCompany(c.code)}
                  aria-label={`移除 ${c.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="suggest">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="输入公司名称、6 位代码或拼音搜索"
            />
            {(suggestions.length > 0 || searching || suggestError) && searchText.trim() && (
              <div className="suggest-list">
                {searching && <div className="suggest-item small">搜索中…</div>}
                {suggestError && <div className="suggest-item small">{suggestError}</div>}
                {!searching &&
                  !suggestError &&
                  suggestions.map((s) => (
                    <button
                      key={s.code}
                      className="suggest-item"
                      onClick={() => {
                        onAddCompany(s);
                        setSearchText('');
                        setSuggestions([]);
                      }}
                    >
                      {s.name}
                      <span className="meta">
                        {s.code} · {s.category}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="hint">支持名称 / 代码 / 拼音；选中后可继续搜索添加下一家。</div>
        </div>
      ) : (
        <div className="fld">
          <label>行业门类（证监会口径，可多个）</label>
          <div className="chips">
            {industries.map((i) => (
              <span key={i} className="chip chip-accent">
                {i}
                <button className="btn-x" onClick={() => onRemoveIndustry(i)} aria-label={`移除 ${i}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAddIndustry(e.target.value);
            }}
          >
            <option value="">选择行业门类…</option>
            {industryList.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <div className="hint">行业采集是该门类全量公司，数量可能很大——建议先预览。</div>
        </div>
      )}
    </div>
  );
}
