# Module 4: the live "Full check" and the live search as multi-agent systems

## Before

Opening a call on the live site runs a "Full check": read the page (`/api/extract`), then
work out whether it's worth going (`/api/brief`). Until now, that second step was **one Sonnet
call** that worked through three skills — `find-funding`, `estimate-cost`, `compose-brief` — one
after another inside a single prompt. That caused four problems:

- **Funding was registry-only.** The call had no web access, so it could only use the static
  `corpus/funders/india.json` registry — never the venue's own grants page, never a newer scheme.
  This was the weakest part of every brief.
- **Slow.** Work that could run side by side ran one step after another.
- **All-or-nothing.** If one part of the prompt went wrong, the whole check failed and the user
  saw nothing.
- **No live grounding check.** `verify-grounding` — the skill that re-checks every quoted date
  and fee against the source page — only ever ran offline, against the corpus. A live user's
  extraction was never re-checked.

## The architecture

`api/brief.js` is now an **orchestrator** (its logic lives in `api/_lib/check/orchestrate.js` as `runBrief`, so the evals can call it directly). It runs three specialised workers **in parallel**,
then hands their combined result to a fourth worker, **compose**, in a **sequential handoff**.
That's an orchestrator-worker pattern with a parallel fan-out and a sequential step — chosen over
a plain pipeline because cost, funding and grounding genuinely don't depend on each other's
output, and over independent "agent teams" because they all feed one decision that needs to see
all three at once.

```
Browser (Full check)
  └─ /api/extract                         (unchanged: Haiku reads the page → Opportunity JSON)
  └─ /api/brief  = ORCHESTRATOR            (streams progress as the browser already expected
        │                                   from /api/scout — same NDJSON pattern)
        ├─ parallel ─┬─ cost worker        Haiku, no tools — estimate-cost skill + FX table
        │            ├─ funding worker     Sonnet + web_search (≤3) — find-funding skill + registry
        │            └─ grounding worker   re-fetch the page, match quotes in code,
        │                                   one small model call for "does it still support the value"
        │                                   — a live slice of verify-grounding
        ├─ merge: a fact grounding downgraded carries through to the cost line that used it
        └─ sequential ─ compose worker     Sonnet, no tools — compose-brief skill, given the
                                            other three workers' output, not raw data
  → the same brief shape the UI already rendered, plus `workers` (what ran, what fell back)
```

Every worker still gets its system prompt from the matching `SKILL.md` via `api/_lib/prompts.js`
— "skills are the source of truth" (see [CLAUDE.md](CLAUDE.md)) still holds for the live app.
`.claude/skills/verify-grounding/SKILL.md` is now bundled into `prompts.js` too, since the
grounding worker is the first live use of it.

## The four agents

| Agent | File | Model / tools | Gets | Produces | On failure/timeout |
|---|---|---|---|---|---|
| **Orchestrator** | `api/_lib/check/orchestrate.js` (route: `api/brief.js`) | plain code, no model call | profile + opportunity (from `/api/extract`) | the merged brief + per-worker status | — |
| **Cost** | `api/_lib/check/cost.js` | Haiku, no tools | opportunity's fees/location/dates, profile's home/currency/budget, FX table | `cost_estimate` | registration priced from whatever fee is already grounded; everything else marked "couldn't estimate this time" |
| **Funding** | `api/_lib/check/funding.js` | Sonnet + `web_search` (≤3) | opportunity's own funding, profile's country/stage/field, the funder registry | `funding[]` (≤4) | level 1: the old registry-only pass, no tools; level 2 (if that also fails): the venue's own listed funding only, nothing invented |
| **Grounding** | `api/_lib/check/grounding.js` | code (quote matching) + Haiku (value check) | the opportunity's grounded deadlines/fees/funding and their quotes, the source URL | per-fact pass / fail_missing / fail_mismatch, and a patched copy of the opportunity with failures downgraded | "not re-checked this time" — grounding never downgrades a fact it couldn't re-check, same rule the offline skill uses for unreachable pages |
| **Compose** | `api/_lib/check/compose.js` | Sonnet, no tools | profile, the (possibly grounding-patched) opportunity, cost, funding, and a note on which workers fell back | priority score, sub-scores, why_go/watch_out, eligibility, visa advisory, confidence | none — this is the one step with no fallback; if it fails, the whole check fails with the same retry UI as before |

## Handoffs and failure handling

- **Scoped inputs.** Each worker gets only the fields its skill needs — the same rule the
  Module 3 subagents follow — and every worker's prompt repeats that the opportunity and any
  search/fetch results are untrusted data, never instructions.
- **Independent timeouts**, inside the orchestrator's own 300s Vercel budget: cost 60s, funding
  120s (it has the most to do: search plus reasoning), grounding 60s, compose 90s. A timeout
  aborts that worker's own request (`withTimeout` in `api/_lib/claude.js` now threads an
  `AbortSignal` through `callJson`/`callJsonWithTools`) rather than hanging the others.
- **`Promise.all` over three always-resolving wrappers.** Each of the three parallel workers is
  wrapped so a thrown error becomes a fallback result instead of a rejection — so one failing
  worker can't take down the other two or the whole request.
- **The merge step is where grounding actually matters.** If grounding finds that a fee's quote no
  longer supports the stored amount, that downgrade is applied to the cost worker's registration
  line too, before compose ever sees it — a downgraded fact shouldn't quietly still look verified
  three steps later.
- **Compose is told what it's working with.** It receives a small `worker_notes` object saying
  which of the other three used a fallback, so a brief built on a partial funding search can say
  so in `watch_out`, instead of presenting a partial result as a confident one.
