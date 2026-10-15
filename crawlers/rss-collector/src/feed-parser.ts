/**
 * 冻结样本最小 RSS/Atom 解析器（PoC，零依赖）。
 * 保守边界（PRD 决策 8 / G8）：
 * - 判型与子标签只认无前缀小写字面标签；带前缀标签（atom:link、dc:date）按未知处理，不参与字段匹配。
 * - 只解 5 种 XML 预定义实体与 CDATA 壳；不做 DTD、命名空间展开、外部实体（天然免疫 XXE）。
 * - 截断样本：丢弃无闭合的尾部条目，标记 truncated；完整条目保留。
 * - 原文没有的字段为 null；published 不回退 updated；禁止估算。
 * - raw.* 保留解码前原文切片，供 FieldEvidence 的 locateSnippet 逐字回验。
 */

export interface FeedEntryRaw {
  title?: string;
  link?: string;
  published?: string;
  summary?: string;
  guid?: string;
}

export interface FeedEntry {
  title: string | null;
  link: string | null;
  published: string | null;
  summary: string | null;
  guid: string | null;
  /** 解码前原文切片（含 CDATA 壳与实体编码形态），证据定位的唯一真源 */
  raw: FeedEntryRaw;
}

export interface ParsedFeed {
  kind: 'rss' | 'atom';
  feedTitle: string | null;
  entries: FeedEntry[];
  /** 尾部存在未闭合条目（传输截断）时为 true（A07） */
  truncated: boolean;
}

interface InnerText {
  decoded: string | null;
  raw: string;
}

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&apos;': "'",
  '&quot;': '"',
};

function decodeText(raw: string): string | null {
  let text = raw;
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata) text = cdata[1];
  text = text.replace(/&(?:lt|gt|amp|apos|quot);/g, (m) => ENTITIES[m]);
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** 提取形如 <tag attrs>inner</tag> 的第一个匹配；返回解码值与原文内文切片。 */
function extractTag(block: string, tag: string): InnerText | null {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  if (!m) return null;
  return { decoded: decodeText(m[2]), raw: m[2] };
}

/** Atom link 选择（G8）：第一个 rel 缺省或 rel="alternate" 的 href；否则第一个 link 的 href；全无 → null。 */
function extractAtomLink(block: string): InnerText | null {
  const re = /<link\b([^>]*?)(?:\/>|>([\s\S]*?)<\/link>)/g;
  const candidates: { rel: string | undefined; href: string | null; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const attrs = m[1] ?? '';
    const relMatch = attrs.match(/\brel="([^"]*)"/);
    const hrefMatch = attrs.match(/\bhref="([^"]*)"/);
    candidates.push({
      rel: relMatch ? relMatch[1] : undefined,
      href: hrefMatch ? hrefMatch[1] : null,
      raw: hrefMatch ? hrefMatch[1] : m[0],
    });
  }
  const chosen =
    candidates.find((c) => (c.rel === undefined || c.rel === 'alternate') && c.href !== null) ??
    candidates[0] ??
    null;
  if (!chosen || chosen.href === null) return null;
  const decoded = decodeText(chosen.href);
  return decoded === null ? null : { decoded, raw: chosen.raw };
}

function tagValue(block: string, tag: string): { value: string | null; raw?: string } {
  const hit = extractTag(block, tag);
  return hit ? { value: hit.decoded, raw: hit.raw } : { value: null };
}

function parseRssItems(body: string): ParsedFeed | null {
  const itemRe = /<item(\s[^>]*)?>([\s\S]*?)<\/item>/g;
  const entries: FeedEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(body)) !== null) {
    const block = m[2];
    const title = tagValue(block, 'title');
    const link = tagValue(block, 'link');
    const published = tagValue(block, 'pubDate');
    const summary = tagValue(block, 'description');
    const guid = tagValue(block, 'guid');
    entries.push({
      title: title.value,
      link: link.value,
      published: published.value,
      summary: summary.value,
      guid: guid.value,
      raw: {
        ...(title.raw !== undefined && title.value !== null ? { title: title.raw } : {}),
        ...(link.raw !== undefined && link.value !== null ? { link: link.raw } : {}),
        ...(published.raw !== undefined && published.value !== null ? { published: published.raw } : {}),
        ...(summary.raw !== undefined && summary.value !== null ? { summary: summary.raw } : {}),
        ...(guid.raw !== undefined && guid.value !== null ? { guid: guid.raw } : {}),
      },
    });
  }
  const openCount = (body.match(/<item(\s[^>]*)?>/g) ?? []).length;
  const closeCount = (body.match(/<\/item>/g) ?? []).length;
  return { kind: 'rss', feedTitle: null, entries, truncated: openCount > closeCount };
}

function parseAtomEntries(body: string): ParsedFeed | null {
  const entryRe = /<entry(\s[^>]*)?>([\s\S]*?)<\/entry>/g;
  const entries: FeedEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body)) !== null) {
    const block = m[2];
    const title = tagValue(block, 'title');
    const link = extractAtomLink(block);
    const published = tagValue(block, 'published');
    const summary = tagValue(block, 'summary');
    const guid = tagValue(block, 'id');
    entries.push({
      title: title.value,
      link: link?.decoded ?? null,
      published: published.value,
      summary: summary.value,
      guid: guid.value,
      raw: {
        ...(title.raw !== undefined && title.value !== null ? { title: title.raw } : {}),
        ...(link ? { link: link.raw } : {}),
        ...(published.raw !== undefined && published.value !== null ? { published: published.raw } : {}),
        ...(summary.raw !== undefined && summary.value !== null ? { summary: summary.raw } : {}),
        ...(guid.raw !== undefined && guid.value !== null ? { guid: guid.raw } : {}),
      },
    });
  }
  const openCount = (body.match(/<entry(\s[^>]*)?>/g) ?? []).length;
  const closeCount = (body.match(/<\/entry>/g) ?? []).length;
  return { kind: 'atom', feedTitle: null, entries, truncated: openCount > closeCount };
}

/**
 * 解析冻结样本 Feed。根元素只认无前缀小写 <rss>/<feed>（前置仅允许 XML 声明、注释与空白）；
 * 其余（HTML 挑战页、带前缀根、空串）返回 null，由调用方按“非合法 Feed”处置（A05）。
 */
export function parseFeed(xml: string): ParsedFeed | null {
  const doc = xml.replace(/^\uFEFF/, '');
  const rootMatch = doc.match(/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(rss|feed)(\s[^>]*)?>/);
  if (!rootMatch) return null;
  const kind = rootMatch[1] === 'rss' ? 'rss' : 'atom';
  const bodyStart = rootMatch.index! + rootMatch[0].length;

  const firstItemIdx = doc.slice(bodyStart).search(/<(item|entry)(\s[^>]*)?>/);
  const headRegion = firstItemIdx >= 0 ? doc.slice(bodyStart, bodyStart + firstItemIdx) : doc.slice(bodyStart);
  const feedTitle = extractTag(headRegion, 'title');

  const parsed = kind === 'rss' ? parseRssItems(doc.slice(bodyStart)) : parseAtomEntries(doc.slice(bodyStart));
  if (!parsed) return null;
  return { ...parsed, feedTitle: feedTitle?.decoded ?? null };
}
