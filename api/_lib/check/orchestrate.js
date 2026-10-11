// Orchestrator for the live "Full check". Runs three workers in parallel — cost,
// funding, grounding — then hands their combined result to a fourth, compose, which
// writes the verdict. See MULTIAGENT.md for why this shape and how each part fails.
// api/brief.js is the thin streaming HTTP route around runBrief; evals/ calls it directly.
import { UserFacingError, withTimeout, MODEL, MODEL_FAST, today } from '../claude.js';
import { deriveStatus } from '../status.js';
import { FUNDERS } from '../prompts.js';
import { fetchPage } from '../fetchPage.js';
import { costUsd } from '../trace.js';
import { profileSlice, plainWords } from './shared.js';
import { runCost, fallbackCost } from './cost.js';
import { runFunding, fallbackFunding } from './funding.js';
import { runGrounding, fallbackGrounding } from './grounding.js';
import { runCompose } from './compose.js';

export const TIMEOUTS = { cost: 60000, funding: 120000, grounding: 60000, compose: 90000 };
const MODELS = { cost: MODEL_FAST, funding: MODEL, grounding: MODEL_FAST, compose: MODEL };
const FALLBACK_MODELS = { cost: MODEL_FAST, funding: MODEL_FAST, grounding: MODEL_FAST };

/** Runs one worker under its own deadline; on failure or a forced failure test, falls back instead of failing the whole brief. */
async function runWorker(name, { fn, fallback, emit, failWorker, timeouts }) {
  emit({ type: 'worker_start', worker: name });
  const t0 = Date.now();
  try {
    if (failWorker === name) throw new Error('forced failure (GV_FAIL_WORKER)');
    const result = await withTimeout((signal) => fn(signal), timeouts[name]);
    emit({ type: 'worker_done', worker: name, ok: true });
    return { ok: true, fallback: false, ms: Date.now() - t0, usd: costUsd(MODELS[name], result.usage), ...result };
  } catch (err) {
    console.error(`[brief] ${name} worker failed, using fallback:`, err?.message ?? err);
    const result = await fallback(err);
    emit({ type: 'worker_done', worker: name, ok: false, fallback: true });
    return { ok: false, fallback: true, ms: Date.now() - t0, error: String(err?.message ?? err).slice(0, 120), usd: costUsd(FALLBACK_MODELS[name], result.usage), ...result };
  }
}

function sumUsage(...parts) {
  return parts.reduce((a, p) => ({ input: a.input + (p?.usage?.input_tokens ?? 0), output: a.output + (p?.usage?.output_tokens ?? 0) }), { input: 0, output: 0 });
}

/**
 * Builds one brief. `deps` exists for tests and evals only:
 *  - failWorker: force one worker to fail (same as the GV_FAIL_WORKER env var)
 *  - fetchPage: page loader for the grounding re-check (a saved snapshot instead of the live web)
 *  - workers: replace run functions ({cost, funding, grounding, compose}) with stubs
 *  - timeouts: override per-worker deadlines
 * Returns { brief, usage, metrics } — metrics is the per-worker timing/cost/fallback record traced in production.
 */
