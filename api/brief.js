// Orchestrator for the live "Full check". Runs three workers in parallel — cost,
// funding, grounding — then hands their combined result to a fourth, compose, which
// writes the verdict. See MULTIAGENT.md for why this shape and how each part fails.
import { guard, sendError, UserFacingError, withTimeout } from './_lib/claude.js';
import { FUNDERS } from './_lib/prompts.js';
import { profileSlice, plainWords } from './_lib/check/shared.js';
import { runCost, fallbackCost } from './_lib/check/cost.js';
import { runFunding, fallbackFunding } from './_lib/check/funding.js';
import { runGrounding, fallbackGrounding } from './_lib/check/grounding.js';
import { runCompose } from './_lib/check/compose.js';

const TIMEOUTS = { cost: 60000, funding: 120000, grounding: 60000, compose: 90000 };

/** Runs one worker under its own deadline; on failure or a forced GV_FAIL_WORKER test, falls back instead of failing the whole brief. */
async function runWorker(name, { fn, fallback, emit }) {
  emit({ type: 'worker_start', worker: name });
  try {
    if (process.env.GV_FAIL_WORKER === name) throw new Error('forced failure (GV_FAIL_WORKER)');
    const result = await withTimeout((signal) => fn(signal), TIMEOUTS[name]);
    emit({ type: 'worker_done', worker: name, ok: true });
    return { ok: true, fallback: false, ...result };
  } catch (err) {
    console.error(`[brief] ${name} worker failed, using fallback:`, err?.message ?? err);
    const result = await fallback(err);
    emit({ type: 'worker_done', worker: name, ok: false, fallback: true });
    return { ok: false, fallback: true, ...result };
  }
}

function sumUsage(...parts) {
  return parts.reduce((a, p) => ({ input: a.input + (p?.usage?.input_tokens ?? 0), output: a.output + (p?.usage?.output_tokens ?? 0) }), { input: 0, output: 0 });
}

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  let streaming = false;
  try {
    const opp = req.body?.opportunity;
    const rawProfile = req.body?.profile;
    if (!opp || typeof opp !== 'object' || !opp.title) throw new UserFacingError(400, 'Missing opportunity.');
    if (!rawProfile || typeof rawProfile !== 'object') throw new UserFacingError(400, 'Missing profile.');
    const profile = profileSlice(rawProfile);
    const country = String(profile.geography?.country ?? '').trim();
    const registry = FUNDERS[country] ?? { note: `No funder registry for ${country || 'this country'} yet. List only the event's own funding and a generic "ask your university's research office" item.` };

    res.status(200);
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    streaming = true;
    const emit = (evt) => { try { res.write(`${JSON.stringify(evt)}\n`); } catch { /* client went away */ } };
    emit({ type: 'start', workers: ['cost', 'funding', 'grounding'] });

    // Step 1: cost, funding and grounding run in parallel — none of them needs the others' output.
    const [costR, fundingR, groundingR] = await Promise.all([
      runWorker('cost', { fn: (signal) => runCost({ opportunity: opp, profile }, { signal }), fallback: () => fallbackCost({ opportunity: opp, profile }), emit }),
      runWorker('funding', { fn: (signal) => runFunding({ opportunity: opp, profile, registry }, { signal }), fallback: (err) => fallbackFunding({ opportunity: opp, profile, registry }), emit }),
      runWorker('grounding', { fn: (signal) => runGrounding(opp, { signal }), fallback: () => fallbackGrounding(opp), emit }),
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
    let composeR;
    try {
      if (process.env.GV_FAIL_WORKER === 'compose') throw new Error('forced failure (GV_FAIL_WORKER)');
      composeR = await withTimeout((signal) => runCompose({ opportunity: groundedOpp, profile, cost_estimate: costEstimate, funding: fundingR.funding, worker_notes: workerStatus }, { signal }), TIMEOUTS.compose);
    } catch (err) {
      if (!(err instanceof UserFacingError)) console.error('[brief] compose worker failed:', err);
      throw new UserFacingError(502, 'Could not finish composing this brief. Try again.');
    }
    emit({ type: 'worker_done', worker: 'compose', ok: true });

    // deadlines/fees come back too: grounding may have downgraded one, and the client's stored
    // opportunity (from the earlier /api/extract call) still has the original, pre-check values.
    const merged = plainWords({ ...composeR.compose, funding: fundingR.funding, cost_estimate: costEstimate, deadlines: groundedOpp.deadlines, fees: groundedOpp.fees }, opp.type);
    const usage = sumUsage(costR, fundingR, groundingR, composeR);
    emit({ type: 'done', brief: { ...merged, workers: workerStatus }, usage });
    res.end();
  } catch (err) {
    if (streaming) {
      try { res.write(`${JSON.stringify({ type: 'error', error: err instanceof UserFacingError ? err.message : 'Something went wrong on the server.' })}\n`); } catch { /* ignore */ }
      if (!(err instanceof UserFacingError)) console.error(err);
      res.end();
    } else sendError(res, err);
  }
}
