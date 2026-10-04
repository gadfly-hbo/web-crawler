/** HTTP API：Hono 应用装配入口（模块化路由组装）。 */
import { Hono } from 'hono';

import { fileRoutes } from './routes/files.js';
import { metaRoutes } from './routes/meta.js';
import { sseRoutes } from './routes/sse.js';
import { taskRoutes } from './routes/tasks.js';
import type { AppDeps } from './types.js';

export type { AppDeps } from './types.js';

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.route('/api/meta', metaRoutes(deps));
  app.route('/api', taskRoutes(deps));
  app.route('/api', fileRoutes(deps));
  app.route('/api', sseRoutes(deps));

  return app;
}
