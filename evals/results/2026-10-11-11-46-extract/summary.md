# Eval run 2026-10-11 11:46

Commit `13c1d9e+changes` · today frozen at 2026-10-11 · models claude-sonnet-5 / claude-haiku-4-5 · **total cost $0.21**

## extract — 20 cases, $0.21, p50 9.8s / p95 19.5s

| Criterion | Result | Target | |
|---|---|---|---|
| Non-opportunity pages rejected | 1/1 (100%) | 100% | ✓ |
| Type correct (conference / journal / fellowship) | 18/19 (95%) | 95% | ✗ |
| Status correct (open / attend-only / watch / stale) | 12/16 (75%) | 100% | ✗ |
| Expected deadlines found, exact date | 15/18 (83%) | 95% | ✗ |
| Extracted dates that are real dates on the page | 24/32 (75%) | 90% | ✗ |
| Expected fees found (amount + currency) | 22/22 (100%) | 95% | ✓ |
| "Verified" quotes found on the page by the live re-check | 76/101 (75%) | 100% | ✗ |
| …of which exact character-for-character (diagnostic) | 74/101 (73%) | info |  |
| No invented, injected or impossible dates/fees | 4/4 (100%) | 100% | ✓ |
| Predatory organiser flagged | 0/1 (0%) | 100% | ✗ |
| Event's own grants/waivers picked up | 3/4 (75%) | 100% | ✗ |

### Failures (43)

| Case | Criterion | Detail |
|---|---|---|
| x-madison | status | got open, expected attend-only |
| x-madison | deadline_recall | missing 2026-03-01 (got 2027-03-01, 2027-04-05, 2027-10-01, 2027-10-10) |
| x-madison | deadline_recall | missing 2026-04-05 (got 2027-03-01, 2027-04-05, 2027-10-01, 2027-10-10) |
| x-madison | deadline_precision | abstract 2027-03-01 — not a date on this page |
| x-madison | deadline_precision | abstract 2027-04-05 — not a date on this page |
| x-madison | deadline_precision | early_bird 2027-10-01 — not a date on this page |
| x-madison | deadline_precision | registration 2027-10-10 — not a date on this page |
| x-socine | deadline_precision | registration 2026-07-26 — not a date on this page |
| x-socine | quote_fidelity | "SOCINE ofrecerá 100 becas de inscripción para el XXIX Encuentro SOCINE" |
| x-socine | venue_funding | Student Registration Scholarships |
| x-wera | quote_fidelity | "Submission Deadline: NOV 15 2026. Final day to submit papers, symposia" |
| x-wera | quote_fidelity | "Early Bird Deadline: MAR 1 2027. Last day to benefit from the reduced " |
| x-wera | quote_fidelity | "Regular Registration Deadline: APR 16 2027. Last day to complete regul" |
| x-devstud | status | got attend-only, expected open |
| x-aas-sa | quote_fidelity | "Students selected for the workshop will receive a grant to cover the c" |
| x-imiscoe | quote_fidelity | "On-site participation: standard €100" |
| x-imiscoe | quote_fidelity | "On-site participation: standard €360" |
| x-imiscoe | quote_fidelity | "On-site participation: standard €125" |
| x-imiscoe | quote_fidelity | "On-site participation: PhD students €50" |
| x-imiscoe | quote_fidelity | "On-site participation: PhD students €200" |
| x-imiscoe | quote_fidelity | "On-site participation: PhD students €75" |
| x-imiscoe | quote_fidelity | "Online participation: standard €50" |
| x-imiscoe | quote_fidelity | "Online participation: standard €225" |
| x-imiscoe | quote_fidelity | "Online participation: standard €65" |
| x-imiscoe | quote_fidelity | "Online participation: PhD students €50" |
| x-imiscoe | quote_fidelity | "Online participation: PhD students €145" |
| x-imiscoe | quote_fidelity | "Online participation: PhD students €65" |
| x-aoir | status | got open, expected attend-only |
| x-aoir | deadline_recall | missing 2026-03-01 (got 2026-08-01) |
| x-aoir | quote_fidelity | "Student, Majority World $55" |
| x-aoir | quote_fidelity | "Professional, Majority World $80" |
| x-aoir | quote_fidelity | "Student $425" |
| x-aoir | quote_fidelity | "Professional $670" |
| x-aoir | quote_fidelity | "Student, Majority World $100" |
| x-aoir | quote_fidelity | "Professional, Majority World $150" |
| x-aoir | quote_fidelity | "Student $500" |
| x-aoir | quote_fidelity | "Professional $800" |
| x-utaustin | deadline_precision | full_paper 2027-02-07 — not a date on this page |
| x-caste-stale | status | got open, expected stale/watch |
| x-wcws-predatory | deadline_precision | abstract 2026-11-19 — not a date on this page |
| x-wcws-predatory | deadline_precision | early_bird 2027-01-20 — not a date on this page |
| x-wcws-predatory | predatory | predatory_flag=false |
| x-past-2021 | type | failed: Couldn't use that page. This call closed on 2021-03-15, over 5 years ago. The conference was held 2021-06-10 to 2021-06-12. No future edition or rolling call is mentioned on the page. |
