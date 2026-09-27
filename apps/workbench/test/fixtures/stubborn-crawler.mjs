// 常驻进程：忽略 SIGTERM（验证 SIGKILL 升级；先注册处理器再打出就绪行）
process.on('SIGTERM', () => {});
console.log(JSON.stringify({ type: 'start', totalCompanies: 1, dryRun: false }));
setInterval(() => {}, 1000);
