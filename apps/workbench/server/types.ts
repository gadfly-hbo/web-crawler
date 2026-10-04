/** 服务端核心类型定义。 */
import type { TaskQueue } from './queue.js';
import type { StockDirectory } from './stocks.js';

export interface AppDeps {
  queue: TaskQueue;
  stocks: StockDirectory;
  /** 在系统文件管理器中显示目录（默认 macOS open）；测试注入替身。 */
  reveal?: (dir: string) => void;
}
