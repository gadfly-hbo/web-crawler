// 常驻进程：SIGTERM 正常退出（先注册处理器再打出就绪行）
process.on('SIGTERM', () => process.exit(0));
console.log(JSON.stringify({ type: 'start', totalCompanies: 1, dryRun: false }));
setInterval(() => {}, 1000);
