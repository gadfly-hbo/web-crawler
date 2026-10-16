/**
 * WC-AR-06 A 用例固化（采纳文档 §7「纳入常规回归」）：
 * - A01 不装 Agent-Reach 主线可跑：依赖名/锁文件/安装脚本三面零痕迹（G8：全仓 importers 语义）
 * - A19 无隐式安装/外呼：test 目录主机名静态扫描（G6/G7/G10：动态发现、全文本、规则化 allowlist）
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { egressBlockReason } from 'data-governance/egress';

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(pkgDir, '..', '..');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'data', 'out', 'dist', '.flow', '.pnpm']);

/** 递归发现仓库内目标文件（排除构建/数据/流程目录，第七个包自动纳入扫描范围，G6/G10） */
async function walk(repoPath: string, pick: (relPath: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  const entries = await fs.readdir(repoPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      found.push(...(await walk(path.join(repoPath, entry.name), pick)));
    } else if (pick(path.relative(repoRoot, path.join(repoPath, entry.name)))) {
      found.push(path.join(repoPath, entry.name));
    }
  }
  return found;
}

/** A01 基线：全部 7 个 importers 的依赖名并集（新增合法依赖 = 在此加一行，失败信息会列出新名字，G8） */
const KNOWN_DEPENDENCIES = new Set([
  // 外部运行时
  '@hono/node-server',
  'hono',
  'react',
  'react-dom',
  // 外部开发期
  '@types/node',
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  'tsx',
  'typescript',
  'vite',
  // 工作区内部
  'api-connector',
  'cninfo-reports',
  'data-governance',
  'rss-collector',
]);

test('A01: 不装 Agent-Reach——依赖名/锁文件/安装脚本三面零痕迹', async () => {
  // 1. 锁文件不含 agent-reach 模式
  const lock = await fs.readFile(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  assert.doesNotMatch(lock, /agent[-_]?reach/i, 'pnpm-lock 中出现 Agent-Reach 依赖痕迹');

  // 2. 依赖名并集 ⊆ 已知基线（读 package.json 而非 lockfile——格式随 pnpm 版本漂移，G8）
  const packageJsons = await walk(repoRoot, (rel) => rel.split(path.sep).pop() === 'package.json');
  assert.ok(packageJsons.length >= 7, `应发现全部工作区 package.json，实得 ${packageJsons.length}`);
  const offenders: string[] = [];
  for (const file of packageJsons) {
    const pkg = JSON.parse(await fs.readFile(file, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    for (const key of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      for (const name of Object.keys(pkg[key] ?? {})) {
        if (!KNOWN_DEPENDENCIES.has(name)) offenders.push(`${name} (${path.relative(repoRoot, file)})`);
      }
    }
    // 3. 无安装钩子脚本
    for (const hook of ['postinstall', 'preinstall']) {
      assert.equal(pkg.scripts?.[hook], undefined, `${path.relative(repoRoot, file)} 不得有 ${hook} 安装脚本`);
    }
  }
  assert.deepEqual(offenders, [], `发现基线外依赖名，请评审后加入 KNOWN_DEPENDENCIES：${offenders.join('、')}`);
});

test('A19: 无隐式外呼——test 目录全部文本文件的主机名都在 allowlist 内', async () => {
  // 显式条目（各带注释；均为测试对象而非外呼目标，G7）
  const EXPLICIT_ALLOWLIST = new Set([
    'purl.org', // drift-rss.xml 的 DC 命名空间 URI
    'www.w3.org', // XML/Atom 命名空间 URI（非网络请求）
    'api.firecrawl.dev', // 真实服务端点 fixture（Settings/表单占位语义）
    'evil.com', // egress SSRF 边界测试对象（127.0.0.1.evil.com / @evil.com）
  ]);

  // G7/PRD 决策 10：IP 字面量须 parse 后判类——非公网段放行，公网仅这两个 egress 边界测试对象
  const BOUNDARY_PUBLIC_IPS = new Set(['11.0.0.1', '172.15.0.1']);

  const isNumericLiteral = (h: string): boolean =>
    h.split('.').every((seg) => /^\d+$/.test(seg) || /^0x[0-9a-f]+$/i.test(seg));

  /** IP 字面量判类（评审 F-1 修复）：复用 egress 门禁解析器——非公网（回环/私网/链路本地/0/8 等，含 IPv6）放行；公网仅边界清单 */
  const ipLiteralAllowed = (h: string): boolean => {
    const egressUrl = `http://${h}/`;
    return egressBlockReason(egressUrl) !== null || BOUNDARY_PUBLIC_IPS.has(h);
  };

  const hostAllowed = (rawHost: string): boolean => {
    const h = rawHost.toLowerCase().replace(/\.+$/, ''); // 归一化：小写 + 去尾点（F3 变体）
    if (h.startsWith('[')) return ipLiteralAllowed(h); // IPv6 字面量判类（[::1]/[fe80::] 放行，[2600::] 拒绝）
    if (h === '') return false;
    if (!h.includes('.')) {
      // 无点 token：数字/十六进制编码先经 IP 判类（R2-1 修复：134744072=8.8.8.8 应拒绝）；字母 token（模板串残片）非主机
      if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return ipLiteralAllowed(h);
      return true;
    }
    if (isNumericLiteral(h)) return ipLiteralAllowed(h); // 127.0.0.1/0177.0.0.1/0x7f000001 等判类，8.8.8.8 拒绝
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === 'example.com' || h.endsWith('.example.com') || h.endsWith('.example')) return true; // RFC 2606 族
    for (const allow of EXPLICIT_ALLOWLIST) {
      if (h === allow || h.endsWith(`.${allow}`)) return true;
    }
    return false;
  };

  // 本测试文件也在扫描范围内：allowlist 条目以纯字符串出现、无 scheme 前缀，天然不被提取
  const textExtensions = new Set([
    '.ts', '.tsx', '.mjs', '.js', '.xml', '.json', '.html', '.css', '.md', '.txt',
    '.yaml', '.yml', '.csv', '.snap', // F-2 补齐：常见文本 fixture 前向覆盖
  ]);
  const testFiles = await walk(repoRoot, (rel) => {
    const segs = rel.split(path.sep);
    return segs.includes('test') && textExtensions.has(path.extname(rel));
  });
  assert.ok(testFiles.length >= 30, `扫描应覆盖全部包的 test 目录，实得 ${testFiles.length} 个文本文件`);
  // G4：扩展名补齐的生效佐证——新增文本类型 fixture 必须进入扫描基数
  assert.ok(
    testFiles.some((f) => f.endsWith(path.join('fixtures', 'a19-scan-fixture.yaml'))),
    'a19-scan-fixture.yaml 应被扫描基数包含（.yaml 扩展名生效的直接证据）',
  );

  const violations: string[] = [];
  for (const file of testFiles) {
    const content = await fs.readFile(file, 'utf8').catch(() => '');
    for (const m of content.matchAll(/https?:\/\/([a-z0-9_.:[\]@-]+)/gi)) {
      let host = m[1];
      const at = host.lastIndexOf('@'); // 剥 userinfo（127.0.0.1@evil.com → evil.com）
      if (at >= 0) host = host.slice(at + 1);
      if (!host.startsWith('[')) {
        const colon = host.indexOf(':'); // 剥端口（含模板串的空端口 127.0.0.1:${port}）
        if (colon >= 0) host = host.slice(0, colon);
      }
      if (!hostAllowed(host)) {
        violations.push(`${host} (${path.relative(repoRoot, file)})`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `test 目录发现 allowlist 外的主机名（真实外呼嫌疑，A19）：\n${violations.join('\n')}`,
  );
});