export async function runBrief({ opportunity: input, profile: rawProfile }, { emit = () => {}, deps = {} } = {}) {
  // Status is re-derived from today's date: the opportunity may have been extracted days ago.
  const opp = { ...input, status: deriveStatus(input, today()) };
  const profile = profileSlice(rawProfile);
  const country = String(profile.geography?.country ?? '').trim();
  const registry = FUNDERS[country] ?? { note: `No funder registry for ${country || 'this country'} yet. List only the event's own funding and a generic "ask your university's research office" item.` };
  const failWorker = deps.failWorker ?? process.env.GV_FAIL_WORKER;
  const timeouts = { ...TIMEOUTS, ...deps.timeouts };
  const w = { cost: runCost, funding: runFunding, grounding: runGrounding, compose: runCompose, ...deps.workers };
  const loadPage = deps.fetchPage ?? fetchPage;
  const opts = { emit, failWorker, timeouts };

  emit({ type: 'start', workers: ['cost', 'funding', 'grounding'] });

  // Step 1: cost, funding and grounding run in parallel — none of them needs the others' output.
  const [costR, fundingR, groundingR] = await Promise.all([
    runWorker('cost', { fn: (signal) => w.cost({ opportunity: opp, profile }, { signal }), fallback: () => fallbackCost({ opportunity: opp, profile }), ...opts }),
    runWorker('funding', { fn: (signal) => w.funding({ opportunity: opp, profile, registry }, { signal }), fallback: () => fallbackFunding({ opportunity: opp, profile, registry }), ...opts }),
    runWorker('grounding', { fn: (signal) => w.grounding(opp, { signal, fetch: loadPage }), fallback: () => fallbackGrounding(opp), ...opts }),
  ]);

  // Step 2: merge. A fact grounding downgraded carries through to the cost line that relied on it.
  const groundedOpp = groundingR.opportunity ?? opp;
  const costEstimate = costR.cost_estimate;
  if (costEstimate?.breakdown?.registration?.grounded && groundingR.grounding?.fail_mismatch) {
    const feeStillGrounded = (groundedOpp.fees ?? []).some((f) => f.grounded);
    if (!feeStillGrounded) {
      costEstimate.breakdown.registration.grounded = false;
      costEstimate.breakdown.registration.note = `${costEstimate.breakdown.registration.note ?? ''} (re-check: the fee quote no longer matches the page.)`.trim();
    }
  }

  const workerStatus = {
    cost: { ok: costR.ok, fallback: costR.fallback },
    funding: { ok: fundingR.ok, fallback: fundingR.fallback, note: fundingR.note ?? null },
    grounding: groundingR.grounding,
  };

  // Step 3: sequential handoff. Compose only runs once it has real cost and funding numbers to reason about.
  // Compose has no fallback — it's the one step that must succeed, so its failure fails the whole check (retry UI, as before).
  emit({ type: 'worker_start', worker: 'compose' });
  const t0 = Date.now();
  let composeR;
  try {
    if (failWorker === 'compose') throw new Error('forced failure (GV_FAIL_WORKER)');
    composeR = await withTimeout((signal) => w.compose({ opportunity: groundedOpp, profile, cost_estimate: costEstimate, funding: fundingR.funding, worker_notes: workerStatus }, { signal }), timeouts.compose);
  } catch (err) {
    if (!(err instanceof UserFacingError)) console.error('[brief] compose worker failed:', err);
    throw new UserFacingError(502, 'Could not finish composing this brief. Try again.');
  }
  emit({ type: 'worker_done', worker: 'compose', ok: true });

  // deadlines/fees come back too: grounding may have downgraded one, and the client's stored
  // opportunity (from the earlier /api/extract call) still has the original, pre-check values.
  const merged = plainWords({ ...composeR.compose, funding: fundingR.funding, cost_estimate: costEstimate, deadlines: groundedOpp.deadlines, fees: groundedOpp.fees }, opp.type);
  const usage = sumUsage(costR, fundingR, groundingR, composeR);

  const pick = (r) => ({ ok: r.ok, fallback: r.fallback, ms: r.ms, usd: r.usd, ...(r.error ? { error: r.error } : {}) });
  const metrics = {
    workers: {
      cost: pick(costR), funding: pick(fundingR), grounding: pick(groundingR),
      compose: { ok: true, fallback: false, ms: Date.now() - t0, usd: costUsd(MODELS.compose, composeR.usage) },
    },
    grounding: groundingR.grounding,
    usd: costR.usd + fundingR.usd + groundingR.usd + costUsd(MODELS.compose, composeR.usage),
    searches: fundingR.usage?.web_search_requests ?? 0,
  };
  return { brief: { ...merged, workers: workerStatus }, usage, metrics };
}
