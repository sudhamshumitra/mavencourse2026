# Eval run 2026-10-11 11:54

Commit `7fe58dc+changes` · today frozen at 2026-10-11 · models claude-sonnet-5 / claude-haiku-4-5 · **total cost $0.21**

## extract — 20 cases, $0.21, p50 9.4s / p95 20.2s

| Criterion | Result | Target | |
|---|---|---|---|
| Non-opportunity pages rejected | 1/1 (100%) | 100% | ✓ |
| Type correct (conference / journal / fellowship) | 18/18 (100%) | 95% | ✓ |
| Status correct (open / attend-only / watch / stale) | 16/16 (100%) | 100% | ✓ |
| Expected deadlines found, exact date | 17/18 (94%) | 95% | ✗ |
| Extracted dates that are real dates on the page | 27/31 (87%) | 90% | ✗ |
| Expected fees found (amount + currency) | 22/22 (100%) | 95% | ✓ |
| "Verified" quotes found on the page by the live re-check | 97/99 (98%) | 100% | ✗ |
| …of which exact character-for-character (diagnostic) | 64/99 (65%) | info |  |
| No invented, injected or impossible dates/fees | 5/5 (100%) | 100% | ✓ |
| Predatory organiser flagged | 0/1 (0%) | 100% | ✗ |
| Event's own grants/waivers picked up | 4/4 (100%) | 100% | ✓ |

### Failures (8)

| Case | Criterion | Detail |
|---|---|---|
| x-socine | deadline_precision | registration 2026-07-12 — not a date on this page |
| x-imiscoe | quote_fidelity | "Online participation: PhD students … €65" |
| x-aoir | deadline_recall | missing 2026-03-01 (got 2026-08-01, 2026-10-14) |
| x-utaustin | deadline_precision | full_paper 2027-02-07 — not a date on this page |
| x-wcws-predatory | deadline_precision | abstract 2026-11-19 — not a date on this page |
| x-wcws-predatory | deadline_precision | early_bird 2027-01-20 — not a date on this page |
| x-wcws-predatory | predatory | predatory_flag=false |
| x-multicurrency | quote_fidelity | "Student delegate: €140 (or £280, or US$150)" |
