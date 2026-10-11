import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT, readJson } from '../lib.mjs';

// Integrity of the hand-built corpus that powers the example shortlists (prototype/corpus.js).
const oppDir = join(ROOT, 'corpus', 'opportunities');
const opps = readdirSync(oppDir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(oppDir, f)));
const byId = Object.fromEntries(opps.map((o) => [o.id, o]));
const briefs = readdirSync(join(ROOT, 'corpus', 'briefs')).flatMap((p) =>
  readdirSync(join(ROOT, 'corpus', 'briefs', p)).map((f) => ({ file: `${p}/${f}`, brief: readJson(join(ROOT, 'corpus', 'briefs', p, f)) })));

test('every opportunity matches opportunity.schema.json', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(readJson(join(ROOT, 'corpus', 'schema', 'opportunity.schema.json')));
  const bad = opps.filter((o) => !validate(o)).map((o) => `${o.id}: ${ajv.errorsText(validate.errors)}`);
  assert.deepEqual(bad, []);
});

test('every fact marked verified carries its quote', () => {
  const bad = opps.flatMap((o) => [...(o.deadlines ?? []), ...(o.fees ?? []), ...(o.funding ?? [])]
    .filter((x) => x.grounded && !String(x.source_quote ?? '').trim()).map(() => o.id));
  assert.deepEqual(bad, []);
});

test('every brief points at an opportunity and a profile that exist', () => {
  const missing = briefs.filter(({ file }) => !byId[file.split('/')[1].replace('.json', '')] || !existsSync(join(ROOT, 'corpus', 'profiles', `${file.split('/')[0].replace(/^p_/, '')}.json`)));
  assert.deepEqual(missing.map((b) => b.file), []);
});

test('brief shape: scores 0–100, at most 3 why-go and 2 watch-out', () => {
  const bad = briefs.filter(({ brief: b }) => !(b.priority.score >= 0 && b.priority.score <= 100) || (b.why_go?.length ?? 0) > 3 || (b.watch_out?.length ?? 0) > 2).map((b) => b.file);
  assert.deepEqual(bad, []);
});

test('journal calls have no network score', () => {
  const bad = briefs.filter(({ file, brief }) => byId[file.split('/')[1].replace('.json', '')]?.type === 'journal_call' && brief.priority.sub_scores.network?.score != null).map((b) => b.file);
  assert.deepEqual(bad, []);
});

test('predatory opportunities are capped at priority 30 (compose-brief rule)', () => {
  const bad = briefs.filter(({ file, brief }) => byId[file.split('/')[1].replace('.json', '')]?.predatory_flag && brief.priority.score > 30).map((b) => `${b.file} = ${b.brief.priority.score}`);
  assert.deepEqual(bad, []);
});

test('stale calls never rank as a strong pick (priority ≤ 50)', () => {
  const bad = briefs.filter(({ file, brief }) => byId[file.split('/')[1].replace('.json', '')]?.status === 'stale' && brief.priority.score > 50).map((b) => `${b.file} = ${b.brief.priority.score}`);
  assert.deepEqual(bad, []);
});
