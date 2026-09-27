/** 服务入口：API + 静态托管 web/dist，仅绑 127.0.0.1。 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildApp } from './app.js';
import { TaskQueue } from './queue.js';
import { makeCrawlerRunner } from './runner.js';
import { StockDirectory } from './stocks.js';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgDir, '../..');
const dataRoot = path.join(repoRoot, 'data');
const distDir = path.join(pkgDir, 'web', 'dist');
const port = Number(process.env.PORT ?? 4180);

const queue = new TaskQueue({ runner: makeCrawlerRunner({ repoRoot }), dataRoot });
await queue.init();

const app = buildApp({ queue, stocks: new StockDirectory() });

// 前端为 hash 路由，只需托管 / 与 /assets/**
app.get('/', serveStatic({ path: path.join(distDir, 'index.html') }));
app.use('/assets/*', serveStatic({ root: distDir }));

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`数据采集工作台：http://127.0.0.1:${info.port}（仅本机访问，数据保存在本机 data/ 目录）`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[启动失败] 端口 ${port} 被占用：可能已有一个工作台在运行（直接打开浏览器即可），`);
    console.error(`或改用其他端口启动：PORT=4181 pnpm --filter workbench start`);
    process.exit(1);
  }
  throw err;
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
