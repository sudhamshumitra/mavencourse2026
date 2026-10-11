#!/usr/bin/env node
// Runs golden-set evals against the real pipeline code (live model calls — this costs money).
//
//   node evals/run.mjs <extract|brief|topics|scout|all> [more suites] [options]
//     --judge            also run the LLM judge (brief prose quality, scout relevance)
//     --repeat N         run brief cases marked "repeat" N times to measure score consistency
//     --only id,id       run only these case ids
//     --limit N          run only the first N cases per suite (smoke test)
//     --today YYYY-MM-DD freeze "today" (default: 2026-10-11, the date the page snapshots were saved)
//     --concurrency N    cases in flight at once (default 3)
//
// "all" = extract, brief, topics. Scout searches the live web (slower, results vary) so it only runs when named.
// Writes evals/results/<stamp>-<suites>/results.json and summary.md.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, loadCases, loadPage, loadProfile, loadOpportunity, snapshotFetcher, applyPatch, loadEnvLocal, readJson } from './lib.mjs';
import { CRITERIA } from './criteria.mjs';

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i === -1 ? dflt : argv[i + 1]; };
const has = (name) => argv.includes(`--${name}`);
const flagValues = new Set(['--repeat', '--only', '--limit', '--today', '--concurrency'].flatMap((f) => { const i = argv.indexOf(f); return i === -1 ? [] : [argv[i + 1]]; }));
let suites = argv.filter((a) => !a.startsWith('--') && !flagValues.has(a));
if (!suites.length) { console.error('Usage: node evals/run.mjs <extract|brief|topics|scout|all> [--judge] [--repeat N] [--only ids] [--limit N]'); process.exit(1); }
if (suites.includes('all')) suites = [...new Set([...suites.filter((s) => s !== 'all'), 'extract', 'brief', 'topics'])];
for (const s of suites) if (!CRITERIA[s]) { console.error(`Unknown suite "${s}"`); process.exit(1); }

const TODAY = flag('today', '2026-10-11');
const REPEAT = Number(flag('repeat', 1));
const ONLY = flag('only', null)?.split(',');
const LIMIT = Number(flag('limit', 0));
const CONCURRENCY = Number(flag('concurrency', 3));
const JUDGE = has('judge');

loadEnvLocal();
process.env.GV_TODAY = TODAY;
process.env.GV_SKIP_RATE_LIMIT = 'true';
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set (put it in .env.local).'); process.exit(1); }

// Imported after the environment is set: these modules read GV_* at import or call time.
const { extractFromPage } = await import('../api/_lib/extract.js');
const { runBrief } = await import('../api/_lib/check/orchestrate.js');
const { draftTopics } = await import('../api/_lib/topics.js');
const { scoutOpportunities } = await import('../api/_lib/scout.js');
const { costUsd } = await import('../api/_lib/trace.js');
const { checkExtract } = await import('./checks/extract.mjs');
const { checkBrief } = await import('./checks/brief.mjs');
const { checkTopics } = await import('./checks/topics.mjs');
const { checkScout } = await import('./checks/scout.mjs');
const { judgeBrief, judgeScout, DIMENSIONS } = await import('./judge/judge.mjs');

const errInfo = (err) => ({ status: err?.status ?? null, message: String(err?.message ?? err).slice(0, 300) });

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/* ---------- one runner per suite: returns {id, tags, rows, ms, usd, output} ---------- */

async function runExtract(c) {
  const page = loadPage(c.page);
  const t0 = Date.now();
  let res = {}, usd = 0;
  try {
    const r = await extractFromPage(page);
    res = { opportunity: r.opportunity };
    usd = costUsd(r.model, r.usage);
  } catch (err) { res = { error: errInfo(err) }; }
  return { rows: checkExtract(c, res, page), ms: Date.now() - t0, usd, output: res };
}

const fetchSnapshot = snapshotFetcher();

function briefInputs(c) {
  const profile = { ...loadProfile(c.profile), ...(c.profile_patch ?? {}) };
  if (c.profile_patch?.geography) profile.geography = c.profile_patch.geography;
  const opportunity = applyPatch(structuredClone(loadOpportunity(c.opportunity)), c.patch);
  return { profile, opportunity };
}

async function oneBrief(c) {
  const { profile, opportunity } = briefInputs(c);
  const t0 = Date.now();
  try {
    const { brief, metrics } = await runBrief({ opportunity, profile }, { deps: { fetchPage: fetchSnapshot, failWorker: c.fail_worker } });
    return { brief, metrics, ms: Date.now() - t0, usd: metrics.usd };
  } catch (err) { return { error: errInfo(err), ms: Date.now() - t0, usd: 0 }; }
}

