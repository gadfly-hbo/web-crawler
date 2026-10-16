/** 服务关停例程（PRD 决策 6-8 / G1-G3/G6）：信号 → 中断活动任务 → flush → 退出。 */
import process from 'node:process';

export interface ShutdownQueue {
  interruptActive(): Promise<void>;
  close(): Promise<void>;
}

export interface ShutdownDeps {
  queue: ShutdownQueue;
  exit: (code: number) => void;
}

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * 注册关停信号处理：首信号走优雅关停（interruptActive → close → exit(0)），
 * 第二信号同步 exit(130)（双击强退逃生门）。返回 uninstall 供测试防污染（G3）。
 * SIGHUP 覆盖启动器文档化的「关闭本窗口」退出路径（KA4）。
 */
export function installSignalHandlers(deps: ShutdownDeps): () => void {
  let shuttingDown = false;
  const handler = (): void => {
    if (shuttingDown) {
      deps.exit(130);
      return;
    }
    shuttingDown = true;
    void (async () => {
      await deps.queue.interruptActive();
      await deps.queue.close();
      deps.exit(0);
    })();
  };
  for (const sig of SHUTDOWN_SIGNALS) {
    process.on(sig, handler);
  }
  return () => {
    for (const sig of SHUTDOWN_SIGNALS) {
      process.off(sig, handler);
    }
  };
}