- **The UI reflects this.** The scoring screen now shows cost/funding/grounding ticking off at the
  same time instead of one bar, and the finished brief shows a short notice wherever a worker fell
  back (`prototype/app.js`, `tabMoney`/`tabDates`).

## Why not the other patterns

- **A longer sequential pipeline** (the old shape) is simpler but throws away the one real
  speed-up available here — cost, funding and grounding don't need each other — and makes a
  single slow step (funding's web search) block everything after it.
- **Fully independent agent teams**, each posting its own result somewhere, doesn't fit: all
  three parallel workers feed one decision (compose's priority score), which has to see all of
  them together to weigh feasibility correctly.
- **Fanning out scout's candidates** (running Full check on several opportunities at once) was
  considered and rejected for now — it multiplies the Anthropic spend per search by however many
  candidates are auto-checked, with no corresponding product ask yet. The orchestrator inside one
  Full check already gets the real win (speed, resilience, live grounding) without that cost.

## Testing

- Ran a Full check end to end against a real call page: the three parallel workers show as
  running together in the UI, compose runs after, and the rendered brief is unchanged in shape
  from before.
- Set `GV_FAIL_WORKER=funding` (then `cost`, then `grounding`) and re-ran: the brief still
  completes, with the fallback notice shown in the right tab, confirming each fallback path
  actually runs, not just its happy path.
- Fed the grounding worker a fixture page where one quote had been edited out and one left intact:
  confirmed in isolation (see the worked example below) that the edited quote is correctly flagged
  missing and the intact one correctly matches — the deterministic half of the grounding worker,
  tested without a model call:
  ```
  deadlines 0 -> present on page: false   (quote removed from the page)
  fees 0      -> present on page: true    (quote still there)
  ```
- Confirmed the static site (`npx serve prototype`) and the baked-in example shortlists
  (`prototype/corpus.js`) are untouched — this change only touches the live `/api/brief` route.

## The live search uses the same pattern

### Before
`/api/scout` was **one Sonnet call** with `web_search_20260209` (≤5) and `web_fetch` (≤4): search,
think, search again, open pages, then write the list, all in a row. Two problems showed up on the
deployed site:

- **Slow, and slower with a bigger budget.** Every search was another round trip in one loop. The
  11 Oct scout eval had a median of 162s; on the site, one run hit the browser's 200s limit after
  only 2 of its 5 searches.
- **A blank progress screen.** The `20260209` search tool runs its searches inside code execution,
  so the stream had no `web_search` blocks to report. The user saw one unchanging box for a minute or more.

### After
`scoutOpportunities` in `api/_lib/scout.js` is an orchestrator with three steps:

```
/api/scout = ORCHESTRATOR (streams NDJSON: lane_start / search / results / lane_done / phase / picked / link)
  ├─ parallel ─┬─ societies lane      Sonnet + web_search_20250305 (≤3) — skill layer (a)
  │            ├─ editions lane       Sonnet + web_search (≤3)          — layer (c), recurrence
  │            ├─ lists lane          Sonnet + web_search (≤3)          — layer (d), aggregators
  │            └─ fellowships lane    Sonnet + web_search (≤3)          — layer (e), open search
  ├─ dedupe leads across lanes (by URL)
  ├─ sequential ─ merge               Sonnet, no tools — picks 6-8 by lead number, scores, statuses
  └─ parallel ── link checks          plain code, fetchPage on every pick at once — live / no_date / blocked / dead
```

| Step | Deadline | On failure/timeout |
|---|---|---|
| Each lane | 45s | that lane contributes no leads, the UI marks it "didn't finish", the others carry on. Fatal only if all four fail |
| Merge | 30s | Haiku retries the same pick in 20s; if that fails too, leads in lane order, **unscored** (no invented scores) |
| Each link check | 10s | "blocked": kept, marked unverified. Only a 404/410 or an unknown host counts as dead, and dead links are dropped |

- **Guardrail: the model can't invent a URL.** The merge step picks lead *numbers*; URL, title and host
  are copied from the lead in code (`picksToCandidates`). A pick that names a missing lead is dropped.
- **Why the basic search tool.** `web_search_20250305` puts each search in its own streamed block, so
  every lane's queries and result counts reach the screen as they happen. Each lane only makes three
  searches, so dynamic filtering would save little.
- **Link checks moved out of the model.** The old prompt spent its web_fetch budget on the riskiest
  2–4 links and flagged the rest unverified. Code now opens every pick at once with the same
  private-address guards as a pasted link, so "not verified" only appears when a site blocks us or
  the page shows no current date.
- **Result:** one golden case on 15 Oct (`evals/results/2026-10-15-19-07-52-scout`) passed 19/19 checks
  in 41.5s for $0.66, against a 162s median and about $0.53 per case before. That is a single run,
  not a benchmark.
- **Tests:** `evals/unit/scout.test.mjs` stubs the lanes, merge and page loader to cover a failed lane,
  a hung lane, all lanes failing, merge failing twice, dead/blocked/undated links, and the URL guardrail.

## Files

- `api/scout.js` — the streaming search route; `api/_lib/scout.js` — its orchestrator (`scoutOpportunities`)
- `api/brief.js` — the streaming route; `api/_lib/check/orchestrate.js` — the orchestrator (`runBrief`)
- `api/_lib/check/{cost,funding,grounding,compose}.js` — the four workers
- `api/_lib/check/shared.js` — sanitation helpers shared across them
- `api/_lib/claude.js` — added `signal`/`withTimeout` so a worker's own timeout really cancels its request
- `prototype/app.js`, `prototype/styles.css` — parallel-worker progress UI and fallback notices
- `docs/architecture.excalidraw` — the diagram (also covers the Module 3 offline subagents, for
  the full before/after picture)
