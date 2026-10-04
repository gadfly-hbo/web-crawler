/** 新建采集任务：阶段条「选择范围 → 预览确认 → 开始采集」。预览 = dry-run 任务。 */
import { useCallback, useEffect, useMemo, useReducer } from 'react';

import { api } from '../api';
import type { TaskRecord } from '../../../shared/task';
import { validateTaskParams } from '../../../shared/task-params';
import { PreviewPanel } from './new-task/PreviewPanel';
import { getTaskParams, initialNewTaskState, newTaskReducer } from './new-task/reducer';
import { ScopePicker } from './new-task/ScopePicker';
import { StageBar } from './new-task/StageBar';
import { TimeTypePicker } from './new-task/TimeTypePicker';
import { usePreviewSync } from './new-task/usePreviewSync';

export function NewTask(props: { onCreated: (id: string) => void; showToast: (m: string) => void }) {
  const [state, dispatch] = useReducer(newTaskReducer, initialNewTaskState);

  useEffect(() => {
    void api.industries().then((list) => dispatch({ type: 'SET_INDUSTRY_LIST', payload: list })).catch(() => {});
  }, []);

  const onUpdatePreview = useCallback((t: TaskRecord) => {
    dispatch({ type: 'SET_PREVIEW_TASK', payload: t });
  }, []);

  usePreviewSync(state.previewTask, onUpdatePreview);

  const params = useMemo(() => getTaskParams(state), [state]);

  const startPreview = async () => {
    const errs = validateTaskParams(params, state.industryList);
    dispatch({ type: 'SET_ERRORS', payload: errs });
    if (errs.length > 0) return;
    const { task, errors: serverErrors } = await api.createTask(params, true);
    if (serverErrors) {
      dispatch({ type: 'SET_ERRORS', payload: serverErrors });
      return;
    }
    dispatch({ type: 'SET_PREVIEW_TASK', payload: task! });
    dispatch({ type: 'SET_STAGE', payload: 2 });
  };

  const startCollect = async () => {
    const { task, errors: serverErrors } = await api.createTask(params, false);
    if (serverErrors) {
      dispatch({ type: 'SET_ERRORS', payload: serverErrors });
      dispatch({ type: 'SET_STAGE', payload: 1 });
      return;
    }
    props.showToast('采集任务已开始');
    props.onCreated(task!.id);
  };

  return (
    <div className="view">
      <h1 className="page-title">新建采集任务</h1>
      <p className="view-desc">从巨潮资讯网采集 A 股财报 PDF。先预览数量确认范围，再正式开始。</p>
      <StageBar stage={state.stage} />

      {state.errors.length > 0 && (
        <div className="form-errors">
          <ul>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="card-h">数据源</h3>
        <span className="chip chip-accent">巨潮资讯网 · A 股定期财报（证监会指定披露平台）</span>
      </div>

      {state.stage === 1 ? (
        <>
          <ScopePicker
            mode={state.mode}
            companies={state.companies}
            industryList={state.industryList}
            industries={state.industries}
            onModeChange={(m) => dispatch({ type: 'SET_MODE', payload: m })}
            onAddCompany={(c) => dispatch({ type: 'ADD_COMPANY', payload: c })}
            onRemoveCompany={(code) => dispatch({ type: 'REMOVE_COMPANY', payload: code })}
            onAddIndustry={(i) => dispatch({ type: 'ADD_INDUSTRY', payload: i })}
            onRemoveIndustry={(i) => dispatch({ type: 'REMOVE_INDUSTRY', payload: i })}
          />
          <TimeTypePicker
            timeMode={state.timeMode}
            year={state.year}
            from={state.from}
            to={state.to}
            types={state.types}
            sleepMs={state.sleepMs}
            limitText={state.limitText}
            onTimeModeChange={(m) => dispatch({ type: 'SET_TIME_MODE', payload: m })}
            onYearChange={(year) => dispatch({ type: 'SET_YEAR', payload: year })}
            onFromChange={(from) => dispatch({ type: 'SET_FROM', payload: from })}
            onToChange={(to) => dispatch({ type: 'SET_TO', payload: to })}
            onToggleType={(t) => dispatch({ type: 'TOGGLE_TYPE', payload: t })}
            onSleepMsChange={(ms) => dispatch({ type: 'SET_SLEEP_MS', payload: ms })}
            onLimitTextChange={(lim) => dispatch({ type: 'SET_LIMIT_TEXT', payload: lim })}
          />
          <button className="btn btn-primary" onClick={() => void startPreview()}>
            预览数量
          </button>
        </>
      ) : (
        <PreviewPanel
          previewTask={state.previewTask}
          sleepMs={state.sleepMs}
          onStartCollect={() => void startCollect()}
          onBackToEdit={() => dispatch({ type: 'RESET_PREVIEW' })}
        />
      )}
    </div>
  );
}
