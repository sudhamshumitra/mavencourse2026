import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrief } from '../../api/_lib/check/orchestrate.js';
import { UserFacingError } from '../../api/_lib/claude.js';

// Stub workers: no model calls. Each returns the shape its real counterpart returns.
const usage = { input_tokens: 0, output_tokens: 0 };
const opportunity = {
  type: 'conference', title: 'Test Conf', source_url: 'https://example.org/cfp',
  deadlines: [{ label: 'abstract', date: '2027-01-15', grounded: true, source_quote: 'Abstracts due 15 January 2027' }],
  fees: [{ tier: 'Student', amount: 100, currency: 'USD', grounded: true, source_quote: 'Student: $100' }],
  funding: [{ name: 'Travel bursary', grounded: true, source_quote: 'bursaries available', source_url: 'https://example.org/cfp' }],
};
const profile = { name: 'T', geography: { country: 'India', city: 'Hyderabad', passport: 'India' }, currency: 'INR', constraints: { max_cost: 150000 } };
const compose = async () => ({ compose: { priority: { score: 70, sub_scores: {} }, why_go: ['venue is great'], watch_out: [], eligible: 'yes', visa: null, confidence: {} }, usage });
const ok = {
  cost: async () => ({ cost_estimate: { currency: 'INR', low: 10, high: 20, breakdown: { registration: { low: 10, high: 10, grounded: true, note: 'fee' } }, assumptions: [], over_budget: false }, usage }),
  funding: async () => ({ funding: [{ name: 'Travel bursary', source: 'venue' }], usage }),
  grounding: async (opp) => ({ opportunity: structuredClone(opp), grounding: { checked: 3, passed: 3, fail_missing: 0, fail_mismatch: 0, unreachable: false, note: '' }, usage }),
  compose,
};
const boom = async () => { throw new Error('worker exploded'); };

test('all workers succeed: brief has every part and plain words', async () => {
  const { brief, metrics } = await runBrief({ opportunity, profile }, { deps: { workers: ok } });
  assert.equal(brief.priority.score, 70);
  assert.equal(brief.cost_estimate.currency, 'INR');
  assert.equal(brief.why_go[0], 'conference is great');
  assert.deepEqual(Object.keys(metrics.workers).sort(), ['compose', 'cost', 'funding', 'grounding']);
});

test('cost fails: brief still finishes, cost flagged as fallback, fee kept from the page', async () => {
  const { brief } = await runBrief({ opportunity, profile }, { deps: { workers: { ...ok, cost: boom } } });
  assert.equal(brief.workers.cost.fallback, true);
  assert.equal(brief.cost_estimate.breakdown.registration.low, 100);
  assert.match(brief.cost_estimate.assumptions[0], /did not finish/);
});

test('funding fails and its model fallback fails too: venue-listed funding still shown', async () => {
  const { brief } = await runBrief({ opportunity, profile }, { deps: { workers: { ...ok, funding: boom } } });
  assert.equal(brief.workers.funding.fallback, true);
  assert.equal(brief.funding[0].name, 'Travel bursary');
  assert.equal(brief.funding[0].source, 'venue');
});

test('grounding times out: facts left as extracted, never silently downgraded', async () => {
  const slow = () => new Promise((r) => setTimeout(r, 500));
  const { brief } = await runBrief({ opportunity, profile }, { deps: { workers: { ...ok, grounding: slow }, timeouts: { grounding: 20 } } });
  assert.equal(brief.workers.grounding.checked, 0);
  assert.equal(brief.deadlines[0].grounded, true);
});

test('GV_FAIL_WORKER-style forced failure is honoured per worker', async () => {
  const { brief } = await runBrief({ opportunity, profile }, { deps: { workers: ok, failWorker: 'cost' } });
  assert.equal(brief.workers.cost.fallback, true);
  assert.equal(brief.workers.funding.fallback, false);
});

test('compose fails: the whole brief fails with a retryable 502, no half-written verdict', async () => {
  await assert.rejects(runBrief({ opportunity, profile }, { deps: { workers: { ...ok, compose: boom } } }), (err) => err instanceof UserFacingError && err.status === 502);
});

test('a fee that fails re-checking carries through to the cost line', async () => {
  const grounding = async (opp) => {
    const o = structuredClone(opp);
    o.fees[0].grounded = false;
    return { opportunity: o, grounding: { checked: 3, passed: 2, fail_missing: 0, fail_mismatch: 1, unreachable: false, note: '' }, usage };
  };
  const { brief } = await runBrief({ opportunity, profile }, { deps: { workers: { ...ok, grounding } } });
  assert.equal(brief.fees[0].grounded, false);
  assert.equal(brief.cost_estimate.breakdown.registration.grounded, false);
  assert.match(brief.cost_estimate.breakdown.registration.note, /no longer matches/);
});
