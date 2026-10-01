/** 新建采集任务：阶段条「选择范围 → 预览确认 → 开始采集」。预览 = dry-run 任务。 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { api, type StockEntry } from '../api';
import {
  DEFAULT_SLEEP_MS,
  MIN_SLEEP_MS,
  REPORT_TYPE_LABELS,
  validateTaskParams,
  type ReportType,
  type TaskParams,
} from '../../../shared/task-params';
import type { TaskRecord } from '../../../shared/task';

const ALL_TYPES: ReportType[] = ['annual', 'semi', 'q1', 'q3'];

function StageBar({ stage }: { stage: 1 | 2 }) {
  const item = (no: number, name: string, state: 'done' | 'current' | 'todo') => (
    <span className={`stage ${state}`}>
      <span className="no">{no}</span>
      {name}
    </span>
  );
  return (
    <div className="stagebar">
      {item(1, '选择范围', stage === 1 ? 'current' : 'done')}
      <span className="stage-sep">→</span>
      {item(2, '预览确认', stage === 2 ? 'current' : 'todo')}
      <span className="stage-sep">→</span>
      {item(3, '开始采集', 'todo')}
    </div>
  );
}

export function NewTask(props: { onCreated: (id: string) => void; showToast: (m: string) => void }) {
  const [mode, setMode] = useState<'company' | 'industry'>('company');
  const [companies, setCompanies] = useState<StockEntry[]>([]);
  const [industryList, setIndustryList] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [timeMode, setTimeMode] = useState<'year' | 'range'>('year');
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [types, setTypes] = useState<ReportType[]>(ALL_TYPES);
  const [sleepMs, setSleepMs] = useState(DEFAULT_SLEEP_MS);
  const [limitText, setLimitText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<StockEntry[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [stage, setStage] = useState<1 | 2>(1);
  const [previewTask, setPreviewTask] = useState<TaskRecord | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void api.industries().then(setIndustryList).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // 公司搜索防抖
  useEffect(() => {
    if (!searchText.trim()) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await api.searchStocks(searchText.trim());
      setSuggestions(r.stocks);
      setSuggestError(r.error ?? null);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const params: TaskParams = useMemo(
    () => ({
      companies: mode === 'company' ? companies.map((c) => c.name) : [],
      industries: mode === 'industry' ? industries : [],
      year: timeMode === 'year' ? year : undefined,
      from: timeMode === 'range' ? from : undefined,
      to: timeMode === 'range' ? to : undefined,
      types,
      limit: limitText.trim() ? Number(limitText) : undefined,
      sleepMs,
    }),
    [mode, companies, industries, timeMode, year, from, to, types, limitText, sleepMs],
  );

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const startPreview = async () => {
    const errs = validateTaskParams(params, industryList);
    setErrors(errs);
    if (errs.length > 0) return;
    const { task, errors: serverErrors } = await api.createTask(params, true);
    if (serverErrors) {
      setErrors(serverErrors);
      return;
    }
    setPreviewTask(task!);
    setStage(2);
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const t = await api.task(task!.id);
        setPreviewTask(t);
        if (t.status !== 'running' && t.status !== 'queued') stopPoll();
      } catch {
        stopPoll();
      }
    }, 1000);
  };

  const startCollect = async () => {
    const { task, errors: serverErrors } = await api.createTask(params, false);
    if (serverErrors) {
      setErrors(serverErrors);
      setStage(1);
      return;
    }
    props.showToast('采集任务已开始');
    props.onCreated(task!.id);
  };

  const previewDone = previewTask && previewTask.status !== 'running' && previewTask.status !== 'queued';
  const estimateMin = previewTask?.preview
    ? Math.max(1, Math.round((previewTask.preview.reports * params.sleepMs) / 60000))
    : null;

  return (
    <div className="view">
      <h1 className="page-title">新建采集任务</h1>
      <p className="view-desc">从巨潮资讯网采集 A 股财报 PDF。先预览数量确认范围，再正式开始。</p>
      <StageBar stage={stage} />

      {errors.length > 0 && (
        <div className="form-errors">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="card-h">数据源</h3>
        <span className="chip chip-accent">巨潮资讯网 · A 股定期财报（证监会指定披露平台）</span>
      </div>

      <div className="card">
        <h3 className="card-h">采集对象</h3>
        <div className="fld">
          <div className="radio-row">
            <label>
              <input type="radio" checked={mode === 'company'} onChange={() => setMode('company')} /> 按公司
            </label>
            <label>
              <input type="radio" checked={mode === 'industry'} onChange={() => setMode('industry')} /> 按行业门类
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
                    onClick={() => setCompanies(companies.filter((x) => x.code !== c.code))}
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
                          if (!companies.some((c) => c.code === s.code)) setCompanies([...companies, s]);
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
                  <button className="btn-x" onClick={() => setIndustries(industries.filter((x) => x !== i))} aria-label={`移除 ${i}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !industries.includes(e.target.value)) setIndustries([...industries, e.target.value]);
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

      <div className="card">
        <h3 className="card-h">时间与类型</h3>
        <div className="fld">
          <div className="radio-row">
            <label>
              <input type="radio" checked={timeMode === 'year'} onChange={() => setTimeMode('year')} /> 按报告年份
            </label>
            <label>
              <input type="radio" checked={timeMode === 'range'} onChange={() => setTimeMode('range')} /> 按公告发布日期
            </label>
          </div>
        </div>
        {timeMode === 'year' ? (
          <div className="fld">
            <label htmlFor="f-year">报告期年份</label>
            <input id="f-year" type="number" value={year} min={1990} max={2100} onChange={(e) => setYear(Number(e.target.value))} />
            <div className="hint">如 2024 表示「报告期为 2024 年」的财报（年报在次年 3~4 月发布，检索已自动覆盖）。</div>
          </div>
        ) : (
          <div className="fld-row">
            <div className="fld">
              <label htmlFor="f-from">公告开始日期</label>
              <input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="f-to">公告结束日期</label>
              <input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
        <div className="fld">
          <label>报告类型</label>
          <div className="check-row">
            {ALL_TYPES.map((t) => (
              <label key={t}>
                <input
                  type="checkbox"
                  checked={types.includes(t)}
                  onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))}
                />
                {REPORT_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
        </div>
        <details className="advanced">
          <summary>高级选项</summary>
          <div className="fld-row">
            <div className="fld">
              <label htmlFor="f-sleep">请求间隔（毫秒）</label>
              <input id="f-sleep" type="number" value={sleepMs} min={MIN_SLEEP_MS} onChange={(e) => setSleepMs(Number(e.target.value))} />
              <div className="hint">相邻请求的最小间隔，最低 {MIN_SLEEP_MS}ms。调小会被网站限速甚至封禁。</div>
            </div>
            <div className="fld">
              <label htmlFor="f-limit">最多公司数（可选）</label>
              <input id="f-limit" type="number" value={limitText} min={1} onChange={(e) => setLimitText(e.target.value)} />
              <div className="hint">试跑用：只处理前 N 家（按代码排序）。</div>
            </div>
          </div>
        </details>
      </div>

      {stage === 1 ? (
        <button className="btn btn-primary" onClick={() => void startPreview()}>
          预览数量
        </button>
      ) : (
        <div className="card">
          <h3 className="card-h">预览结果</h3>
          {!previewDone && <p className="small">正在查询巨潮资讯网…（{previewTask?.status === 'queued' ? '排队中' : '查询中'}）</p>}
          {previewDone && previewTask?.status === 'succeeded' && previewTask.preview && (
            <>
              <p>
                共匹配 <strong>{previewTask.preview.companies}</strong> 家公司、<strong>{previewTask.preview.reports}</strong> 份报告
              </p>
              {estimateMin != null && (
                <p className="small">
                  预计最短约 {estimateMin} 分钟（按报告数 × 请求间隔估算的下限，实际取决于文件大小与网络）。
                </p>
              )}
              {estimateMin != null && estimateMin >= 5 && (
                <div className="warn-card">任务量较大：期间其他任务会排队，请确认范围无误。</div>
              )}
              <div className="fld-row" style={{ marginTop: 14 }}>
                <button className="btn btn-primary" onClick={() => void startCollect()}>
                  确认无误，开始采集
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    stopPoll();
                    setStage(1);
                    setPreviewTask(null);
                  }}
                >
                  返回修改
                </button>
              </div>
            </>
          )}
          {previewDone && previewTask?.status === 'partial' && (
            <div className="warn-card">
              预览结果不完整（部分内容查询失败）：
              <ul>
                {previewTask!.failures.map((f, i) => (
                  <li key={i}>{f.target ? `检索「${f.target}」` : `${f.code ?? ''} ${f.name ?? ''}`}：{f.reason}</li>
                ))}
              </ul>
              {previewTask!.preview && (
                <p>已匹配 {previewTask!.preview.companies} 家公司、{previewTask!.preview.reports} 份报告（不含失败部分）。</p>
              )}
              <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => { stopPoll(); setStage(1); setPreviewTask(null); }}>
                  返回修改
                </button>
                <button className="btn btn-primary" onClick={() => void startCollect()}>
                  仍要采集（跳过失败部分）
                </button>
              </div>
            </div>
          )}
          {previewDone && previewTask?.status !== 'succeeded' && previewTask?.status !== 'partial' && (
            <div className="fail-card">
              {previewTask?.status === 'canceled'
                ? '预览任务已被取消。'
                : `预览失败：${previewTask?.error ?? (previewTask?.failures.map((f) => f.reason).join('；') || '未知原因')}`}
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    stopPoll();
                    setStage(1);
                    setPreviewTask(null);
                  }}
                >
                  返回修改
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
