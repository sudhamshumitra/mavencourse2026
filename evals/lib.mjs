// Shared helpers for the eval runner and checkers: loading golden cases, page snapshots, corpus data.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GOLDEN = join(ROOT, 'evals', 'golden');
export const PAGES = join(GOLDEN, 'pages');

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const loadCases = (suite) => readFileSync(join(GOLDEN, `${suite}.jsonl`), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
export const loadProfile = (slug) => readJson(join(ROOT, 'corpus', 'profiles', `${slug}.json`));
export const loadOpportunity = (id) => readJson(join(ROOT, 'corpus', 'opportunities', `${id}.json`));

/** A saved page snapshot in the shape fetchPage returns: {finalUrl, title, text}. */
export function loadPage(file) {
  const raw = readFileSync(join(PAGES, file), 'utf8');
  const header = {};
  const lines = raw.split('\n');
  let i = 0;
  for (; i < lines.length && lines[i].startsWith('#'); i++) {
    const [, k, v] = lines[i].match(/^#(\w+)\s*(.*)$/) ?? [];
    if (k) header[k] = v;
  }
  return { finalUrl: header.url, title: header.title ?? '', text: lines.slice(i).join('\n').trim(), saved: header.saved };
}

/** Page loader for the grounding worker: serves the snapshot whose #url matches, like a frozen web. */
export function snapshotFetcher() {
  const byUrl = new Map();
  for (const f of readdirSync(PAGES).filter((x) => x.endsWith('.txt'))) {
    const p = loadPage(f);
    if (p.finalUrl) byUrl.set(p.finalUrl.replace(/\/$/, ''), p);
  }
  return async (url) => {
    const page = byUrl.get(String(url).replace(/\/$/, ''));
    if (!page) throw new Error(`no snapshot for ${url}`);
    return page;
  };
}

/** Sets a value at a dotted path ("deadlines.0.date"); {append} adds to a string instead. */
export function applyPatch(obj, patches = []) {
  for (const p of patches) {
    const keys = p.path.split('.');
    let o = obj;
    for (const k of keys.slice(0, -1)) o = o[k];
    const last = keys.at(-1);
    o[last] = 'append' in p ? `${o[last] ?? ''}${p.append}` : p.value;
  }
  return obj;
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

export const anyKeyword = (text, words) => words.some((w) => String(text).toLowerCase().includes(w.toLowerCase()));

export function loadEnvLocal() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
