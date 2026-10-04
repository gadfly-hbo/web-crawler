/** 产出文件浏览、单文件下载与 zip 打包路由。 */
import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { AppDeps } from '../types.js';

interface FileEntry {
  path: string;
  size: number;
  mtime: number;
}

/** 递归列出目录内容（相对路径），目录不存在时返回空清单。 */
async function walkFiles(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  async function rec(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await rec(full, `${prefix}${e.name}/`);
      else if (e.isFile()) {
        const st = await stat(full);
        out.push({ path: `${prefix}${e.name}`, size: st.size, mtime: st.mtimeMs });
      }
    }
  }
  await rec(root, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** 解析任务目录内的相对路径，拒绝任何逃逸（../、编码绕过等）。 */
function resolveInside(root: string, rel: string): string | null {
  if (!rel || rel.includes('\0')) return null;
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export function fileRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  // 文件清单：磁盘实时扫描（磁盘是事实源）
  app.get('/task/:id/files', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    return c.json({ files: await walkFiles(task.outDir) });
  });

  // 单文件下载（通配路由承载含 / 的相对路径）
  app.get('/task/:id/files/*', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    const filesIndex = c.req.path.indexOf('/files/');
    const rel = decodeURIComponent(c.req.path.slice(filesIndex + '/files/'.length));
    const abs = resolveInside(task.outDir, rel);
    if (!abs) return c.json({ error: '非法的文件路径' }, 400);
    const st = await stat(abs).catch(() => null);
    if (!st?.isFile()) return c.json({ error: '文件不存在' }, 404);
    const buf = await readFile(abs);
    return c.body(new Uint8Array(buf), 200, {
      'Content-Type': abs.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`,
    });
  });

  // zip 打包下载：spawn 系统 zip，stdout 流式直出；客户端断开连接时清理 child
  app.get('/task/:id/archive', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    const st = await stat(task.outDir).catch(() => null);
    if (!st?.isDirectory()) return c.json({ error: '该任务没有产出文件' }, 404);
    const child = spawn('zip', ['-r', '-q', '-', '.'], { cwd: task.outDir });
    const onAbort = () => {
      if (!child.killed) child.kill();
    };
    c.req.raw.signal.addEventListener('abort', onAbort, { once: true });
    child.once('close', () => {
      c.req.raw.signal.removeEventListener('abort', onAbort);
    });
    const webStream = Readable.toWeb(child.stdout) as ReadableStream;
    return c.body(webStream, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${task.id}.zip"`,
    });
  });

  // 在 Finder 中显示输出目录
  app.post('/task/:id/reveal', (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    (deps.reveal ?? ((dir: string) => void spawn('open', [dir])))(task.outDir);
    return c.json({ ok: true });
  });

  return app;
}
