#!/usr/bin/env node
// Merges skill output (corpus/) into prototype/corpus.js: one ready-made example shortlist per persona.
// Usage: node scripts/build-feed.mjs [--hold <opportunity-id>]   (held-back item powers the offline paste-a-link demo)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? dflt : process.argv[i + 1]; };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const hold = arg('hold', 'basas-2027');

const oppDir = join(root, 'corpus', 'opportunities');
const BRIEF_FIELDS = ['priority', 'fit', 'why_go', 'watch_out', 'tagline', 'eligible', 'eligibility_notes',
  'visa', 'explore', 'explore_reason', 'confidence', 'cost_estimate', 'funding'];

const norm = (v, dflt) => {
  const s = String(v ?? '').toLowerCase();
  if (/infer|estimat|unverif|not verif|partial/.test(s)) return 'inferred';
  if (/verif|ground/.test(s)) return 'verified';
  return dflt;
};

const TODAY = new Date().toISOString().slice(0, 10);
const SUBMISSION = ['abstract', 'full_paper', 'scholarship'];

/** Same rule as the live API: status follows the dates, not the label an agent wrote. */
function deriveStatus(o) {
  if (o.status === 'stale') return o.status;
  const ahead = (d) => Boolean(d) && d >= TODAY;
  const subs = (o.deadlines ?? []).filter((d) => SUBMISSION.includes(d.label));
  if (subs.some((d) => ahead(d.date))) return 'open';
  if (!subs.length) return o.status; // no submission date listed: the dates can't settle it
  if (o.type !== 'fellowship' && (ahead(o.dates?.end ?? o.dates?.start) || (o.deadlines ?? []).some((d) => ahead(d.date)))) return 'attend-only';
  return 'watch';
}

function groundedCounts(opps) {
  let total = 0, pass = 0;
  for (const o of opps) {
    for (const item of [...(o.deadlines ?? []), ...(o.fees ?? []), ...(o.venue_funding ?? []), ...(o.standing_signals ?? [])]) {
      if (item.grounded || item.verify_note) total++;
      if (item.grounded) pass++;
    }
  }
  return { pass, total };
}

let heldBack = null;
const examples = [];
for (const f of readdirSync(join(root, 'corpus', 'profiles')).filter((f) => f.endsWith('.json'))) {
  const slug = f.replace(/\.json$/, '');
  const profile = readJson(join(root, 'corpus', 'profiles', f));
  const briefDir = join(root, 'corpus', 'briefs', profile.id);
  if (!existsSync(briefDir)) { console.log(`skip ${slug}: no briefs yet`); continue; }

  const opps = [];
  for (const bf of readdirSync(briefDir).filter((x) => x.endsWith('.json'))) {
    const oppPath = join(oppDir, bf);
    if (!existsSync(oppPath)) { console.log(`  ${slug}: brief ${bf} has no opportunity file`); continue; }
    const opp = readJson(oppPath);
    const brief = readJson(join(briefDir, bf));
    const noun = { conference: 'conference', journal_call: 'journal', fellowship: 'programme' }[opp.type] ?? 'event';
    const plain = (v) => JSON.parse(JSON.stringify(v).replace(/\b([Vv])enues\b/g, (m, v0) => (v0 === 'V' ? 'Events' : 'events'))
      .replace(/\b([Vv])enue\b/g, (m, v0) => (v0 === 'V' ? noun[0].toUpperCase() + noun.slice(1) : noun)));
    for (const k of ['priority', 'fit', 'why_go', 'watch_out', 'tagline', 'eligibility_notes', 'explore_reason']) if (brief[k] !== undefined) brief[k] = plain(brief[k]);
    const out = { ...opp, status: deriveStatus(opp), venue_funding: opp.funding ?? [] };
    if (out.status !== opp.status) console.log(`  ${slug}: ${opp.id} status ${opp.status} → ${out.status}`);
    for (const k of BRIEF_FIELDS) if (brief[k] !== undefined) out[k] = brief[k];
    out.funding ??= [];
    const c = out.confidence ?? {};
    out.confidence = { dates: norm(c.dates, 'inferred'), fees: norm(c.fees, 'inferred'), cost: 'range', visa: 'advisory', eligibility: norm(c.eligibility, 'inferred') };
    opps.push(out);
  }
  if (!opps.length) { console.log(`skip ${slug}: no complete briefs`); continue; }

  const candPath = [join(root, 'corpus', 'candidates', `${slug}.json`), join(root, 'corpus', 'candidates.json')]
    .find((p) => existsSync(p) && readJson(p).profile_id === profile.id) ?? join(root, 'corpus', 'candidates', `${slug}.json`);
  const cand = existsSync(candPath) ? readJson(candPath) : { candidates: [], budget_used: {} };

  let list = opps;
  if (slug === 'ananya') {
    heldBack = opps.find((o) => o.id === hold) ?? null;
    list = opps.filter((o) => o !== heldBack);
  }
  const g = groundedCounts(opps);
  examples.push({
    id: profile.id,
    gathered_at: String(cand.generated_at ?? new Date().toISOString()).slice(0, 10),
    profile,
    meta: {
      fields: profile.fields?.length ?? 0, adjacent: profile.adjacent_fields?.length ?? 0,
      searches: cand.budget_used?.searches ?? 0, candidates: cand.candidates?.length ?? 0,
      extracted: opps.length, funding: opps.reduce((n, o) => n + (o.funding?.length ?? 0), 0),
      grounded_pass: g.pass, grounded_total: g.total,
    },
    opportunities: list,
  });
  console.log(`${slug}: ${list.length} opportunities, grounded ${g.pass}/${g.total}`);
}

examples.sort((a, b) => (a.id === 'p_ananya' ? -1 : b.id === 'p_ananya' ? 1 : a.id.localeCompare(b.id)));
const fxPath = join(root, 'corpus', 'fx.json');
const FX = existsSync(fxPath) ? readJson(fxPath) : {};
const first = examples[0];

writeFileSync(join(root, 'prototype', 'corpus.js'), `// GENERATED by scripts/build-feed.mjs from corpus/ — do not edit by hand.
export const EXAMPLES = ${JSON.stringify(examples, null, 1)};
export const FX = ${JSON.stringify(FX)};
export const heldBack = ${JSON.stringify(heldBack)};
export const GATHERED_AT = ${JSON.stringify(first.gathered_at)};
export const profile = EXAMPLES[0].profile;
export const opportunities = EXAMPLES[0].opportunities;
export const meta = EXAMPLES[0].meta;
`);
console.log(`corpus.js: ${examples.length} example shortlists${heldBack ? `, held back ${heldBack.id}` : ''}`);
