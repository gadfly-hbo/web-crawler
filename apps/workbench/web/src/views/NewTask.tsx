import { useCallback, useEffect, useMemo, useReducer } from 'react';

import { api } from '../api';
import type { TaskRecord } from '../../../shared/task';
import { validateTaskParams } from '../../../shared/task-params';
import { CustomScenarioGuide } from './new-task/CustomScenarioGuide';
import { PreviewPanel } from './new-task/PreviewPanel';
import { getTaskParams, initialNewTaskState, newTaskReducer } from './new-task/reducer';
import { ScenarioSelector } from './new-task/ScenarioSelector';
import { ScopePicker } from './new-task/ScopePicker';
import { StageBar } from './new-task/StageBar';
import { TimeTypePicker } from './new-task/TimeTypePicker';
import { usePreviewSync } from './new-task/usePreviewSync';
import { WeatherPicker } from './new-task/WeatherPicker';
import { ProductPricePicker } from './new-task/ProductPricePicker';

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
    const errs = validateTaskParams(params, state.industryList);
    dispatch({ type: 'SET_ERRORS', payload: errs });
    if (errs.length > 0) return;

    const { task, errors: serverErrors } = await api.createTask(params, false);
    if (serverErrors) {
      dispatch({ type: 'SET_ERRORS', payload: serverErrors });
      dispatch({ type: 'SET_STAGE', payload: 1 });
      return;
    }
    if (state.previewTask?.id) {
      void api.deleteTask(state.previewTask.id).catch(() => {});
    }
    props.showToast('采集任务已开始');
    props.onCreated(task!.id);
  };

  return (
    <div className="view">
      <h1 className="page-title">新建采集任务</h1>
      <p className="view-desc">选择已固化的数据采集场景，设置极简业务参数即可一键预览并采集。</p>
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

      {state.stage === 1 ? (
        <>
          <ScenarioSelector
            scenario={state.scenario}
            onSelect={(sc) => dispatch({ type: 'SET_SCENARIO', payload: sc })}
          />

          {state.scenario === 'cninfo-reports' && (
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
          )}

          {state.scenario === 'product-price-comparison' && (
            <ProductPricePicker
              urlsText={state.productUrlsText}
              mock={state.productMock}
              baselineBrand={state.productBaselineBrand}
              apiKey={state.productApiKey}
              baseUrl={state.productBaseUrl}
              onChangeUrlsText={(text) => dispatch({ type: 'SET_PRODUCT_URLS_TEXT', payload: text })}
              onChangeMock={(mock) => dispatch({ type: 'SET_PRODUCT_MOCK', payload: mock })}
              onChangeBaseline={(b) => dispatch({ type: 'SET_PRODUCT_BASELINE', payload: b })}
              onChangeApiKey={(k) => dispatch({ type: 'SET_PRODUCT_API_KEY', payload: k })}
              onChangeBaseUrl={(u) => dispatch({ type: 'SET_PRODUCT_BASE_URL', payload: u })}
              onLoadSample={() => dispatch({ type: 'LOAD_PRODUCT_SAMPLE' })}
            />
          )}

          {state.scenario === 'weather-api' && (
            <WeatherPicker
              city={state.weatherCity}
              onChangeCity={(city) => dispatch({ type: 'SET_WEATHER_CITY', payload: city })}
            />
          )}

          {state.scenario === 'custom-request' && (
            <CustomScenarioGuide showToast={props.showToast} />
          )}

          {state.scenario === 'product-price-comparison' ? (
            <button className="btn btn-primary" onClick={() => void startCollect()}>
              开始采集与中位数分析
            </button>
          ) : (
            state.scenario !== 'custom-request' && (
              <button className="btn btn-primary" onClick={() => void startPreview()}>
                预览数量
              </button>
            )
          )}
        </>
      ) : (
        <PreviewPanel
          previewTask={state.previewTask}
          sleepMs={'sleepMs' in params ? params.sleepMs : 1000}
          onStartCollect={() => void startCollect()}
          onBackToEdit={() => dispatch({ type: 'RESET_PREVIEW' })}
        />
      )}
    </div>
  );
}
