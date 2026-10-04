import type { StockEntry } from '../../api';
import type { TaskRecord } from '../../../../shared/task';
import type { ReportType } from '../../../../shared/task-params';

export const ALL_TYPES: ReportType[] = ['annual', 'semi', 'q1', 'q3'];

export interface NewTaskState {
  stage: 1 | 2;
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
  errors: string[];
  previewTask: TaskRecord | null;
}

export type NewTaskAction =
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
  | { type: 'SET_ERRORS'; payload: string[] }
  | { type: 'SET_STAGE'; payload: 1 | 2 }
  | { type: 'SET_PREVIEW_TASK'; payload: TaskRecord | null }
  | { type: 'RESET_PREVIEW' };
