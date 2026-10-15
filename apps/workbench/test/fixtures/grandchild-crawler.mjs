// 孙进程 fixture：spawn 一个写 pidfile 后永久挂起的孙进程，自身打印 ready 行后挂起
import { spawn } from 'node:child_process';

spawn(
  process.execPath,
  ['-e', `require('node:fs').writeFileSync(process.env.GC_PIDFILE, String(process.pid)); setInterval(() => {}, 1000);`],
  { stdio: 'ignore' },
);
console.log(JSON.stringify({ type: 'start', totalCompanies: 1 }));
setInterval(() => {}, 1000);
