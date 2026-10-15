import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoutOpportunities, checkLink, picksToCandidates, LANES } from '../../api/_lib/scout.js';
import { UserFacingError } from '../../api/_lib/claude.js';

// Stub lanes, merge and page loader: no model calls, no network.
const usage = { input_tokens: 0, output_tokens: 0 };
const profile = { topics: [{ term: 'labour', weight: 1 }], geography: { country: 'India' } };
const lead = (lane, n) => ({ lane, url: `https://${lane}.org/${n}`, title: `${lane} ${n}`, host: lane, type: 'conference', date_text: '', why: 'fits', trace: 'search' });
const okLane = async (l) => ({ leads: [lead(l.key, 1), lead(l.key, 2)], usage });
const pickAll = async (_input, leads) => ({ picks: leads.slice(0, 8).map((_, i) => ({ lead: i, status: 'open', quick: { fit: 70 } })), usage });
const livePage = async () => ({ title: 'Call', text: 'Abstracts due March 2027' });
const run = (deps, onEvent) => scoutOpportunities(profile, { onEvent, deps: { lane: okLane, merge: pickAll, loadPage: livePage, ...deps } });

test('scout: all four lanes run, picks are checked, live links are marked verified', async () => {
  const events = [];
  const { candidates, metrics } = await run({}, (e) => events.push(e));
  assert.equal(candidates.length, 8);
  assert.ok(candidates.every((c) => c.link_check === 'live' && c.link_unverified === false));
  assert.deepEqual(Object.keys(metrics.lanes).sort(), LANES.map((l) => l.key).sort());
  assert.equal(events.filter((e) => e.type === 'lane_done').length, 4);
  assert.ok(events.some((e) => e.type === 'phase' && e.phase === 'picking'));
  assert.equal(events.filter((e) => e.type === 'link').length, 8);
});

test('scout: one lane fails, the search still finishes from the other three', async () => {
  const lane = async (l) => { if (l.key === 'lists') throw new Error('lane exploded'); return okLane(l); };
  const { candidates, metrics } = await run({ lane });
  assert.equal(metrics.lanes.lists.ok, false);
  assert.ok(candidates.length > 0 && candidates.every((c) => !c.url.includes('lists.org')));
});

test('scout: a slow lane is cut off at its deadline instead of holding up the search', async () => {
  const lane = async (l) => (l.key === 'editions' ? new Promise(() => {}) : okLane(l));
  const t0 = Date.now();
  const { metrics } = await run({ lane, timeouts: { lane: 50 } });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(metrics.lanes.editions.ok, false);
});

test('scout: every lane fails → a plain error, not an empty shortlist', async () => {
  await assert.rejects(run({ lane: async () => { throw new Error('down'); } }), (e) => e instanceof UserFacingError && e.status === 502);
});

test('scout: merge fails twice → lane-order fallback, unscored rather than invented scores', async () => {
  const { candidates, metrics } = await run({ merge: async () => { throw new Error('merge down'); } });
  assert.equal(metrics.merge.fallback, 'lane_order');
  assert.ok(candidates.length > 0 && candidates.every((c) => c.quick === null));
});

test('scout: dead links are dropped, blocked and undated ones kept but marked unverified', async () => {
  const loadPage = async (url) => {
    if (url.endsWith('/1') && url.includes('societies')) throw new UserFacingError(502, 'The page returned an error (404).');
    if (url.includes('editions')) throw new UserFacingError(502, 'The page returned an error (403).');
    if (url.includes('lists')) return { title: 'Old call', text: 'Deadline 2019' };
    return livePage();
  };
  const { candidates } = await run({ loadPage });
  assert.ok(!candidates.some((c) => c.url === 'https://societies.org/1'));
  assert.ok(candidates.filter((c) => c.url.includes('editions')).every((c) => c.link_check === 'blocked' && c.link_unverified));
  assert.ok(candidates.filter((c) => c.url.includes('lists')).every((c) => c.link_check === 'no_date' && c.link_unverified));
});

test('scout: picks can only point at real leads — URL, title and host always come from the lead', () => {
  const leads = [lead('societies', 1)];
  const out = picksToCandidates([{ lead: 0, url: 'https://evil.example', title: 'Made up' }, { lead: 7 }, { lead: '0' }], leads);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://societies.org/1');
  assert.equal(out[0].title, 'societies 1');
});

test('checkLink: a page that never answers is "blocked", not dead', async () => {
  assert.equal(await checkLink('https://x.org', { load: () => new Promise(() => {}), ms: 30 }), 'blocked');
  assert.equal(await checkLink('https://x.org', { load: async () => { throw new UserFacingError(400, 'That website could not be found.'); } }), 'dead');
});

test('scout: format and visa guesses are kept only when they are a known value', async () => {
  const merge = async (_input, leads) => ({ picks: [
    { lead: 0, format: 'online', visa_needed: 'no' }, { lead: 1, format: 'in_person', visa_needed: 'yes' }, { lead: 2, format: 'unsure', visa_needed: 'maybe' },
  ], usage });
  const { candidates } = await run({ merge });
  assert.deepEqual(candidates.map((c) => [c.format, c.visa_needed]), [['online', 'no'], ['in_person', 'yes'], [null, null]]);
});
