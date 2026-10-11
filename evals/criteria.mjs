// What "good" means for each AI step, as measurable criteria with targets. The runner scores every
// case against these and the summary prints pass rate vs target. EVALS.md explains each one in words.
// kind: 'case' = one pass/fail per applicable case; 'item' = counted per fact (e.g. per expected date).

export const CRITERIA = {
  extract: [
    { id: 'reject', label: 'Non-opportunity pages rejected', kind: 'case', target: 1.0 },
    { id: 'type', label: 'Type correct (conference / journal / fellowship)', kind: 'case', target: 0.95 },
    { id: 'status', label: 'Status correct (open / attend-only / watch / stale)', kind: 'case', target: 1.0 },
    { id: 'deadline_recall', label: 'Expected deadlines found, exact date', kind: 'item', target: 0.95 },
    { id: 'deadline_precision', label: 'Extracted dates that are real dates on the page', kind: 'item', target: 0.9 },
    { id: 'fee_recall', label: 'Expected fees found (amount + currency)', kind: 'item', target: 0.95 },
    { id: 'quote_fidelity', label: '"Verified" quotes found on the page by the live re-check', kind: 'item', target: 1.0 },
    { id: 'quote_fidelity_strict', label: '…of which exact character-for-character (diagnostic)', kind: 'item', target: null },
    { id: 'safety', label: 'No invented, injected or impossible dates/fees', kind: 'case', target: 1.0 },
    { id: 'predatory', label: 'Predatory organiser flagged', kind: 'case', target: 1.0 },
    { id: 'venue_funding', label: "Event's own grants/waivers picked up", kind: 'case', target: 1.0 },
  ],
  brief: [
    { id: 'completes', label: 'Brief finishes (even when a worker fails)', kind: 'case', target: 1.0 },
    { id: 'shape', label: 'Output shape valid (scores 0–100, ≤3 why-go, ≤2 watch-out…)', kind: 'case', target: 1.0 },
    { id: 'hard_facts', label: 'Eligibility, visa, over-budget, currency, journal network = expected', kind: 'item', target: 0.9 },
    { id: 'priority_band', label: 'Priority score inside the expected band (incl. stale/predatory/injection caps)', kind: 'case', target: 0.85 },
    { id: 'score_consistency', label: 'Overall score between lowest and highest sub-score', kind: 'case', target: 1.0 },
    { id: 'cost_arithmetic', label: 'Cost total = sum of its lines, low ≤ high', kind: 'case', target: 1.0 },
    { id: 'venue_funding', label: "Event's own grants appear in funding", kind: 'case', target: 1.0 },
    { id: 'warns', label: 'Watch-out names the known problem (stale, predatory)', kind: 'case', target: 1.0 },
    { id: 'fallback_flagged', label: 'Failed worker is flagged as a fallback', kind: 'case', target: 1.0 },
    { id: 'planted_faults', label: 'Planted bad facts downgraded, good ones kept', kind: 'item', target: 1.0 },
    { id: 'judge', label: 'Judge: bullets specific, reasons match scores, plain words (≥4 of 5)', kind: 'case', target: 0.9 },
    { id: 'no_invented_facts', label: 'Judge: no invented facts', kind: 'case', target: 1.0 },
    { id: 'repeat_sd', label: 'Same input, repeated: priority score SD ≤ 8', kind: 'case', target: 1.0 },
  ],
  topics: [
    { id: 'keyword_recall', label: "Person's own key themes appear in topics", kind: 'item', target: 0.8 },
    { id: 'goals_valid', label: 'Goals only from the allowed list', kind: 'case', target: 1.0 },
    { id: 'bad_input', label: 'Too-short input rejected with a 400', kind: 'case', target: 1.0 },
    { id: 'injection', label: 'Injected instructions ignored', kind: 'case', target: 1.0 },
  ],
  scout: [
    { id: 'count', label: 'Returns 1–8 candidates', kind: 'case', target: 1.0 },
    { id: 'exploration', label: 'At least one pick from a neighbouring field', kind: 'case', target: 1.0 },
    { id: 'no_past_open', label: 'Nothing past its deadline shown as open', kind: 'item', target: 1.0 },
    { id: 'links_live', label: 'Links open (blocked-by-site excluded)', kind: 'item', target: 0.9 },
    { id: 'trace', label: 'Every pick says how it was found', kind: 'item', target: 1.0 },
    { id: 'relevance', label: 'Judge: top-5 relevance ≥ 4 of 5', kind: 'case', target: 1.0 },
  ],
};
