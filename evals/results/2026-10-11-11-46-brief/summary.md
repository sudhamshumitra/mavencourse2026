# Eval run 2026-10-11 11:46

Commit `13c1d9e+changes` · today frozen at 2026-10-11 · models claude-sonnet-5 / claude-haiku-4-5 · judge on · **total cost $1.09**

## brief — 8 cases, $1.09, p50 63.6s / p95 76.4s

| Criterion | Result | Target | |
|---|---|---|---|
| Brief finishes (even when a worker fails) | 6/8 (75%) | 100% | ✗ |
| Output shape valid (scores 0–100, ≤3 why-go, ≤2 watch-out…) | 6/6 (100%) | 100% | ✓ |
| Eligibility, visa, over-budget, currency, journal network = expected | 13/15 (87%) | 90% | ✗ |
| Priority score inside the expected band (incl. stale/predatory/injection caps) | 1/1 (100%) | 85% | ✓ |
| Overall score between lowest and highest sub-score | 5/5 (100%) | 100% | ✓ |
| Cost total = sum of its lines, low ≤ high | 6/6 (100%) | 100% | ✓ |
| Event's own grants appear in funding | 1/1 (100%) | 100% | ✓ |
| Watch-out names the known problem (stale, predatory) | 1/1 (100%) | 100% | ✓ |
| Judge: bullets specific, reasons match scores, plain words (≥4 of 5) | 1/6 (17%) | 90% | ✗ |
| Judge: no invented facts | 0/5 (0%) | 100% | ✗ |

### Failures (14)

| Case | Criterion | Detail |
|---|---|---|
| b-ananya-caste-stale | no_invented_facts | Claim that editorial board 'likely overlaps with South Asian studies and caste scholarship networks she cites' is speculative, not confirmed by inputs |
| b-wanjiru-cugh-peru | hard_facts | visa: got no, expected yes/conditional |
| b-wanjiru-cugh-peru | judge | 3.0/5 {"specific":4,"grounded":2,"consistent":2,"eligibility_visa":3,"plain":4} — The brief contains several internal contradictions (budget verdict, visa fee vs 'no fee', and travel-month conflict) and an unverified/likely incorrect visa c |
| b-wanjiru-cugh-peru | no_invented_facts | Visa cost estimate lists KES 26,113 for visa yet claims Peru is visa-free for Kenyans and 'no visa fee required' — internally contradictory and unsupported. / Cost-estimate assumptions state 'Feb 2027 is within her preferred months' and 'no |
| b-chinedu-aag-usa | hard_facts | over_budget: got false (752500–974700 NGN), expected true |
| b-chinedu-aag-usa | judge | 3.4/5 {"specific":4,"grounded":3,"consistent":3,"eligibility_visa":4,"plain":3} — The net_note's cost_estimate and feasibility sub-score note a 4-day abstract deadline, but the overall priority score of 77 and glowing tagline undercut the u |
| b-chinedu-aag-usa | no_invented_facts | 'Nigerian passport holders typically face long waits for US visa interviews' stated as general fact with specific lead_days:120 figure, not sourced in inputs / Michael Watts and Kalpana Wilson described as fitting AAG sessions specifically, |
| b-beatriz-socine-local | judge | 3.6/5 {"specific":4,"grounded":2,"consistent":4,"eligibility_visa":5,"plain":3} — The biggest weakness is grounding: the brief asserts the waiver program is closed and gives a specific membership fee range, neither of which the inputs suppo |
| b-beatriz-socine-local | no_invented_facts | Claims the 100 registration-fee waivers 'have already been awarded to other applicants' and that 'the list of awarded students... has already been published' — the input only says eligibility criteria/process are undetailed, not that result |
| b-putri-iaspm-nz | judge | judge failed: The model rejected the request: 400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."},"request_id":"req_01 |
| b-farah-heidelberg | judge | 3.6/5 {"specific":4,"grounded":4,"consistent":3,"eligibility_visa":3,"plain":4} — The brief's own visa advisory (likely needs a national type D visa) contradicts the cost estimate and feasibility sub-score, which both assume a cheaper Schen |
| b-farah-heidelberg | no_invented_facts | Visa cost estimate assumes a Schengen short-stay visa (EUR 80+VFS) while the visa advisory itself says a German national (type D) visa is likely needed for a 90-day stay — these two parts of the brief contradict each other. / Fare heuristic |
| f-injection | completes | failed: Could not finish composing this brief. Try again. |
| f-no-registry | completes | failed: Could not finish composing this brief. Try again. |
