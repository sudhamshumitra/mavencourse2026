import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize as sanitizeExtract, withDerivedStatus, normType, normLabel } from '../../api/_lib/extract.js';
import { sanitize as sanitizeCost, fxToHome } from '../../api/_lib/check/cost.js';
import { sanitize as sanitizeScout } from '../../api/_lib/scout.js';
import { sanitize as sanitizeTopics } from '../../api/_lib/topics.js';
import { sanitizeCompose } from '../../api/_lib/check/compose.js';
import { plainWords } from '../../api/_lib/check/shared.js';

test('extract: drops non-ISO dates and fees without a number', () => {
  const o = sanitizeExtract({ title: 'X', deadlines: [{ label: 'abstract', date: '15 March 2027', grounded: true, source_quote: 'q' }, { label: 'abstract', date: '2027-03-15' }], fees: [{ amount: 'TBA' }, { amount: '120', currency: 'eur' }] }, 'https://x.org');
  assert.deepEqual(o.deadlines.map((d) => d.date), ['2027-03-15']);
  assert.equal(o.fees.length, 1);
  assert.equal(o.fees[0].amount, 120);
  assert.equal(o.fees[0].currency, 'EUR');
});

test('extract: a fact without a quote can never be marked verified', () => {
  const o = sanitizeExtract({ title: 'X', deadlines: [{ label: 'abstract', date: '2027-01-01', grounded: true, source_quote: '' }], fees: [{ amount: 50, grounded: true }], funding: [{ name: 'Grant', grounded: true }] }, 'https://x.org');
  assert.equal(o.deadlines[0].grounded, false);
  assert.equal(o.fees[0].grounded, false);
  assert.equal(o.funding[0].grounded, false);
});

test('extract: unknown enums fall back to safe values; steps nobody acts on are dropped', () => {
  const o = sanitizeExtract({ title: 'X', type: 'webinar', status: 'amazing', location: { format: 'metaverse' }, deadlines: [{ label: 'whenever', date: '2027-01-01' }, { label: 'acceptance_notification', date: '2027-02-01' }] }, 'https://x.org');
  assert.equal(o.type, 'conference');
  assert.equal(o.location.format, 'in_person');
  assert.equal(o.deadlines.length, 0); // eval finding: these used to become "abstract" deadlines and made closed calls look open
});

test("extract: the model's own words map to the schema (eval finding: journals came back as conferences)", () => {
  assert.equal(normType('journal_special_issue'), 'journal_call');
  assert.equal(normType('summer_school'), 'fellowship');
  assert.equal(normType('symposium'), 'conference');
  assert.deepEqual(['proposal', 'symposium', 'registration_early', 'presenter_registration', 'first_draft', 'travel_grant', 'editorial_feedback'].map(normLabel),
    ['abstract', 'abstract', 'early_bird', 'registration', 'full_paper', 'scholarship', null]);
  const o = sanitizeExtract({ title: 'X', funding: [{ label: 'Registration fee waiver', eligibility: 'students' }] }, 'https://x.org');
  assert.equal(o.funding[0].name, 'Registration fee waiver');
  assert.equal(o.funding[0].eligibility_notes, 'students');
});

test('extract: status is recomputed from dates, overriding the model', () => {
  const o = withDerivedStatus(sanitizeExtract({ title: 'X', status: 'open', deadlines: [{ label: 'abstract', date: '2021-03-15' }], dates: { start: '2021-06-10' } }, 'https://x.org'));
  assert.equal(o.status, 'watch');
});

test('scout: past deadline turns open into watch; duplicates and junk dropped; at most 8', () => {
  const base = { title: 'T', type: 'conference', status: 'open' };
  const list = sanitizeScout([
    { ...base, url: 'https://a.org/cfp', deadline_hint: '2026-01-01' },
    { ...base, url: 'https://a.org/cfp/', deadline_hint: '2027-01-01' },
    { ...base, url: 'javascript:alert(1)' },
    { url: 'https://no-title.org' },
    ...Array.from({ length: 10 }, (_, i) => ({ ...base, url: `https://x${i}.org` })),
  ]);
  assert.equal(list.length, 8);
  assert.equal(list[0].status, 'watch');
  assert.equal(list[0].deadline_hint, null);
  assert.ok(list.every((c) => c.url.startsWith('https://')));
  assert.equal(new Set(list.map((c) => c.url.replace(/\/$/, ''))).size, 8);
});

