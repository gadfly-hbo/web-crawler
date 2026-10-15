import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { FirecrawlAdapter } from '../src/adapter.js';
import { MockAcquisitionAdapter } from '../src/mock-adapter.js';

test('MockAcquisitionAdapter: 成功返回默认合成数据', async () => {
  const adapter = new MockAcquisitionAdapter();
  const caps = adapter.getCapabilities();

  assert.equal(caps.provider, 'mock_adapter');
  assert.equal(caps.supportsMarkdown, true);

  const res = await adapter.scrape({ url: 'https://example.com/shoes' });
  assert.equal(res.success, true);
  assert.equal(res.statusCode, 200);
  assert.ok(res.markdown?.includes('Sample Product'));
  assert.ok(res.html?.includes('product'));
});

test('MockAcquisitionAdapter: 匹配规则返回指定异常与状态码', async () => {
  const adapter = new MockAcquisitionAdapter([
    {
      matchUrl: '/rate-limited',
      errorStatus: 429,
      errorMessage: 'Too many requests'
    }
  ]);

  const res = await adapter.scrape({ url: 'https://example.com/rate-limited' });
  assert.equal(res.success, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.error?.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(res.error?.retryable, true);
});

test('FirecrawlAdapter: 对接本地 Mock HTTP Server 验证协议与错误归类', async () => {
  // 建立微型 HTTP 服务模拟 Firecrawl API
  let callCount = 0;
  const server = http.createServer((req, res) => {
    callCount++;
    if (req.url === '/v1/scrape') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        if (parsed.url.includes('not-found')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Page not found' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              data: {
                markdown: '# Remote Scraped Title',
                html: '<h1>Remote Scraped Title</h1>',
                metadata: {
                  sourceURL: parsed.url,
                  statusCode: 200
                }
              }
            })
          );
        }
      });
    } else {
      res.writeHead(400);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const adapter = new FirecrawlAdapter({
      apiKey: 'fc-test-key',
      baseUrl,
      isSelfHosted: false
    });

    // 1. 成功请求
    const successRes = await adapter.scrape({ url: 'https://mysite.com/item/1' });
    assert.equal(successRes.success, true);
    assert.equal(successRes.statusCode, 200);
    assert.equal(successRes.markdown, '# Remote Scraped Title');

    // 2. 404 错误
    const failRes = await adapter.scrape({ url: 'https://mysite.com/not-found' });
    assert.equal(failRes.success, false);
    assert.equal(failRes.statusCode, 404);
    assert.equal(failRes.error?.code, 'PAGE_NOT_FOUND');
    assert.equal(failRes.error?.retryable, false);
  } finally {
    server.close();
  }
});
