// 永不返回的爬虫 fixture：打印一行 NDJSON 后永久挂起（无信号处理器，SIGTERM 默认终止）
console.log(JSON.stringify({ type: 'start', totalCompanies: 1 }));
setInterval(() => {}, 1000);
