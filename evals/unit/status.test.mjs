import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus } from '../../api/_lib/status.js';

const T = '2026-10-11';
const opp = (o) => ({ type: 'conference', status: 'open', dates: {}, deadlines: [], ...o });
const dl = (label, date) => ({ label, date });

test('open while any submission deadline is today or later', () => {
  assert.equal(deriveStatus(opp({ deadlines: [dl('abstract', '2026-10-11')] }), T), 'open');
  assert.equal(deriveStatus(opp({ deadlines: [dl('abstract', '2026-09-01'), dl('full_paper', '2027-01-15')] }), T), 'open');
  assert.equal(deriveStatus(opp({ deadlines: [dl('scholarship', '2026-12-01')], type: 'fellowship' }), T), 'open');
});

test('attend-only when submissions closed but the event or registration is ahead', () => {
  assert.equal(deriveStatus(opp({ deadlines: [dl('abstract', '2026-03-01')], dates: { start: '2026-10-28', end: '2026-10-31' } }), T), 'attend-only');
  assert.equal(deriveStatus(opp({ deadlines: [dl('abstract', '2026-03-01'), dl('registration', '2026-11-30')] }), T), 'attend-only');
});

test('watch when everything is past, and always for a closed fellowship', () => {
  assert.equal(deriveStatus(opp({ deadlines: [dl('abstract', '2026-03-01')], dates: { start: '2026-06-01' } }), T), 'watch');
  assert.equal(deriveStatus(opp({ type: 'fellowship', deadlines: [dl('scholarship', '2026-05-30')], dates: { start: '2026-12-01' } }), T), 'watch');
});

test('early-bird or registration dates alone never make a call "open"', () => {
  assert.equal(deriveStatus(opp({ status: 'watch', deadlines: [dl('early_bird', '2027-01-01')] }), T), 'watch');
});

test('stale is kept only while nothing on the page is dated this year or later', () => {
  assert.equal(deriveStatus(opp({ status: 'stale', deadlines: [dl('abstract', '2021-03-15')] }), T), 'stale');
  assert.equal(deriveStatus(opp({ status: 'stale', deadlines: [dl('abstract', '2027-01-15')] }), T), 'open'); // eval finding: devstud marked stale despite 2027 dates
  assert.equal(deriveStatus(opp({ status: 'watch' }), T), 'watch');
});

test('a deadline that only applies after acceptance does not make a call open', () => {
  // eval finding: a journal call whose proposals closed looked open because of its "first drafts" date
  const o = opp({ type: 'journal_call', deadlines: [dl('abstract', '2026-09-20'), { label: 'full_paper', date: '2026-12-15', depends_on: 'abstract' }] });
  assert.equal(deriveStatus(o, T), 'watch');
});

test('no submission date: a conference is never "open" on the model\'s word alone', () => {
  // eval finding: AoIR came back "open" three days before the event with only an early-bird date listed
  const event = { start: '2026-10-14', end: '2026-10-17' };
  assert.equal(deriveStatus(opp({ status: 'open', dates: event, deadlines: [dl('early_bird', '2026-08-01')] }), T), 'attend-only');
  assert.equal(deriveStatus(opp({ status: 'watch', dates: { start: '2027-07-18' } }), T), 'watch'); // next call not out yet
  assert.equal(deriveStatus(opp({ status: 'open', dates: { start: '2026-06-01' } }), T), 'watch');
  assert.equal(deriveStatus(opp({ type: 'journal_call', status: 'open' }), T), 'open'); // rolling journal call: dates can't settle it
});

test("the extract skill's age rule is applied in code (eval finding: a 2021 call came back open)", () => {
  const old = { type: 'journal_call', status: 'open', freshness: { posted: '2021-06-27', last_signal_year: 2024, stale: false } };
  assert.equal(deriveStatus(opp(old), T), 'stale');
  assert.equal(deriveStatus(opp({ ...old, freshness: { posted: '2021-06-27', last_signal_year: 2027 } }), T), 'open');
});

test('only conferences can be attend-only', () => {
  assert.equal(deriveStatus(opp({ type: 'journal_call', deadlines: [dl('abstract', '2026-09-20'), dl('registration', '2026-12-01')] }), T), 'watch');
});

test('the live API and the feed build use the same rule (one shared module)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../scripts/build-feed.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{ deriveStatus \} from '..\/api\/_lib\/status.js'/);
  assert.doesNotMatch(src, /function deriveStatus/);
});
