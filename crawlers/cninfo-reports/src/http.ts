/** 带全局限速与重试的 HTTP 请求封装（Node >= 18 内置 fetch）。 */

export class HttpFatalError extends Error {}

export interface HttpOptions {
  retries?: number;
  timeoutMs?: number;
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

let globalSleepMs = 1000;
let lastRequestAt = 0;

export function setRateLimit(ms: number): void {
  globalSleepMs = ms;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(): Promise<void> {
  if (process.env.CNINFO_ORIGIN) return;
  const wait = lastRequestAt + globalSleepMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function request(url: string, init: RequestInit, opts: HttpOptions): Promise<Response> {
  const retries = opts.retries ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
      if (res.ok) return res;
      // 限速与 5xx 值得重试，其余 4xx 重试无意义
      if (res.status !== 429 && res.status < 500) {
        throw new HttpFatalError(`HTTP ${res.status} ${url}`);
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (err instanceof HttpFatalError) throw err;
      lastError = err;
    }
    if (attempt < retries) await sleep(attempt * 1000);
  }
  throw new Error(`请求失败（重试 ${retries} 次后放弃）：${url}，最后错误：${String(lastError)}`);
}

export async function httpJson<T>(
  url: string,
  init: RequestInit = {},
  opts: HttpOptions = {},
): Promise<T> {
  const res = await request(url, { ...init, headers: { ...BROWSER_HEADERS, ...init.headers } }, opts);
  return (await res.json()) as T;
}

export async function httpBuffer(
  url: string,
  init: RequestInit = {},
  opts: HttpOptions = {},
): Promise<Uint8Array> {
  const res = await request(url, { ...init, headers: { ...BROWSER_HEADERS, ...init.headers } }, opts);
  return new Uint8Array(await res.arrayBuffer());
}
