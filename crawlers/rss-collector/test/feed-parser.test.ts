/** 冻结样本解析器测试：外部行为 = parseFeed(xml) 的输出形状与原文回验。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { locateSnippet } from 'data-governance/evidence';
import { parseFeed } from '../src/feed-parser.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function readFixture(name: string): Promise<string> {
  return fs.readFile(path.join(fixturesDir, name), 'utf8');
}

/** 每个非空字段的原文切片必须能在 Feed 原文中逐字定位（证据回验断言，PRD 测试节）。 */
function assertEvidenceLocatable(xml: string, entry: ReturnType<typeof parseFeed> extends null ? never : NonNullable<ReturnType<typeof parseFeed>>['entries'][number]): void {
  for (const key of ['title', 'link', 'published', 'summary'] as const) {
    const raw = entry.raw[key];
    if (raw === undefined) continue;
    const loc = locateSnippet(xml, raw);
    assert.ok(loc, `字段 ${key} 的原文切片应可在 Feed 原文中定位: ${JSON.stringify(raw)}`);
    assert.ok(loc.charOffsetStart >= 0 && loc.charOffsetEnd > loc.charOffsetStart);
  }
}

test('rss-collector 解析器: 正常 RSS 2.0 全字段解析且证据可回验', async () => {
  const xml = await readFixture('normal-rss.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.kind, 'rss');
  assert.equal(feed.truncated, false);
  assert.equal(feed.feedTitle, '示例公开资讯源');
  assert.equal(feed.entries.length, 3);

  const first = feed.entries[0];
  assert.equal(first.title, '第一条：平台发布新版本');
  assert.equal(first.link, 'https://news.example.com/posts/101');
  assert.equal(first.published, 'Wed, 14 Oct 2026 08:00:00 GMT');
  assert.equal(first.summary, '新版本包含三项能力更新。');
  assert.equal(first.guid, 'https://news.example.com/posts/101');
  for (const entry of feed.entries) assertEvidenceLocatable(xml, entry);
});

test('rss-collector 解析器: Atom 变体（published 不回退 updated、link 取 alternate）', async () => {
  const xml = await readFixture('atom.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.kind, 'atom');
  assert.equal(feed.feedTitle, '示例 Atom 源');
  assert.equal(feed.entries.length, 2);

  const [e1, e2] = feed.entries;
  assert.equal(e1.title, 'Atom 条目一');
  assert.equal(e1.link, 'https://blog.example.com/entries/1');
  assert.notEqual(e1.link, 'https://blog.example.com/entries/1?format=atom');
  assert.equal(e1.published, '2026-10-14T08:00:00Z', 'published 必须取 published 标签，不得回退 updated');
  assert.equal(e1.guid, 'urn:uuid:aaa-bbb-001');
  assert.equal(e1.summary, 'Atom 条目一的摘要。');

  assert.equal(e2.title, 'Atom entry two', '带 type 属性的 title 仍可解析');
  assert.equal(e2.link, 'https://blog.example.com/entries/2', '无 rel 的 link 视为 alternate');
  assert.equal(e2.published, '2026-10-15T09:00:00Z');
  assert.equal(e2.summary, '<p>Second entry summary</p>');
  for (const entry of feed.entries) assertEvidenceLocatable(xml, entry);
});

test('rss-collector 解析器: 合法空 Feed 是 0 条目而非失败（A06）', async () => {
  const xml = await readFixture('empty-rss.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.kind, 'rss');
  assert.equal(feed.entries.length, 0);
  assert.equal(feed.truncated, false);
  assert.equal(feed.feedTitle, '合法空 Feed');
});

test('rss-collector 解析器: 截断样本保留完整条目并标记 truncated（A07）', async () => {
  const xml = await readFixture('truncated-rss.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.truncated, true);
  assert.equal(feed.entries.length, 2, '尾部未闭合条目必须丢弃');
  assert.equal(feed.entries[0].title, '完整条目一');
  assert.equal(feed.entries[1].title, '完整条目二');
});

test('rss-collector 解析器: CDATA 剥壳取内文、原文切片保留壳', async () => {
  const xml = await readFixture('cdata-entities.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  const [e1, e2] = feed.entries;
  assert.equal(e1.summary, '摘要中包含 <b>加粗</b> 与 & 符号，整体在 CDATA 壳内。');
  assert.ok(e1.raw.summary!.includes('<![CDATA['), '原文切片保留 CDATA 壳以保证 locateSnippet 逐字命中');
  assert.equal(e2.title, '纯 CDATA 标题 <未转义>');
  for (const entry of feed.entries) assertEvidenceLocatable(xml, entry);
});

test('rss-collector 解析器: 五种预定义实体解转义、原文切片保留编码形态', async () => {
  const xml = await readFixture('cdata-entities.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.entries[0].title, `A & B 公司 <年报> 发布'新'版本"2.0"`);
  assert.equal(feed.entries[0].raw.title, 'A &amp; B 公司 &lt;年报&gt; 发布&apos;新&apos;版本&quot;2.0&quot;');
  assertEvidenceLocatable(xml, feed.entries[0]);
});

test('rss-collector 解析器: 缺失字段为 null、不编造（A14 字段级）', async () => {
  const xml = await readFixture('missing-fields.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.entries.length, 3);
  const [noTitle, noLink, noPub] = feed.entries;
  assert.equal(noTitle.title, null);
  assert.equal(noTitle.link, 'https://missing.example.com/no-title');
  assert.equal(noLink.title, '缺 link 的条目');
  assert.equal(noLink.link, null);
  assert.equal(noLink.guid, null);
  assert.equal(noPub.published, null, '原文没有 pubDate 就必须是 null，禁止估算');
  assert.equal(noPub.guid, 'urn:example:no-pubdate');
});

test('rss-collector 解析器: 容忍 UTF-8 BOM 与声明前空白', async () => {
  const xml = await readFixture('bom-rss.xml');
  assert.ok(xml.charCodeAt(0) === 0xfeff, 'fixture 必须真实带 BOM');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.entries.length, 1);
  assert.equal(feed.entries[0].title, 'BOM 后的第一条');
  assertEvidenceLocatable(xml, feed.entries[0]);
});

test('rss-collector 解析器: 结构漂移——注释/未知标签忽略、前缀标签不撞名（A14）', async () => {
  const xml = await readFixture('drift-rss.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  assert.equal(feed.feedTitle, '结构漂移样本源');
  assert.equal(feed.entries.length, 1);
  const entry = feed.entries[0];
  assert.equal(entry.title, '带前缀标签的条目');
  assert.equal(entry.link, 'https://drift.example.com/1', 'atom:link 前缀标签不得冒充 link');
  assert.notEqual(entry.link, 'https://drift.example.com/1?atom=1');
  assert.equal(entry.published, null, 'dc:date 前缀标签不得冒充发布时间');
  assert.equal(entry.summary, 'atom:link 与 dc:date 均应被忽略：link 用无前缀 link，published 为 null。');
  assertEvidenceLocatable(xml, entry);
});

test('rss-collector 解析器: 非 Feed 内容判为非法（A05 前置）', () => {
  assert.equal(parseFeed('<html><body>挑战页</body></html>'), null);
  assert.equal(parseFeed(''), null);
  assert.equal(parseFeed('不是 XML'), null);
  assert.equal(parseFeed('<?xml version="1.0"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>'), null, '带前缀根元素按冻结样本规则判非法');
});

test('rss-collector 解析器: 不可信内容仅作为数据保留（A09）', async () => {
  const xml = await readFixture('a09-untrusted.xml');
  const feed = parseFeed(xml);
  assert.ok(feed);
  const entry = feed.entries[0];
  assert.equal(entry.title, `<script>alert('xss')</script> 注入尝试标题`, '脚本内容解转义后是纯文本数据');
  assert.equal(entry.link, 'https://evil.example.com/1?next=javascript:alert(1)', '伪协议 URL 原样保留为数据');
  assert.ok(entry.summary!.includes('$(rm -rf /)'));
  assertEvidenceLocatable(xml, entry);
});
