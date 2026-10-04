/** 行业门类与证券代码检索路由。 */
import { Hono } from 'hono';
import { listIndustries } from 'cninfo-reports/domain';
import type { AppDeps } from '../types.js';

export function metaRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/industries', (c) => c.json({ industries: [...listIndustries()] }));

  app.get('/stocks', async (c) => {
    try {
      const stocks = await deps.stocks.search(c.req.query('q') ?? '');
      return c.json({ stocks });
    } catch {
      return c.json(
        { error: '证券清单暂时不可用（巨潮资讯网无响应），请稍后重试；仍可直接输入 6 位公司代码创建任务' },
        503,
      );
    }
  });

  return app;
}