async function runBriefCase(c) {
  const { profile, opportunity } = briefInputs(c);
  const first = await oneBrief(c);
  const rows = checkBrief(c, first, { opportunity });
  let usd = first.usd;
  const output = { brief: first.brief, metrics: first.metrics, error: first.error };

  if (c.repeat && REPEAT > 1 && first.brief) {
    const more = [];
    for (let i = 1; i < REPEAT; i++) more.push(await oneBrief(c));
    const scores = [first, ...more].map((r) => r.brief?.priority?.score).filter((s) => typeof s === 'number');
    usd += more.reduce((a, r) => a + r.usd, 0);
    const mean = scores.reduce((a, s) => a + s, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length);
    rows.push({ criterion: 'repeat_sd', pass: sd <= 8, detail: `scores ${scores.join(', ')} → SD ${sd.toFixed(1)}` });
    output.repeat_scores = scores;
  }
  if (JUDGE && first.brief) {
    try {
      const j = await judgeBrief({ profile, opportunity, brief: first.brief });
      usd += costUsd(j.model, j.usage);
      output.judge = { scores: j.scores, mean: j.mean, invented_facts: j.invented_facts, notes: j.notes };
      rows.push({ criterion: 'judge', pass: j.mean >= 4, detail: `${j.mean.toFixed(1)}/5 ${JSON.stringify(j.scores)} — ${j.notes}` });
      rows.push({ criterion: 'no_invented_facts', pass: !j.invented_facts.length, detail: j.invented_facts.join(' | ') || 'none' });
    } catch (err) { rows.push({ criterion: 'judge', pass: false, detail: `judge failed: ${errInfo(err).message}` }); }
  }
  return { rows, ms: first.ms, usd, output };
}

async function runTopics(c) {
  const text = c.text ?? loadProfile(c.profile).input_text;
  const t0 = Date.now();
  let res = {}, usd = 0;
  try {
    const r = await draftTopics(text);
    res = { result: r };
    usd = costUsd(r.model, r.usage);
  } catch (err) { res = { error: errInfo(err) }; }
  return { rows: checkTopics(c, res), ms: Date.now() - t0, usd, output: res.result ? { topics: res.result.topics, fields: res.result.fields, adjacent_fields: res.result.adjacent_fields, goals: res.result.goals } : res };
}

async function runScout(c) {
  const profile = loadProfile(c.profile);
  const t0 = Date.now();
  let res = {}, usd = 0;
  try {
    const r = await scoutOpportunities(profile);
    res = { result: r };
    usd = costUsd(r.model, r.usage);
  } catch (err) { res = { error: errInfo(err) }; }
  const ms = Date.now() - t0;
  const rows = await checkScout(c, res, { today: TODAY });
  const output = { candidates: res.result?.candidates, error: res.error };
  if (JUDGE && res.result?.candidates?.length) {
    try {
      const j = await judgeScout({ profile, candidates: res.result.candidates });
      usd += costUsd(j.model, j.usage);
      output.judge = j.ratings;
      rows.push({ criterion: 'relevance', pass: j.mean >= 4, detail: `${j.mean.toFixed(1)}/5 — ${j.ratings.map((r) => `${r.score} ${r.title}`).join(' | ')}` });
    } catch (err) { rows.push({ criterion: 'relevance', pass: false, detail: `judge failed: ${errInfo(err).message}` }); }
  }
  return { rows, ms, usd, output };
}

const RUNNERS = { extract: runExtract, brief: runBriefCase, topics: runTopics, scout: runScout };

/* ---------- aggregate ---------- */

function aggregate(suite, cases) {
  return CRITERIA[suite].map((cr) => {
    const rows = cases.flatMap((c) => c.rows.filter((r) => r.criterion === cr.id));
    const passed = rows.filter((r) => r.pass).length;
    const rate = rows.length ? passed / rows.length : null;
    return { ...cr, passed, total: rows.length, rate, met: rate == null || cr.target == null ? null : rate >= cr.target - 1e-9 };
  });
}

