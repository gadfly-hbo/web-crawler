// 打印两行 NDJSON 后退出（最后一行不带换行，验证关闭时冲刷）
console.log(JSON.stringify({ type: 'start', totalCompanies: 1, dryRun: false }));
process.stdout.write(JSON.stringify({ type: 'done', summary: { companies: 1, matched: 1, downloaded: 1, skipped: 0, bytes: 1, failed: 0, outDir: '/x' } }));
