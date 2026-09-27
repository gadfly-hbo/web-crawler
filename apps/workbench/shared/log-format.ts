/** 把爬虫 NDJSON 事件行转成人读日志文案（纯函数，web 端渲染与测试共用）。 */

export function formatLogLine(line: string): string {
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return line;
  }
  const fmtBytes = (n: unknown): string => {
    const b = Number(n ?? 0);
    return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`;
  };
  switch (ev.type) {
    case 'start':
      return `开始：共 ${ev.totalCompanies} 家公司待处理${ev.dryRun ? '（预览模式，不下载）' : ''}`;
    case 'company':
      return `[${ev.index}/${ev.total}] ${ev.name}（${ev.code}）`;
    case 'file': {
      const label = `${ev.name ?? ''} ${ev.title ?? ''}`.trim();
      if (ev.status === 'downloaded') return `↓ 已下载 ${label}${ev.bytes != null ? `（${fmtBytes(ev.bytes)}）` : ''}`;
      if (ev.status === 'skipped') return `＝ 已存在，跳过 ${label}`;
      return `✗ 下载失败 ${ev.name ?? ''}：${ev.reason ?? '未知原因'}`;
    }
    case 'queryError':
      return `✗ 检索失败 ${ev.target ?? ''}：${ev.reason ?? '未知原因'}`;
    case 'preview':
      return `预览结果：${ev.companies} 家公司、${ev.reports} 份报告`;
    case 'done': {
      const s = (ev.summary ?? {}) as Record<string, unknown>;
      return `完成：新下载 ${s.downloaded ?? 0} 份、跳过 ${s.skipped ?? 0} 份、失败 ${s.failed ?? 0} 处`;
    }
    case 'error':
      return `错误：${ev.message ?? '未知错误'}`;
    case 'stderr':
      return `日志：${ev.text ?? ''}`;
    default:
      return line;
  }
}