const pct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`);
const pctl = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

function humanAgreement(cases) {
  const p = join(ROOT, 'evals', 'human', 'labels.json');
  if (!existsSync(p)) return null;
  const labels = readJson(p).labels ?? {};
  let n = 0, exact = 0, within1 = 0;
  for (const c of cases) {
    const human = labels[c.id], judge = c.output?.judge?.scores;
    if (!human || !judge) continue;
    for (const d of DIMENSIONS) {
      if (typeof human[d] !== 'number') continue;
      n++; if (human[d] === judge[d]) exact++; if (Math.abs(human[d] - judge[d]) <= 1) within1++;
    }
  }
  return n ? { scores_compared: n, exact: exact / n, within_one: within1 / n } : null;
}

/* ---------- main ---------- */

const sha = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'nogit'; } })();
const dirty = (() => { try { return execSync('git status --porcelain', { cwd: ROOT }).toString().trim() ? '+changes' : ''; } catch { return ''; } })();
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const outDir = join(ROOT, 'evals', 'results', `${stamp}-${suites.join('+')}${ONLY ? `-${ONLY.length === 1 ? ONLY[0] : `${ONLY.length}cases`}` : ''}`);
const report = { run: { at: new Date().toISOString(), commit: sha + dirty, today: TODAY, suites, judge: JUDGE, repeat: REPEAT, models: { main: process.env.GV_MODEL || 'claude-sonnet-5', fast: process.env.GV_MODEL_FAST || 'claude-haiku-4-5' } }, suites: {} };

for (const suite of suites) {
  let cases = loadCases(suite);
  if (ONLY) cases = cases.filter((c) => ONLY.includes(c.id));
  if (LIMIT) cases = cases.slice(0, LIMIT);
  if (!cases.length) continue;
  console.log(`\n▶ ${suite}: ${cases.length} cases`);
  const results = await pool(cases, CONCURRENCY, async (c) => {
    const r = await RUNNERS[suite](c);
    const fails = r.rows.filter((x) => !x.pass).length;
    console.log(`  ${fails ? '✗' : '✓'} ${c.id.padEnd(28)} ${String(r.rows.length - fails).padStart(2)}/${r.rows.length} checks  ${(r.ms / 1000).toFixed(1)}s  $${r.usd.toFixed(3)}`);
    return { id: c.id, tags: c.tags ?? [], note: c.note ?? null, ...r };
  });
  const criteria = aggregate(suite, results);
  const usd = results.reduce((a, r) => a + r.usd, 0);
  const ms = results.map((r) => r.ms);
  report.suites[suite] = { criteria, usd, latency_ms: { p50: pctl(ms, 0.5), p95: pctl(ms, 0.95) }, cases: results, human_agreement: suite === 'brief' ? humanAgreement(results) : undefined };
}

/* ---------- write ---------- */

const total = Object.values(report.suites).reduce((a, s) => a + s.usd, 0);
let md = `# Eval run ${report.run.at.slice(0, 16).replace('T', ' ')}\n\nCommit \`${report.run.commit}\` · today frozen at ${TODAY} · models ${report.run.models.main} / ${report.run.models.fast}${JUDGE ? ' · judge on' : ''}${REPEAT > 1 ? ` · repeat ${REPEAT}` : ''} · **total cost $${total.toFixed(2)}**\n`;
for (const [suite, s] of Object.entries(report.suites)) {
  md += `\n## ${suite} — ${s.cases.length} cases, $${s.usd.toFixed(2)}, p50 ${(s.latency_ms.p50 / 1000).toFixed(1)}s / p95 ${(s.latency_ms.p95 / 1000).toFixed(1)}s\n\n| Criterion | Result | Target | |\n|---|---|---|---|\n`;
  for (const c of s.criteria) if (c.total) md += `| ${c.label} | ${c.passed}/${c.total} (${pct(c.rate)}) | ${c.target == null ? 'info' : pct(c.target)} | ${c.met == null ? '' : c.met ? '✓' : '✗'} |\n`;
  if (s.human_agreement) md += `\nJudge vs human labels: ${s.human_agreement.scores_compared} scores compared, ${pct(s.human_agreement.exact)} exact, ${pct(s.human_agreement.within_one)} within ±1.\n`;
  const fails = s.cases.flatMap((c) => c.rows.filter((r) => !r.pass && r.criterion !== 'quote_fidelity_strict').map((r) => ({ id: c.id, ...r })));
  if (fails.length) {
    md += `\n### Failures (${fails.length})\n\n| Case | Criterion | Detail |\n|---|---|---|\n`;
    for (const f of fails) md += `| ${f.id} | ${f.criterion} | ${String(f.detail).replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 240)} |\n`;
  }
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'results.json'), JSON.stringify(report, null, 2));
writeFileSync(join(outDir, 'summary.md'), md);
console.log(`\n${md}\nWrote ${outDir}`);
