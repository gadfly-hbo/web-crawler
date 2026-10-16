/**
 * 出口门禁：识别指向内网/回环/链路本地的 URL。
 * 仅按 URL 字面解析，不做 DNS 解析（DNS rebinding 不在防护范围）。
 */

const BLOCK_REASON = '目标地址指向内网/回环，已被出口门禁拦截';
const PROTOCOL_REASON = '仅支持 http/https URL';

/** 拦截原因分类（测试豁免通道需要区分两类判定，见 rss-collector G3） */
export const EGRESS_PRIVATE_BLOCK_REASON = BLOCK_REASON;
export const EGRESS_PROTOCOL_REASON = PROTOCOL_REASON;

function parseIpv4(host: string): number[] | null {
  // 支持标准四段、短格式（127.1）、十进制整型（2130706433）、十六/八进制段（0x7f / 0177）
  const parts = host.split('.');
  if (parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!part) return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      n = parseInt(part, 16);
    } else if (/^0[0-7]+$/.test(part)) {
      n = parseInt(part, 8);
    } else if (/^[0-9]+$/.test(part)) {
      n = parseInt(part, 10);
    } else {
      return null;
    }
    if (Number.isNaN(n) || n < 0) return null;
    nums.push(n);
  }
  if (nums.length === 4) {
    if (nums.some((n) => n > 255)) return null;
    return nums;
  }
  // 短格式：最后一段是剩余位数的整型（如 127.1 → 127.0.0.1）
  const last = nums[nums.length - 1];
  const restBits = (4 - (nums.length - 1)) * 8;
  if (last >= 2 ** restBits) return null;
  const head = nums.slice(0, -1);
  if (head.some((n) => n > 255)) return null;
  const value = head.reduce((acc, n) => acc * 256 + n, 0) * 2 ** restBits + last;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function ipv4Blocked(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function parseIpv6Groups(host: string): number[] | null {
  if (!/^[0-9a-f:]+$/i.test(host)) return null;
  if (!host.includes(':')) return null;
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const parseGroup = (s: string): number[] | null => {
    if (s === '') return [];
    const parts = s.split(':');
    const out: number[] = [];
    for (const p of parts) {
      if (!/^[0-9a-f]{1,4}$/i.test(p)) return null;
      out.push(parseInt(p, 16));
    }
    return out;
  };
  const left = parseGroup(halves[0]);
  const right = halves.length === 2 ? parseGroup(halves[1]) : [];
  if (!left || !right) return null;
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

function ipv6Blocked(groups: number[]): boolean {
  const [g0] = groups;
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return ipv4Blocked([(groups[6] >> 8) & 255, groups[6] & 255, (groups[7] >> 8) & 255, groups[7] & 255]);
  }
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10
  return false;
}

export function egressBlockReason(rawUrl: string): string | null {
  // 模板占位符归一（如 {{page}}），与 api-connector 校验器同一惯例
  const normalized = rawUrl.replace(/\{\{[^}]+\}\}/g, 'placeholder');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return PROTOCOL_REASON;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return PROTOCOL_REASON;
  }

  let host = url.hostname;
  if (!host) return PROTOCOL_REASON;
  // new URL 保留 IPv6 方括号；剥离并去掉 zone-id（%25eth0）
  if (host.startsWith('[')) {
    host = host.slice(1, host.indexOf(']'));
  }
  // 剥 FQDN 尾随点（WHATWG URL 对非 IP 主机不去点）：localhost. 不得绕过回环判定
  host = host.split('%25')[0].toLowerCase().replace(/\.$/, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return BLOCK_REASON;
  }

  const v4 = parseIpv4(host);
  if (v4) {
    return ipv4Blocked(v4) ? BLOCK_REASON : null;
  }

  if (host.includes(':')) {
    const v6 = parseIpv6Groups(host);
    if (v6 && ipv6Blocked(v6)) return BLOCK_REASON;
    return null;
  }

  return null;
}
