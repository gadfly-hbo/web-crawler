import type { StockEntry } from '../../api';
import type { TaskRecord } from '../../../../shared/task';
import type { ApiConnectorParams, ReportType, SourceType } from '../../../../shared/task-params';

export const ALL_TYPES: ReportType[] = ['annual', 'semi', 'q1', 'q3'];

export interface ApiConnectorFormState {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  pageParam: string;
  pageSizeParam: string;
  startPage: number;
  pageSize: number;
  maxPages: number;
  listPath: string;
  titlePath: string;
  itemKeyPath: string;
  downloadUrlPath: string;
  datePath: string;
  headersJson: string;
  bodyTemplate: string;
  sleepMs: number;
}

export interface NewTaskState {
  stage: 1 | 2;
  sourceType: SourceType;
  mode: 'company' | 'industry';
  companies: StockEntry[];
  industryList: string[];
  industries: string[];
  timeMode: 'year' | 'range';
  year: number;
  from: string;
  to: string;
  types: ReportType[];
  sleepMs: number;
  limitText: string;
  apiParams: ApiConnectorFormState;
  errors: string[];
  previewTask: TaskRecord | null;
}

export type NewTaskAction =
  | { type: 'SET_STAGE'; payload: 1 | 2 }
  | { type: 'SET_SOURCE_TYPE'; payload: SourceType }
  | { type: 'SET_MODE'; payload: 'company' | 'industry' }
  | { type: 'SET_COMPANIES'; payload: StockEntry[] }
  | { type: 'ADD_COMPANY'; payload: StockEntry }
  | { type: 'REMOVE_COMPANY'; payload: string }
  | { type: 'SET_INDUSTRY_LIST'; payload: string[] }
  | { type: 'ADD_INDUSTRY'; payload: string }
  | { type: 'REMOVE_INDUSTRY'; payload: string }
  | { type: 'SET_TIME_MODE'; payload: 'year' | 'range' }
  | { type: 'SET_YEAR'; payload: number }
  | { type: 'SET_FROM'; payload: string }
  | { type: 'SET_TO'; payload: string }
  | { type: 'TOGGLE_TYPE'; payload: ReportType }
  | { type: 'SET_SLEEP_MS'; payload: number }
  | { type: 'SET_LIMIT_TEXT'; payload: string }
  | { type: 'SET_API_PARAMS'; payload: Partial<ApiConnectorFormState> }
  | { type: 'LOAD_API_TEMPLATE'; payload: Omit<ApiConnectorParams, 'sourceType'> }
  | { type: 'SET_ERRORS'; payload: string[] }
  | { type: 'SET_PREVIEW_TASK'; payload: TaskRecord | null }
  | { type: 'RESET_PREVIEW' };
