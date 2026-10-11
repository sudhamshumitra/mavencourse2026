<!-- Recovered from the console log: this run's results.json was overwritten by a parallel run that started in the same minute (runner fixed to use seconds + case filter in the folder name). -->
# Eval run 2026-10-11 11:46

Commit `13c1d9e+changes` · today frozen at 2026-10-11 · models claude-sonnet-5 / claude-haiku-4-5 · judge on · repeat 3 · **total cost $0.26**

## brief — 1 cases, $0.26, p50 33.9s / p95 33.9s

| Criterion | Result | Target | |
|---|---|---|---|
| Brief finishes (even when a worker fails) | 1/1 (100%) | 100% | ✓ |
| Output shape valid (scores 0–100, ≤3 why-go, ≤2 watch-out…) | 1/1 (100%) | 100% | ✓ |
| Eligibility, visa, over-budget, currency, journal network = expected | 2/2 (100%) | 90% | ✓ |
| Overall score between lowest and highest sub-score | 1/1 (100%) | 100% | ✓ |
| Cost total = sum of its lines, low ≤ high | 1/1 (100%) | 100% | ✓ |
| Watch-out names the known problem (stale, predatory) | 1/1 (100%) | 100% | ✓ |
| Judge: bullets specific, reasons match scores, plain words (≥4 of 5) | 1/1 (100%) | 90% | ✓ |
| Judge: no invented facts | 0/1 (0%) | 100% | ✗ |
| Same input, repeated: priority score SD ≤ 8 | 1/1 (100%) | 100% | ✓ |

### Failures (1)

| Case | Criterion | Detail |
|---|---|---|
| b-ananya-gps-si | no_invented_facts | net_note suggests submitting on the passed deadline or 'at the next iteration' with no evidence a next iteration exists |

