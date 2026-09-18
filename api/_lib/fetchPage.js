// Server-side fetch of a user-supplied URL, with the SSRF guards from PRD §8:
// scheme + port allowlist, private/loopback/link-local/metadata ranges blocked and
// re-checked on every redirect hop, redirect cap, timeout, response-size cap.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { UserFacingError } from './claude.js';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 150000;

function ipv4Blocked(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0);
}

function ipBlocked(ip) {
  if (net.isIPv4(ip)) return ipv4Blocked(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]);
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6)
    || v6.startsWith('64:ff9b:') || v6.startsWith('2001:db8') || v6.startsWith('::ffff:');
}

async function assertPublic(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new UserFacingError(400, 'Only http and https links are allowed.');
  if (url.username || url.password) throw new UserFacingError(400, 'Links with embedded credentials are not allowed.');
  if (url.port && !['80', '443'].includes(url.port)) throw new UserFacingError(400, 'Only standard web ports are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    throw new UserFacingError(400, 'That address is not allowed.');
  }
  let addrs;
  try { addrs = await lookup(host, { all: true, verbatim: true }); } catch { throw new UserFacingError(400, 'That website could not be found.'); }
  if (!addrs.length || addrs.some((a) => ipBlocked(a.address))) throw new UserFacingError(400, 'That address is not allowed.');
}

export async function fetchPage(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl).trim()); } catch { throw new UserFacingError(400, 'That is not a valid link.'); }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'user-agent': 'GrapevineBot/0.1 (academic opportunity finder; prototype)', accept: 'text/html,application/xhtml+xml,text/plain' },
      });
    } catch {
      clearTimeout(timer);
      throw new UserFacingError(502, 'Could not reach that page.');
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) { clearTimeout(timer); throw new UserFacingError(502, `The page returned an error (${res.status}).`); }

    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      clearTimeout(timer);
      throw new UserFacingError(415, type.includes('pdf') ? 'PDF calls are not supported yet. Paste the web page instead.' : 'That link is not a web page.');
    }

    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { ctrl.abort(); throw new UserFacingError(413, 'That page is too large.'); }
        chunks.push(value);
      }
    } finally { clearTimeout(timer); }

    const html = Buffer.concat(chunks).toString('utf8');
    const text = /html/i.test(type) ? htmlToText(html) : html;
    if (text.length < 200) throw new UserFacingError(422, 'That page has almost no readable text (it may need JavaScript to load).');
    if (text.length > MAX_TEXT_CHARS) throw new UserFacingError(413, 'That page has too much text to read in one go.');
    return { finalUrl: url.toString(), title: htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''), text };
  }
  throw new UserFacingError(400, 'Too many redirects.');
}

/**
 * Second attempt for sites that block cloud servers: a public reader service returns the page as text.
 * Only called after fetchPage's public-address check passed for the same URL.
 */
export async function fetchViaReader(rawUrl) {
  const url = new URL(String(rawUrl).trim());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`https://r.jina.ai/${url.toString()}`, { signal: ctrl.signal, headers: { accept: 'text/plain', 'x-return-format': 'text' } });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, MAX_TEXT_CHARS);
    if (text.length < 200 || /Target URL returned error 40[13]/i.test(text.slice(0, 600))) return null;
    const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? '';
    return { finalUrl: url.toString(), title, text, via: 'reader' };
  } catch {
    return null;
  } finally { clearTimeout(timer); }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };

export function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div|\/section|\/article|\/dt|\/dd)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/^•?\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
