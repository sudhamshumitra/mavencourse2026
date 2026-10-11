#!/usr/bin/env node
// Saves the text of each corpus opportunity's source page to evals/golden/pages/<id>.txt, using the
// app's own fetchPage (same SSRF guards, same HTML-to-text), so golden-set runs read exactly what
// the live app would have read — without depending on the site staying the same.
// No model calls, no cost. Usage: npm run eval:snapshot [-- <id> <id> ...] [--force]
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage, fetchViaReader } from '../api/_lib/fetchPage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const oppDir = join(root, 'corpus', 'opportunities');
const outDir = join(root, 'evals', 'golden', 'pages');
mkdirSync(outDir, { recursive: true });

const force = process.argv.includes('--force');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = wanted.length ? wanted : readdirSync(oppDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

for (const id of ids) {
  const out = join(outDir, `${id}.txt`);
  if (existsSync(out) && !force) { console.log(`skip  ${id} (already saved)`); continue; }
  const opp = JSON.parse(readFileSync(join(oppDir, `${id}.json`), 'utf8'));
  let page = null, via = 'direct';
  try { page = await fetchPage(opp.source_url); } catch (err) {
    page = await fetchViaReader(opp.source_url);
    via = 'reader';
    if (!page) { console.log(`FAIL  ${id}: ${err.message}`); continue; }
  }
  // First lines are a header the runner strips: where and when the snapshot came from.
  writeFileSync(out, `#url ${page.finalUrl}\n#title ${page.title.replace(/\s+/g, ' ').trim()}\n#saved ${new Date().toISOString().slice(0, 10)} via ${via}\n\n${page.text}\n`);
  console.log(`saved ${id} (${page.text.length} chars, ${via})`);
}
