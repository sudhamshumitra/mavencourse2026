// Small sanitation helpers shared by the brief orchestrator and its workers
// (cost, funding, grounding, compose). Keeping these in one place means every
// worker cleans up its own model output the same way the old single-call
// api/brief.js did.

export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const clamp = (v) => Math.max(0, Math.min(100, Math.round(num(v, 50))));
export const str = (v, n = 600) => (v == null ? null : String(v).slice(0, n));
export const strs = (a, n, len = 300) => (Array.isArray(a) ? a : []).map((s) => String(s).slice(0, len)).slice(0, n);
export const isoDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

export const norm = (v, dflt) => {
  const s = String(v ?? '').toLowerCase();
  if (/infer|estimat|unverif|partial/.test(s)) return 'inferred';
  if (/verif|ground/.test(s)) return 'verified';
  return dflt;
};

/** Plain wording in everything the user reads: "venue" becomes conference / journal / programme. */
export function plainWords(b, type) {
  const noun = { conference: 'conference', journal_call: 'journal', fellowship: 'programme' }[type] ?? 'event';
  return JSON.parse(JSON.stringify(b).replace(/\b([Vv])enues\b/g, (m, v) => (v === 'V' ? 'Events' : 'events'))
    .replace(/\b([Vv])enue\b/g, (m, v) => (v === 'V' ? noun[0].toUpperCase() + noun.slice(1) : noun)));
}

/** Normalise whitespace/quote marks/dashes only, for comparing a stored quote against page text — never the wording. */
export function normQuote(s) {
  return String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const PROFILE_KEYS = ['name', 'career_stage', 'year', 'research_summary', 'topics', 'fields', 'adjacent_fields', 'citation_neighborhood', 'geography', 'currency', 'constraints', 'goals'];

export const profileSlice = (raw) => Object.fromEntries(PROFILE_KEYS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