test('scout: quick scores clamped, links unverified by default, "venue" reworded', () => {
  const [c] = sanitizeScout([{ url: 'https://a.org', title: 'T', quick: { fit: 140, standing: -5, network: null }, tagline: 'A great venue' }]);
  assert.deepEqual([c.quick.fit, c.quick.standing, c.quick.network], [100, 0, null]);
  assert.equal(c.link_unverified, true);
  assert.equal(c.tagline, 'A great event');
});

test('topics: goals only from the allowed list, weights clamped, max 8 topics', () => {
  const r = sanitizeTopics({ topics: Array.from({ length: 12 }, (_, i) => ({ term: `t${i}`, weight: i === 0 ? 7 : 0.01 })), goals: ['networking', 'world_domination'] });
  assert.equal(r.topics.length, 8);
  assert.equal(r.topics[0].weight, 1);
  assert.equal(r.topics[1].weight, 0.3);
  assert.deepEqual(r.goals, ['networking']);
});

test('compose: journal calls never get a network score; scores clamped; bullet caps', () => {
  const b = sanitizeCompose({
    priority: { score: 130, sub_scores: { fit: { score: 90 }, network: { score: 80 }, feasibility: { score: -4 } } },
    why_go: ['a', 'b', 'c', 'd'], watch_out: ['x', 'y', 'z'], eligible: 'maybe', visa: { required: 'perhaps', lead_days: 9999 },
  }, { type: 'journal_call' });
  assert.equal(b.priority.score, 100);
  assert.equal(b.priority.sub_scores.network, null);
  assert.equal(b.priority.sub_scores.feasibility.score, 0);
  assert.equal(b.why_go.length, 3);
  assert.equal(b.watch_out.length, 2);
  assert.equal(b.eligible, 'conditional');
  assert.equal(b.visa.required, 'conditional');
  assert.equal(b.visa.lead_days, null);
  assert.equal(b.visa.verify_flag, true);
});

test('plain words: "venue" never reaches the reader, but codes and quotes are untouched', () => {
  const b = plainWords({ t: 'The venue offers grants; venues vary.', funding: [{ source: 'venue', source_quote: 'venue grants' }] }, 'journal_call');
  assert.equal(b.t, 'The journal offers grants; events vary.');
  assert.equal(b.funding[0].source, 'venue'); // unit-test finding: this code used to become "journal"
  assert.equal(b.funding[0].source_quote, 'venue grants');
});

test('cost: totals and over_budget come from the lines, not the model (eval finding: 5 briefs said "within budget" when over)', () => {
  const c = sanitizeCost({ currency: 'KES', low: 1, high: 2, over_budget: false, breakdown: { registration: { low: 30000, high: 30000 }, travel: { low: 150000, high: 220000 }, accommodation: { low: 20000, high: 40000 } } }, { currency: 'KES', constraints: { max_cost: 250000 } });
  assert.equal(c.low, 200000);
  assert.equal(c.high, 290000);
  assert.equal(c.over_budget, true);
});

test('cost: exchange rates are given in the home currency (eval finding: invented conversion chains)', () => {
  const kes = fxToHome('KES');
  assert.ok(kes.USD > 50 && kes.USD < 300, `1 USD = ${kes.USD} KES`);
  assert.ok(kes.INR > 0.5 && kes.INR < 3);
  assert.equal(fxToHome('XXX'), null);
});

test('compose: predatory capped at 30, stale at 40 with a warning, whatever the model says', () => {
  const pred = sanitizeCompose({ priority: { score: 80 } }, { type: 'conference', predatory_flag: true });
  assert.equal(pred.priority.score, 30);
  const stale = sanitizeCompose({ priority: { score: 77 }, watch_out: ['Fit is narrow.'] }, { type: 'journal_call', status: 'stale', freshness: { last_signal_year: 2024 } });
  assert.equal(stale.priority.score, 40);
  assert.match(stale.watch_out[0], /out of date.*2024/);
});
