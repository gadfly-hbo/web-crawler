import { useCallback, useEffect, useMemo, useReducer } from 'react';

import { api } from '../api';
import type { TaskRecord } from '../../../shared/task';
import { validateTaskParams } from '../../../shared/task-params';
import { ApiConnectorPicker } from './new-task/ApiConnectorPicker';
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

  const onUpdatePreview = useCallback((t: TaskRecord) => dispatch({ type: 'SET_PREVIEW_TASK', payload: t }), []);
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
      <p className="view-desc">支持巨潮财报批量采集与通用声明式 API 数据/附件采集。先预览数量确认范围，再正式开始。</p>
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
        <h3 className="card-h">采集数据源类型</h3>
        <div className="radio-row" style={{ marginBottom: 8 }}>
          <label>
            <input
              type="radio"
              checked={state.sourceType === 'cninfo'}
              onChange={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'cninfo' })}
            />
            <strong>巨潮资讯网</strong> · A 股上市公司财报
          </label>
          <label>
            <input
              type="radio"
              checked={state.sourceType === 'api-connector'}
              onChange={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'api-connector' })}
            />
            <strong>通用 API 连接器</strong> · 声明式接口采集
          </label>
        </div>
        <span className="small">
          {state.sourceType === 'cninfo'
            ? '针对官方信息披露平台，批量下载上市公司官方年报、半年报与季报原件。'
            : '支持配置任意 GET/POST 结构化数据或文件下载接口，驱动自动翻页与落盘。'}
        </span>
      </div>

      {state.stage === 1 ? (
        <>
          {state.sourceType === 'cninfo' ? (
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
            </>
          ) : (
            <ApiConnectorPicker
              apiParams={state.apiParams}
              onChange={(p) => dispatch({ type: 'SET_API_PARAMS', payload: p })}
              onLoadTemplate={(t) => dispatch({ type: 'LOAD_API_TEMPLATE', payload: t })}
            />
          )}
          <button className="btn btn-primary" onClick={() => void startPreview()}>
            预览数量
          </button>
        </>
      ) : (
        <PreviewPanel
          previewTask={state.previewTask}
          sleepMs={params.sleepMs}
          onStartCollect={() => void startCollect()}
          onBackToEdit={() => dispatch({ type: 'RESET_PREVIEW' })}
        />
      )}
    </div>
  );
}
