// Deterministic grader for one brief case (the multi-agent "Full check").
import { anyKeyword, getPath } from '../lib.mjs';

const inRange = (n) => typeof n === 'number' && n >= 0 && n <= 100;

export function checkBrief(c, { brief: b, error }, { opportunity: opp }) {
  const e = c.expected;
  const rows = [];
  const row = (criterion, pass, detail = '') => rows.push({ criterion, pass, detail });

  row('completes', !!b, b ? 'finished' : `failed: ${error?.message ?? 'no output'}`);
  if (!b) return rows;

  const subs = Object.entries(b.priority?.sub_scores ?? {}).filter(([, s]) => s);
  const shapeErrors = [
    !inRange(b.priority?.score) && 'priority not 0–100',
    subs.some(([, s]) => !inRange(s.score)) && 'sub-score not 0–100',
    (b.why_go?.length ?? 0) > 3 && 'more than 3 why-go',
    (b.watch_out?.length ?? 0) > 2 && 'more than 2 watch-out',
    !['yes', 'no', 'conditional'].includes(b.eligible) && 'eligible not yes/no/conditional',
    !b.cost_estimate && 'no cost estimate',
    !Array.isArray(b.funding) && 'no funding list',
  ].filter(Boolean);
  row('shape', !shapeErrors.length, shapeErrors.join('; ') || 'ok');

  const hard = (name, pass, detail) => row('hard_facts', pass, `${name}: ${detail}`);
  if (e.eligible) hard('eligible', e.eligible.includes(b.eligible), `got ${b.eligible}, expected ${e.eligible.join('/')}`);
  if (e.visa) hard('visa', e.visa.includes(b.visa?.required ?? null), `got ${b.visa?.required ?? 'none'}, expected ${e.visa.join('/')}`);
  if (e.over_budget != null) {
    const ce = b.cost_estimate;
    hard('over_budget', ce?.over_budget === e.over_budget, `got ${ce?.over_budget} (${ce?.low}–${ce?.high} ${ce?.currency}), expected ${e.over_budget}`);
  }
  if (e.currency) hard('currency', b.cost_estimate?.currency === e.currency, `got ${b.cost_estimate?.currency}, expected ${e.currency}`);
  if (e.network_null) hard('network', b.priority?.sub_scores?.network == null, `network=${JSON.stringify(b.priority?.sub_scores?.network?.score ?? null)}`);

  const p = b.priority?.score;
  if (e.priority_min != null || e.priority_max != null) {
    const ok = (e.priority_min == null || p >= e.priority_min) && (e.priority_max == null || p <= e.priority_max);
    row('priority_band', ok, `priority ${p}, expected ${e.priority_min ?? 0}–${e.priority_max ?? 100}`);
  }

  // A weighted average can't leave the range of its parts; caps (predatory, stale) are the documented exception.
  if (subs.length && !opp.predatory_flag && opp.status !== 'stale') {
    const vals = subs.map(([, s]) => s.score);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    row('score_consistency', p >= lo - 2 && p <= hi + 2, `priority ${p}, sub-scores ${lo}–${hi}`);
  }

  const ce = b.cost_estimate;
  if (ce && !b.workers?.cost?.fallback) {
    const lines = Object.values(ce.breakdown ?? {});
    const sumLo = lines.reduce((a, l) => a + (l.low ?? 0), 0), sumHi = lines.reduce((a, l) => a + (l.high ?? 0), 0);
    const near = (a, x) => Math.abs(a - x) <= Math.max(0.05 * Math.max(a, x), 1000);
    const errs = [ce.low > ce.high && 'low > high', !near(sumLo, ce.low) && `lines sum to ${sumLo}, low says ${ce.low}`, !near(sumHi, ce.high) && `lines sum to ${sumHi}, high says ${ce.high}`].filter(Boolean);
    row('cost_arithmetic', !errs.length, errs.join('; ') || `${ce.low}–${ce.high} ${ce.currency}`);
  }

  if (e.funding_any) {
    const text = (b.funding ?? []).map((f) => `${f.name} ${f.amount_note ?? ''} ${f.why ?? ''}`).join(' ');
    row('venue_funding', anyKeyword(text, e.funding_any), (b.funding ?? []).map((f) => f.name).join('; ') || 'none');
  }
  if (e.watch_out_any) {
    const text = [...(b.watch_out ?? []), b.tagline, b.priority?.sub_scores?.feasibility?.reason, b.priority?.sub_scores?.standing?.reason].join(' ');
    row('warns', anyKeyword(text, e.watch_out_any), (b.watch_out ?? []).join(' | ').slice(0, 200));
  }
  if (e.fallback) {
    const w = b.workers?.[e.fallback];
    const flagged = e.fallback === 'grounding' ? w?.checked === 0 && /not re-checked/i.test(w?.note ?? '') : w?.fallback === true;
    row('fallback_flagged', flagged, JSON.stringify(w ?? null).slice(0, 160));
  }
  for (const path of e.downgraded ?? []) {
    const item = getPath(b, path);
    row('planted_faults', item?.grounded === false, `${path} ${item?.grounded === false ? 'downgraded' : 'still marked verified'}${item?.verify_note ? ` — ${item.verify_note}` : ''}`);
  }
  for (const path of e.still_grounded ?? []) {
    const item = getPath(b, path);
    row('planted_faults', item?.grounded === true, `${path} (correct fact) ${item?.grounded ? 'kept' : `wrongly downgraded — ${item?.verify_note ?? ''}`}`);
  }
  return rows;
}
