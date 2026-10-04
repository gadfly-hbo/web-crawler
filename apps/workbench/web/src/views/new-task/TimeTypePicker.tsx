import {
  MIN_SLEEP_MS,
  REPORT_TYPE_LABELS,
  type ReportType,
} from '../../../../shared/task-params';
import { ALL_TYPES } from './types';

export function TimeTypePicker(props: {
  timeMode: 'year' | 'range';
  year: number;
  from: string;
  to: string;
  types: ReportType[];
  sleepMs: number;
  limitText: string;
  onTimeModeChange: (m: 'year' | 'range') => void;
  onYearChange: (year: number) => void;
  onFromChange: (from: string) => void;
  onToChange: (to: string) => void;
  onToggleType: (type: ReportType) => void;
  onSleepMsChange: (sleepMs: number) => void;
  onLimitTextChange: (limit: string) => void;
}) {
  const {
    timeMode,
    year,
    from,
    to,
    types,
    sleepMs,
    limitText,
    onTimeModeChange,
    onYearChange,
    onFromChange,
    onToChange,
    onToggleType,
    onSleepMsChange,
    onLimitTextChange,
  } = props;

  return (
    <div className="card">
      <h3 className="card-h">时间与类型</h3>
      <div className="fld">
        <div className="radio-row">
          <label>
            <input type="radio" checked={timeMode === 'year'} onChange={() => onTimeModeChange('year')} /> 按报告年份
          </label>
          <label>
            <input type="radio" checked={timeMode === 'range'} onChange={() => onTimeModeChange('range')} /> 按公告发布日期
          </label>
        </div>
      </div>
      {timeMode === 'year' ? (
        <div className="fld">
          <label htmlFor="f-year">报告期年份</label>
          <input
            id="f-year"
            type="number"
            value={year}
            min={1990}
            max={2100}
            onChange={(e) => onYearChange(Number(e.target.value))}
          />
          <div className="hint">如 2024 表示「报告期为 2024 年」的财报（年报在次年 3~4 月发布，检索已自动覆盖）。</div>
        </div>
      ) : (
        <div className="fld-row">
          <div className="fld">
            <label htmlFor="f-from">公告开始日期</label>
            <input id="f-from" type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="f-to">公告结束日期</label>
            <input id="f-to" type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
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
                onChange={() => onToggleType(t)}
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
            <input
              id="f-sleep"
              type="number"
              value={sleepMs}
              min={MIN_SLEEP_MS}
              onChange={(e) => onSleepMsChange(Number(e.target.value))}
            />
            <div className="hint">相邻请求的最小间隔，最低 {MIN_SLEEP_MS}ms。调小会被网站限速甚至封禁。</div>
          </div>
          <div className="fld">
            <label htmlFor="f-limit">最多公司数（可选）</label>
            <input
              id="f-limit"
              type="number"
              value={limitText}
              min={1}
              onChange={(e) => onLimitTextChange(e.target.value)}
            />
            <div className="hint">试跑用：只处理前 N 家（按代码排序）。</div>
          </div>
        </div>
      </details>
    </div>
  );
}
