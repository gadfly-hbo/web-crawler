/**
 * 安全的 JSONPath 提取工具函数。
 * 纯函数，支持点分隔路径（data.items）与数组下标（items[0] 或 items.0），
 * 遇到不存在属性安全返回 undefined，绝不抛出异常。
 */

/**
 * 将路径字符串解析为属性 key 序列。
 * 例如：'data.items[0].url' -> ['data', 'items', '0', 'url']
 * '$.data.list' -> ['data', 'list']
 */
export function parsePath(path: string): string[] {
  if (!path || typeof path !== 'string') return [];
  const trimmed = path.trim().replace(/^\$\.?/, '');
  if (!trimmed) return [];

  // 将 [0] 转换为 .0，保持纯属性键名访问
  const normalized = trimmed.replace(/\[(\w+)\]/g, '.$1');
  return normalized.split('.').filter((part) => part.length > 0);
}

/**
 * 根据路径从对象中提取任意值。不存在时返回 undefined。
 */
export function extractPath(target: unknown, path: string): unknown {
  if (target == null) return undefined;
  const segments = parsePath(path);
  if (segments.length === 0) return target;

  let current: unknown = target;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/**
 * 提取数组，如果提取到的结果不是数组则返回 undefined。
 */
export function extractArray(target: unknown, path: string): unknown[] | undefined {
  const val = extractPath(target, path);
  return Array.isArray(val) ? val : undefined;
}

/**
 * 提取字符串，若为非空值可转为 string；对象/数组或空值返回 undefined。
 */
export function extractString(target: unknown, path: string): string | undefined {
  const val = extractPath(target, path);
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return undefined;
}
