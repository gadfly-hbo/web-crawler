import { DEFAULT_SLEEP_MS, type ApiConnectorParams, type TaskParams } from '../../../../shared/task-params';
import { ALL_TYPES, type ApiConnectorFormState, type NewTaskAction, type NewTaskState } from './types';

export const initialApiFormState: ApiConnectorFormState = {
  name: '自定义 API 数据采集',
  url: '',
  method: 'GET',
  pageParam: 'page',
  pageSizeParam: 'pageSize',
  startPage: 1,
  pageSize: 20,
  maxPages: 20,
  listPath: 'data.items',
  titlePath: 'title',
  itemKeyPath: 'id',
  downloadUrlPath: '',
  datePath: '',
  headersJson: '',
  bodyTemplate: '',
  sleepMs: DEFAULT_SLEEP_MS,
};

export const initialNewTaskState: NewTaskState = {
  stage: 1,
  sourceType: 'cninfo',
  mode: 'company',
  companies: [],
  industryList: [],
  industries: [],
  timeMode: 'year',
  year: new Date().getFullYear() - 1,
  from: '',
  to: '',
  types: ALL_TYPES,
  sleepMs: DEFAULT_SLEEP_MS,
  limitText: '',
  apiParams: initialApiFormState,
  errors: [],
  previewTask: null,
};

export function getTaskParams(state: NewTaskState): TaskParams {
  if (state.sourceType === 'api-connector') {
    let headers: Record<string, string> | undefined = undefined;
    if (state.apiParams.headersJson.trim()) {
      try {
        headers = JSON.parse(state.apiParams.headersJson);
      } catch {}
    }
    return {
      sourceType: 'api-connector',
      name: state.apiParams.name.trim(),
      request: {
        url: state.apiParams.url.trim(),
        method: state.apiParams.method,
        headers,
        bodyTemplate: state.apiParams.bodyTemplate.trim() || undefined,
      },
      pagination: {
        type: 'page_number',
        pageParam: state.apiParams.pageParam.trim(),
        pageSizeParam: state.apiParams.pageSizeParam.trim() || undefined,
        startPage: Number(state.apiParams.startPage) || 1,
        pageSize: Number(state.apiParams.pageSize) || 20,
        maxPages: Number(state.apiParams.maxPages) || 20,
      },
      extraction: {
        listPath: state.apiParams.listPath.trim(),
        titlePath: state.apiParams.titlePath.trim(),
        itemKeyPath: state.apiParams.itemKeyPath.trim() || undefined,
        downloadUrlPath: state.apiParams.downloadUrlPath.trim() || undefined,
        datePath: state.apiParams.datePath.trim() || undefined,
      },
      sleepMs: Number(state.apiParams.sleepMs) || DEFAULT_SLEEP_MS,
    };
  }

  return {
    sourceType: 'cninfo',
    companies: state.mode === 'company' ? state.companies.map((c) => c.code || c.name) : [],
    industries: state.mode === 'industry' ? state.industries : [],
    year: state.timeMode === 'year' ? state.year : undefined,
    from: state.timeMode === 'range' ? state.from : undefined,
    to: state.timeMode === 'range' ? state.to : undefined,
    types: state.types,
    limit: state.limitText.trim() ? Number(state.limitText) : undefined,
    sleepMs: state.sleepMs,
  };
}

export function newTaskReducer(state: NewTaskState, action: NewTaskAction): NewTaskState {
  switch (action.type) {
    case 'SET_SOURCE_TYPE':
      return { ...state, sourceType: action.payload, errors: [] };
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_COMPANIES':
      return { ...state, companies: action.payload };
    case 'ADD_COMPANY':
      if (state.companies.some((c) => c.code === action.payload.code)) return state;
      return { ...state, companies: [...state.companies, action.payload] };
    case 'REMOVE_COMPANY':
      return { ...state, companies: state.companies.filter((c) => c.code !== action.payload) };
    case 'SET_INDUSTRY_LIST':
      return { ...state, industryList: action.payload };
    case 'ADD_INDUSTRY':
      if (!action.payload || state.industries.includes(action.payload)) return state;
      return { ...state, industries: [...state.industries, action.payload] };
    case 'REMOVE_INDUSTRY':
      return { ...state, industries: state.industries.filter((i) => i !== action.payload) };
    case 'SET_TIME_MODE':
      return { ...state, timeMode: action.payload };
    case 'SET_YEAR':
      return { ...state, year: action.payload };
    case 'SET_FROM':
      return { ...state, from: action.payload };
    case 'SET_TO':
      return { ...state, to: action.payload };
    case 'TOGGLE_TYPE': {
      const t = action.payload;
      const next = state.types.includes(t)
        ? state.types.filter((x) => x !== t)
        : [...state.types, t];
      return { ...state, types: next };
    }
    case 'SET_SLEEP_MS':
      return { ...state, sleepMs: action.payload };
    case 'SET_LIMIT_TEXT':
      return { ...state, limitText: action.payload };
    case 'SET_API_PARAMS':
      return { ...state, apiParams: { ...state.apiParams, ...action.payload } };
    case 'LOAD_API_TEMPLATE': {
      const t = action.payload;
      return {
        ...state,
        apiParams: {
          name: t.name,
          url: t.request.url,
          method: t.request.method,
          pageParam: t.pagination.pageParam,
          pageSizeParam: t.pagination.pageSizeParam ?? '',
          startPage: t.pagination.startPage,
          pageSize: t.pagination.pageSize,
          maxPages: t.pagination.maxPages ?? 20,
          listPath: t.extraction.listPath,
          titlePath: t.extraction.titlePath,
          itemKeyPath: t.extraction.itemKeyPath ?? '',
          downloadUrlPath: t.extraction.downloadUrlPath ?? '',
          datePath: t.extraction.datePath ?? '',
          headersJson: t.request.headers ? JSON.stringify(t.request.headers, null, 2) : '',
          bodyTemplate: t.request.bodyTemplate ?? '',
          sleepMs: t.sleepMs,
        },
        errors: [],
      };
    }
    case 'SET_ERRORS':
      return { ...state, errors: action.payload };
    case 'SET_STAGE':
      return { ...state, stage: action.payload };
    case 'SET_PREVIEW_TASK':
      return { ...state, previewTask: action.payload };
    case 'RESET_PREVIEW':
      return { ...state, stage: 1, previewTask: null, errors: [] };
    default:
      return state;
  }
}
