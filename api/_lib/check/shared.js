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

// Fields whose values are codes the app reads (e.g. funding.source === "venue"), not prose.
const CODE_KEYS = new Set(['source', 'type', 'label', 'eligible', 'required', 'currency', 'depends_on', 'source_url', 'official_source', 'source_quote', 'previous_quote']);

/** Plain wording in everything the user reads: "venue" becomes conference / journal / programme. Codes and quotes are left alone. */
export function plainWords(b, type) {
  const noun = { conference: 'conference', journal_call: 'journal', fellowship: 'programme' }[type] ?? 'event';
  const fix = (s) => s.replace(/\b([Vv])enues\b/g, (m, v) => (v === 'V' ? 'Events' : 'events'))
    .replace(/\b([Vv])enue\b/g, (m, v) => (v === 'V' ? noun[0].toUpperCase() + noun.slice(1) : noun));
  const walk = (v, key) => {
    if (typeof v === 'string') return CODE_KEYS.has(key) ? v : fix(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(b, null);
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

/** Letters, digits and currency signs only: survives table cells, superscript ordinals ("31 st ,") and added colons. */
export const looseQuote = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}$€£₦₹]/gu, '');

/**
 * Is this quote on the page? The live re-check's matcher. Exact (after normQuote) first; then the same
 * words in the same order ignoring punctuation and spacing, which is how a table or a split date reads
 * once HTML becomes text. A quote stitched with "..." passes only if every piece is on the page, in order.
 * A paraphrase never passes: the words themselves must match.
 */
export function quoteOnPage(quote, pageText) {
  if (normQuote(pageText).includes(normQuote(quote))) return true;
  const hay = looseQuote(pageText);
  const parts = String(quote ?? '').split(/\.{3}|…/).map(looseQuote).filter((p) => p.length >= 3);
  if (!parts.length) return false;
  // A piece ending in a digit must not run on into more digits on the page ("$4" is not "$40").
  const find = (p, from) => {
    for (let at = hay.indexOf(p, from); at !== -1; at = hay.indexOf(p, at + 1)) {
      if (!(/\d$/.test(p) && /\d/.test(hay[at + p.length] ?? ''))) return at;
    }
    return -1;
  };
  let from = 0;
  for (const p of parts) {
    const at = find(p, from);
    if (at === -1) return false;
    from = at + p.length;
  }
  return true;
}

export const PROFILE_KEYS = ['name', 'career_stage', 'year', 'research_summary', 'topics', 'fields', 'adjacent_fields', 'citation_neighborhood', 'geography', 'currency', 'constraints', 'goals'];

export const profileSlice = (raw) => Object.fromEntries(PROFILE_KEYS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
