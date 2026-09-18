---
name: compose-brief
description: Decide whether one opportunity is worth it for one researcher and explain why in plain words — a 0–100 priority score built from five sub-scores (fit, standing, network value, outcomes, feasibility) weighted by the person's goals, plus "why go" / "watch out" bullets, eligibility, and a visa advisory. Use for every (opportunity, profile) pair after extraction, cost and funding are done; the feed is sorted by its priority score.
---

# compose-brief — Matcher/Ranker + Eligibility + visa (PRD §6)

## Purpose
A list of calls isn't a decision. The person, who may not know the field's hierarchy, needs to know: **Is this for me? Is it any good? Who would I meet? What would I come away with? Can I actually go?** This skill answers those five questions as numbers *with reasons*, combines them using the person's own goals, and writes the "is it worth going" verdict the feed is sorted by.

## When to use
After `extract-opportunity`, `estimate-cost` and `find-funding` have run for the pair. Rerun it when the profile's topics or goals change, or when feedback adjusts the weights.

## Inputs
- `corpus/opportunities/<id>.json`
- `corpus/profiles/<slug>.json`
- `corpus/briefs/<profile>/<id>.json`: the existing `cost_estimate` and `funding` (written by the other two skills). Merge into this file; don't overwrite them.

## The five sub-scores (each 0–100, each with a one-sentence reason in plain words)
1. **Fit: how close is it to their research?** Judge the *meaning*, not shared words. Start from the call's theme, description, tracks and past papers, and ask whether this person's thesis would be a natural paper there. Name the specific topic link. Keyword overlap alone caps the score at 70. A semantic link through an adjacent field can score 85+.
   - 90+: their core topic is a named track or theme.
   - 70–89: clear home for the work.
   - 50–69: plausible with framing.
   - < 50: a stretch.
2. **Standing: how established and respected is it?** Use the `standing_signals` from extraction:
   - host is a learned society or university (+);
   - number of editions (10+ is strong);
   - indexed proceedings or a journal special issue (+);
   - recognisable keynotes (+);
   - international programme committee (+);
   - for-profit, all-topics organiser (−−).

   A `predatory_flag` caps Standing at 15. A signal without a source counts at half weight and is marked "(inferred)".
3. **Network value: who would they meet?** Signals: the field's main gathering (+), overlap with `citation_neighborhood` among keynotes, past speakers or committee (+), stated size, doctoral colloquium or mentoring or early-career preconference (+ for PhDs), regional reach (a South Asia-focused meeting is high value for someone in that field). *Journal calls: N/A. Drop this sub-score and renormalise the weights.* Fellowships and summer schools score high by nature (small cohort, sustained contact).
4. **Outcomes: what would they come away with?** A publication route (proceedings, selected papers into a special issue), awards for student papers, a line on the CV that carries weight in the field (flagship vs. minor), feedback formats (workshops, respondents). *Journal calls:* indexing, reputation, turnaround.
5. **Feasibility: can they actually go?**
   - Start at 100.
   - Subtract for: cost high vs. `max_cost` (−30 if even the low end is over budget, −15 if only the high end is), visa difficulty given the passport (−20 for long waits or interviews vs. `visa_tolerance`), the event month not in `months_available` (−10), an awkward deadline (< 14 days away, −10), eligibility `conditional` (−10) or `no` (→ 0).
   - Add back up to +20 if venue or external funding would likely cover a large share.
   - Online, or a journal with no APC → near 100.

## Weights from goals
Base weights: fit .35 · standing .15 · network .15 · outcomes .15 · feasibility .20.
Each of the profile's `goals` adds:
- `networking` → network +.10
- `publication` → outcomes +.10
- `visibility` → standing +.10
- `low_cost` → feasibility +.10
- `feedback` → network +.05 and outcomes +.05

Renormalise so the weights sum to 1. **Priority = Σ weight × sub-score**, rounded. Record the weights used, so feedback can adjust them.

## Other fields
- **`why_go`:** 2–3 bullets a non-researcher could read. Concrete, no jargon. For example, "It's the main yearly meeting in your field, and your topic has its own panel stream."
- **`watch_out`:** 1–2 bullets, the most decision-relevant risks. For example, "The travel grant only opens after acceptance, and the UK visa takes ~3 weeks."
- **`tagline`:** one line, ≤ 90 characters, the honest headline.
- **`eligible`:** `yes | no | conditional` against career stage, nationality or region, and membership, with `eligibility_notes`.
- **`visa`:** `{ required: yes|no|conditional, note, official_source, verify_flag: true, lead_days }` for this passport → destination. `lead_days` is how many days before travel to start (typical processing + appointment wait, from the official or consulate page if available, otherwise a stated estimate). Online events: `required: "no"`.
- **`explore`:** true if the venue's field is an `adjacent_field` rather than a primary one and topic keyword overlap is low, plus `explore_reason`.
- **`confidence`:** `{ dates, fees, cost: "range", visa: "advisory", eligibility }`, taken from the grounding flags. `dates`, `fees` and `eligibility` must each be **exactly** `"verified"` or `"inferred"`, never free text. The UI renders these as badges.

## Output (merged into `corpus/briefs/<profile>/<id>.json`)
```jsonc
{
  "opportunity_id": "…", "profile_id": "p_ananya",
  "priority": { "score": 84, "weights": { "fit": .32, "standing": .23, "network": .14, "outcomes": .14, "feasibility": .27 },
    "sub_scores": {
      "fit": { "score": 88, "reason": "…" }, "standing": { "score": 90, "reason": "…" },
      "network": { "score": 80, "reason": "…" }, "outcomes": { "score": 75, "reason": "…" },
      "feasibility": { "score": 70, "reason": "…" } } },
  "fit": { "score": 0.88, "rationale": "2–4 sentences", "matched_topics": ["…"], "neighborhood_evidence": ["…"] },
  "why_go": ["…"], "watch_out": ["…"], "tagline": "…",
  "eligible": "yes", "eligibility_notes": "…",
  "visa": { … }, "explore": false, "explore_reason": null, "confidence": { … },
  "cost_estimate": { …kept… }, "funding": [ …kept… ],
  "generated_at": "ISO", "model_version": "skill:compose-brief@1"
}
```

## Constraints
- **Reasons over numbers.** Every sub-score needs a reason that names the specific evidence. A score without a reason is a bug.
- **Visa is advisory only:** always link the official source, set `verify_flag: true`, and never phrase it as immigration advice ("you are eligible for…").
- Don't reward prestige blindly. A flagship with 15% acceptance and a ₹2.5L cost can still rank below a strong regional meeting for a budget-limited PhD. That's the point of the weights.
- Never suggest registering, paying or submitting on the person's behalf.

## Edge cases
- **Missing data** (no past editions, no fees): score what you can, say "limited information" in the reason, and use the midpoint (50), not 0 or 100.
- **`predatory_flag`:** keep it in the feed with the flag (so people learn to recognise these). Priority is capped at 30.
- **`watch` status:** score the venue as normal, but Feasibility's reason mentions "CFP expected <window>".

## Runtime notes (Phase 2)
Capable model (Sonnet/Opus) with structured output. Sub-scores come from the model, and the weighting arithmetic is done in code. Cached per (opportunity, profile, weights-hash).
