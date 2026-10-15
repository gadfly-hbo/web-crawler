/** Settings API：Firecrawl 凭据与端点状态感知与连通性检测。 */
import { Hono } from 'hono';
import type { AppDeps } from '../types.js';

export function settingsRoutes(_deps: AppDeps): Hono {
  const app = new Hono();

  /**
   * GET /settings/firecrawl
   * 获取当前环境变量与端点检测状态（敏感密钥脱敏输出）
   */
  app.get('/settings/firecrawl', (c) => {
    const rawKey = process.env.FIRECRAWL_API_KEY?.trim();
    const envBaseUrl = process.env.FIRECRAWL_BASE_URL?.trim() || 'https://api.firecrawl.dev';
    const isSelfHosted = !!process.env.FIRECRAWL_BASE_URL?.trim();

    return c.json({
      hasEnvApiKey: !!rawKey,
      maskedEnvApiKey: rawKey
        ? rawKey.length <= 8
          ? '****'
          : `${rawKey.slice(0, 3)}****${rawKey.slice(-4)}`
        : null,
      envBaseUrl,
      isSelfHosted,
    });
  });

  /**
   * POST /settings/firecrawl
   * 动态设置/更新当前进程的 Firecrawl 环境变量
   */
  app.post('/settings/firecrawl', async (c) => {
    try {
      const body = (await c.req.json()) as { apiKey?: string; baseUrl?: string };
      if (body.apiKey !== undefined) {
        const trimmed = body.apiKey.trim();
        // 忽略已脱敏的占位符（如包含 ****）
        if (trimmed && !trimmed.includes('****')) {
          process.env.FIRECRAWL_API_KEY = trimmed;
        } else if (!trimmed) {
          delete process.env.FIRECRAWL_API_KEY;
        }
      }

      if (body.baseUrl !== undefined) {
        const trimmed = body.baseUrl.trim();
        if (trimmed) {
          process.env.FIRECRAWL_BASE_URL = trimmed;
        } else {
          delete process.env.FIRECRAWL_BASE_URL;
        }
      }

      const rawKey = process.env.FIRECRAWL_API_KEY?.trim();
      return c.json({
        ok: true,
        hasEnvApiKey: !!rawKey,
        maskedEnvApiKey: rawKey
          ? rawKey.length <= 8
            ? '****'
            : `${rawKey.slice(0, 3)}****${rawKey.slice(-4)}`
          : null,
        envBaseUrl: process.env.FIRECRAWL_BASE_URL?.trim() || 'https://api.firecrawl.dev',
      });
    } catch (err: any) {
      return c.json({ error: `保存失败: ${err.message}` }, 400);
    }
  });

  /**
   * POST /settings/firecrawl/test
   * 测试 Firecrawl 连通性与 API Key 有效性
   */
  app.post('/settings/firecrawl/test', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { apiKey?: string; baseUrl?: string };
      let apiKey = body.apiKey?.trim();
      if (!apiKey || apiKey.includes('****')) {
        apiKey = process.env.FIRECRAWL_API_KEY?.trim();
      }

      const baseUrl = (body.baseUrl?.trim() || process.env.FIRECRAWL_BASE_URL?.trim() || 'https://api.firecrawl.dev').replace(/\/+$/, '');

      // 向目标端点发起轻量级校验请求
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const endpoint = `${baseUrl}/v1/scrape`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: 'https://example.com',
          formats: ['markdown'],
        }),
        signal: controller.signal,
      }).catch((err) => {
        throw new Error(`网络连接失败 (${baseUrl}): ${err.message}`);
      }).finally(() => {
        clearTimeout(timer);
      });

      if (res.status === 401 || res.status === 403) {
        return c.json({
          ok: false,
          error: `认证失败 (HTTP ${res.status})：请检查 API Key 是否有效。`,
        }, 400);
      }

      if (res.status === 429) {
        return c.json({
          ok: false,
          error: '频率受限 (HTTP 429)：超出速率或额度限制。',
        }, 400);
      }

      if (!res.ok && res.status >= 500) {
        return c.json({
          ok: false,
          error: `服务端错误 (HTTP ${res.status})：目标 Firecrawl 实例异常。`,
        }, 400);
      }

      return c.json({
        ok: true,
        message: `连通性测试通过！端点响应正常 (HTTP ${res.status})`,
      });
    } catch (err: any) {
      return c.json({
        ok: false,
        error: err.message || '连通性测试异常',
      }, 400);
    }
  });

  return app;
}
