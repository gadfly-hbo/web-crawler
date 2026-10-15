import {
  DEFAULT_SLEEP_MS,
  createWeatherApiParams,
  type ApiConnectorParams,
  type SourceType,
  type TaskParams,
} from '../../../../shared/task-params';
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

export const DEFAULT_PRODUCT_SAMPLE_URLS = [
  'https://brand-a.example/shoes/101',
  'https://brand-a.example/shoes/102',
  'https://brand-a.example/shoes/103',
  'https://brand-b.example/shoes/201',
  'https://brand-b.example/shoes/202',
  'https://brand-b.example/shoes/203',
  'https://brand-c.example/shoes/301',
  'https://brand-c.example/shoes/302',
  'https://brand-c.example/shoes/303',
].join('\n');

export const initialNewTaskState: NewTaskState = {
  stage: 1,
  scenario: 'cninfo-reports',
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
  weatherCity: '北京',
  apiParams: initialApiFormState,
  productUrlsText: DEFAULT_PRODUCT_SAMPLE_URLS,
  productMock: true,
  productBaselineBrand: 'Brand A',
  productApiKey: (() => {
    try {
      return localStorage.getItem('firecrawl_api_key') || '';
    } catch {
      return '';
    }
  })(),
  productBaseUrl: (() => {
    try {
      return localStorage.getItem('firecrawl_base_url') || '';
    } catch {
      return '';
    }
  })(),
  errors: [],
  previewTask: null,
};

export function getTaskParams(state: NewTaskState): TaskParams {
  if (state.scenario === 'product-price-comparison') {
    const urls = state.productUrlsText
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0 && !u.startsWith('#'));
    return {
      sourceType: 'web-scraper',
      name: '公开商品标价与价格带对比',
      urls: urls.length > 0 ? urls : ['https://brand-a.example/shoes/101'],
      mock: state.productMock,
      analyze: true,
      baselineBrand: state.productBaselineBrand || 'Brand A',
      apiKey: state.productApiKey.trim() || undefined,
      baseUrl: state.productBaseUrl.trim() || undefined,
    };
  }

  if (state.scenario === 'weather-api') {
    return createWeatherApiParams(state.weatherCity);
  }

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
    case 'SET_SCENARIO': {
      const scenario = action.payload;
      let sourceType: SourceType = 'cninfo';
      if (scenario === 'product-price-comparison') {
        sourceType = 'web-scraper';
      } else if (scenario !== 'cninfo-reports') {
        sourceType = 'api-connector';
      }
      return { ...state, scenario, sourceType, errors: [] };
    }
    case 'SET_PRODUCT_URLS_TEXT':
      return { ...state, productUrlsText: action.payload, errors: [] };
    case 'SET_PRODUCT_MOCK':
      return { ...state, productMock: action.payload };
    case 'SET_PRODUCT_BASELINE':
      return { ...state, productBaselineBrand: action.payload };
    case 'SET_PRODUCT_API_KEY':
      return { ...state, productApiKey: action.payload };
    case 'SET_PRODUCT_BASE_URL':
      return { ...state, productBaseUrl: action.payload };
    case 'LOAD_PRODUCT_SAMPLE':
      return { ...state, productUrlsText: DEFAULT_PRODUCT_SAMPLE_URLS, errors: [] };
    case 'SET_SOURCE_TYPE':
      return { ...state, sourceType: action.payload, errors: [] };
    case 'SET_WEATHER_CITY':
      return { ...state, weatherCity: action.payload, errors: [] };
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
