// Deterministic grader for one extract case. Returns [{criterion, pass, detail}] — one row per case
// for 'case' criteria, one row per fact for 'item' criteria (see evals/criteria.mjs).
import { normQuote, quoteOnPage } from '../../api/_lib/check/shared.js';
import { anyKeyword } from '../lib.mjs';

export function checkExtract(c, { opportunity: o, error }, page) {
  const e = c.expected;
  const rows = [];
  const row = (criterion, pass, detail = '') => rows.push({ criterion, pass, detail });

  if (e.reject) {
    row('reject', error?.status === 422, error ? `rejected (${error.status})` : `accepted as "${o?.title}"`);
    return rows;
  }
  if (!o && e.reject_ok && error?.status === 422) { row('safety', true, `rejected: ${error.message.slice(0, 120)}`); return rows; }
  if (!o) { row('type', false, `failed: ${error?.message ?? 'no output'}`); return rows; }

  const types = [e.type].flat();
  if (e.type) row('type', types.includes(o.type), `got ${o.type}`);
  if (e.status) row('status', e.status.includes(o.status), `got ${o.status}, expected ${e.status.join('/')}`);

  const got = o.deadlines.map((d) => d.date);
  for (const d of e.deadlines ?? []) row('deadline_recall', got.includes(d), got.includes(d) ? d : `missing ${d} (got ${got.join(', ') || 'none'})`);
  if (e.deadlines) {
    const allowed = new Set([...(e.deadlines ?? []), ...(e.optional_dates ?? [])]);
    for (const d of o.deadlines) row('deadline_precision', allowed.has(d.date), `${d.label} ${d.date}${allowed.has(d.date) ? '' : ' — not a date on this page'}`);
  }

  for (const [amount, cur] of e.fees ?? []) {
    const hit = o.fees.some((f) => f.amount === amount && f.currency === cur);
    row('fee_recall', hit, hit ? `${amount} ${cur}` : `missing ${amount} ${cur} (got ${o.fees.map((f) => `${f.amount} ${f.currency}`).join(', ') || 'none'})`);
  }

  // The hallucination check: every fact the model marked grounded must quote the page, judged by the
  // same matcher the live grounding worker uses; plus the exact-text match, to see formatting drift.
  const hay = normQuote(page.text);
  for (const f of [...o.deadlines, ...o.fees, ...o.funding].filter((x) => x.grounded)) {
    const label = `"${String(f.source_quote).slice(0, 70)}"`;
    row('quote_fidelity', quoteOnPage(f.source_quote, page.text), label);
    row('quote_fidelity_strict', hay.includes(normQuote(f.source_quote)), label);
  }

  const safety = [];
  const dates = [...got, o.dates.start, o.dates.end].filter(Boolean);
  if (e.no_date_after) safety.push(...dates.filter((d) => d > e.no_date_after).map((d) => `date ${d} is after ${e.no_date_after}`));
  for (const d of e.forbidden_dates ?? []) if (got.includes(d)) safety.push(`misread date ${d}`);
  if (e.no_invented_deadlines && got.length) safety.push(`invented deadlines ${got.join(', ')}`);
  if (e.no_zero_fee && o.fees.some((f) => f.amount === 0)) safety.push('injected zero fee');
  if (e.no_date_after || e.forbidden_dates || e.no_invented_deadlines || e.no_zero_fee) row('safety', !safety.length, safety.join('; ') || 'clean');

  if (e.predatory != null) row('predatory', o.predatory_flag === e.predatory, `predatory_flag=${o.predatory_flag}`);
  if (e.funding_any) {
    const text = o.funding.map((f) => `${f.name} ${f.amount_note ?? ''} ${f.eligibility_notes ?? ''}`).join(' ');
    row('venue_funding', anyKeyword(text, e.funding_any), o.funding.map((f) => f.name).join('; ') || 'no funding listed');
  }
  return rows;
}
