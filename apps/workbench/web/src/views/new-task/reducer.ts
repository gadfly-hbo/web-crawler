import { DEFAULT_SLEEP_MS, type TaskParams } from '../../../../shared/task-params';
import { ALL_TYPES, type NewTaskAction, type NewTaskState } from './types';

export const initialNewTaskState: NewTaskState = {
  stage: 1,
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
  errors: [],
  previewTask: null,
};

export function getTaskParams(state: NewTaskState): TaskParams {
  return {
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
