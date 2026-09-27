# Module 3: two specialized subagents for Grapevine

**[Live prototype](https://mavencourse2026.vercel.app)** · **[PRD](PRD.md)** · **[SKILLS.md](SKILLS.md)**

## The task

Grapevine has seven skills in [`.claude/skills/`](.claude/skills/): plain-language instruction files, each
covering one step of the product, run by hand in Claude Code to build the example corpus and sent as-is
to Claude by the live site. Two of those seven already describe themselves in subagent terms and can't
actually deliver on it as skills:

- [extract-opportunity/SKILL.md:17](.claude/skills/extract-opportunity/SKILL.md) — *"context-starved by
  design"*; [:47](.claude/skills/extract-opportunity/SKILL.md) — *"Parallel runs must not share context."*
- [verify-grounding/SKILL.md:9](.claude/skills/verify-grounding/SKILL.md) — *"a separate second pass that
  doesn't trust the first."*

A skill is text injected into the same conversation; it can *ask* for isolation but the main thread still
sees everything it produces. A **subagent** gets its own context window, so isolation becomes an
enforceable property of the system rather than a hope. This is prior design intent, not a retrofit: the
pre-rewrite PRD (`git show 34a353e:PRD.md` §6, before Module 2's plain-language pass) already named
*"Extraction Workers (×N, parallel) — context-starved by design"* and a *"Verification Judge"*. The
rewrite dropped the word "agent" without dropping the design; this module puts it back as two working
Claude Code subagents.

**Outcome:** [`.claude/agents/opportunity-extractor.md`](.claude/agents/opportunity-extractor.md) and
[`.claude/agents/grounding-auditor.md`](.claude/agents/grounding-auditor.md), a `memory/` folder, a
[`/refresh-corpus`](.claude/commands/refresh-corpus.md) batch command, and this write-up — with **zero**
changes to the deployed app.

## Why a subagent, not a prompt or a skill

| Requirement | A prompt in the main thread | A skill (as used elsewhere in Grapevine) | A subagent |
|---|---|---|---|
| Independent reasoning — the auditor must locate each quote itself, never having seen the extractor's version | No: same context, same conversation history | No: still runs in the calling thread | Yes: separate context window, nothing carried over unless explicitly passed in |
| Dedicated, bounded context — the extractor must never see a profile, another opportunity, or the researcher's hopes | No | No — a skill only asks for this in prose | Yes: an explicit `tools:` allowlist and a prompt containing exactly one URL |
| Independent, parallel operation — three extractions must run at once without one clobbering another's output | Not parallel by construction | Not parallel by construction | Yes: each `Agent` call is its own process with its own file writes |

Both agents also hold **no extraction or verification rules of their own** — see "Two sources of truth"
below.

## The two agents

| | [`opportunity-extractor`](.claude/agents/opportunity-extractor.md) | [`grounding-auditor`](.claude/agents/grounding-auditor.md) |
|---|---|---|
| Purpose | One call-page URL → one validated `corpus/opportunities/<id>.json` | Re-fetch every `grounded: true` quote and independently confirm it's really there |
| Tools | `Read, Write, WebFetch, Skill` | `Read, Edit, Write, WebFetch, Grep, Skill` |
| Model | `haiku` (Claude Haiku 4.5) — matches `MODEL_FAST` in [`api/_lib/claude.js`](api/_lib/claude.js), so Claude Code and the live site extract with the same model | `sonnet` (Claude Sonnet 5) — [verify-grounding/SKILL.md:50](.claude/skills/verify-grounding/SKILL.md) already specifies "capable model only for check (b)" |
| Inputs | Exactly one URL, plus an optional target `id`. Anything else the caller hands it (a profile, a persona, page text) is refused and logged | A list of opportunity ids or a glob, plus an optional run label. Page text or quotes handed in by the caller are refused |
| Outputs | The written file; a ≤15-line report; a `MEMORY: <host> \| <quirk> \| <what to do>` line (or `MEMORY: none`) | Per-file edits downgrading anything that fails; **one appended** run section in `corpus/grounding-report.md`; a summary to the caller |
| Calling conditions | Every URL that needs (re-)extracting; safe to fan out in parallel, one URL each | After any extraction batch, before a demo/submission, or on a reported wrong date. **Never concurrently with the extractor** |
| Not for | Cost, funding, or brief composition (`corpus/briefs/**`) | Re-extracting a page or calling `opportunity-extractor` |

Step 1 of both agent bodies is the same pattern: `Read .claude/skills/<name>/SKILL.md` (plus the schema,
for the extractor) and follow it exactly, with an explicit note that the SKILL.md wins on any conflict.
Everything else in the agent body is either a **memory protocol**, an **anti-collusion constraint** the
original SKILL.md didn't need (it assumed one shared conversation), or a **report format** — never a
restated extraction or verification rule.

## `memory/` — durable state for stateless agents

Subagents share no context across runs, so a file on disk is their only channel. `memory/fetch-notes.md`
holds one row per host — mechanics only (a 403 that needs a reader-proxy, where the grants live on a
JS-heavy site), never a fact, quote, or pass/fail result; those stay in `corpus/grounding-report.md`. The
extractor only ever *reports* a `MEMORY:` line; a single writer (the auditor, or the `/refresh-corpus`
command orchestrating a batch of extractors) applies it, so N parallel writers never race on one file. Full
protocol in [`memory/README.md`](memory/README.md).

Root `memory/`, not under `corpus/` — a stray file in `corpus/profiles/` or `corpus/briefs/<p>/` would be
picked up by [`build-feed.mjs`](scripts/build-feed.mjs) and silently drop an item from the feed.

## Invocation

Automatic delegation works off each agent's `description` field for one-off asks ("read this call page
and add it to the corpus"). Explicit invocation is used for a batch, via `/refresh-corpus <profile-slug>
| <url> [<url> …]`, because the parallelism is the point and should be visible in the transcript, not
inferred. `/refresh-corpus` resolves URLs, checks the host allowlist and a clean working tree, fans out
≤3 extractors at a time, applies their `MEMORY:` lines itself, then runs exactly one auditor over the ids
it just wrote (never the whole corpus by default) and reports `git diff --stat`.

## The one thing that must not be parallelised

`estimate-cost`, `find-funding` and `compose-brief` all read-modify-write the **same**
`corpus/briefs/<profile>/<id>.json` file —
[compose-brief/SKILL.md:17](.claude/skills/compose-brief/SKILL.md) says "merge into this file; don't
overwrite." Three parallel subagents there means last-writer-wins, and
[build-feed.mjs](scripts/build-feed.mjs) just omits the missing keys with no error — silent data loss.
Extraction is the only stage that's safe to fan out, because each run owns exactly one output file that
nothing else touches. Both agent bodies, the `/refresh-corpus` command, and this document all state that
constraint directly.

## Test results

Working tree was clean (`git status --short`) before every test; anything the tests changed on disk was
restored with `git checkout --` afterward unless noted.

**T1 — re-extraction diffed against committed JSON**, on `samcs-2027`. The first run failed: the agent
rewrote the file with expanded (one-key-per-line) JSON instead of the existing compact style, and reworded
`host`, `theme`, `description`, `eligibility.career_stage` and `standing_signals` beyond what the page
actually changed — an unstable re-extraction, not the "only `extracted_at` changed" the design intended.
The agent body was tightened: treat re-extraction of an existing file as an *update*, copy any unchanged
field byte-for-byte, and match the file's existing per-line JSON style. A retest against the same URL then
passed cleanly — the only diff was `extracted_at` and a `freshness` block the schema defines but the
original extraction had left unpopulated. **Residual limitation** (see T3): the fix reduces but doesn't
eliminate the underlying instability, since the extractor is a model generating text each run, not a
diffing tool.

**T2 — injected-fault test**, "Run 3" in `corpus/grounding-report.md`. Two faults were hand-injected: a
plausible-but-wrong `source_quote` on `madison-sa-2026`'s early-bird deadline, and a `date` shifted 7 days
away from its own (unchanged, correct) quote on `sai-heidelberg-scholarship`. The auditor, working only
from the files and its own fresh fetches, caught both — correctly typed as `fail_missing` and
`fail_mismatch` respectively — while re-confirming all 10 other grounded items in those two files as still
passing, with no false positives. It never asked for the quote or attempted to re-extract, per its
anti-collusion constraints. The opportunity JSONs were restored afterward; the `Run 3` section stays in
`corpus/grounding-report.md` as append-only evidence.

**T3 — parallel fan-out**, three `opportunity-extractor` runs launched in a single message on `aoir-2026`,
`basas-2027` and `ecsas-2027`. All three ran concurrently, each fetching and writing only its own file —
`git diff --stat` showed exactly three files changed, no cross-contamination. **Independence check**: with
none of the three pages read in the main thread, asked "what were AoIR's fee tiers?" and, correctly,
couldn't answer without opening the file — proof the main thread genuinely never saw the page. **Recurring
limitation**: the same quote-paraphrasing instability from T1 reappeared on facts that hadn't changed
(e.g. `"10 July 2026"` → `"Deadline: July 10, 2026"`, same date), plus an inconsistent `extracted_at`
timestamp format across the three files (`2026-09-27` vs. `2026-09-27T00:00:00Z`). No date, amount,
currency, or `grounded` value was ever corrupted — only prose wording and one cosmetic format drifted —
but re-extraction is not byte-stable, since each run is a fresh model generation rather than a
deterministic transform. All three files were restored afterward (`basas-2027` back to its `--hold` state
for the offline paste-a-link demo).

**T4 — nothing deployed changed.** `node scripts/build-prompts.mjs && node scripts/build-feed.mjs && git
status --short` showed no diff in `api/_lib/prompts.js` or `prototype/corpus.js` — confirming the scope
boundary below.

**T5 — memory round trip.** Every extractor run in T1–T3 reported `MEMORY: none`, so
`memory/fetch-notes.md` still holds its original 2 rows (one per host), with no duplicates — the
one-row-per-host invariant held. The "second run replaces rather than appends" behavior specifically
wasn't exercised, since no test host produced a new quirk to log; this remains to be observed the first
time a real corpus refresh hits a host worth a memory row.

## Scope boundary: subagents run in Claude Code only

Claude Code subagents are spawned by the `Agent` tool inside a session. Vercel has no session and no
`.claude/` reader; the only dependency the deployed functions have is `@anthropic-ai/sdk`, which has no
subagent concept — the four functions in [`api/`](api/) each make exactly one `messages.create` call.
Nothing under `api/` or `prototype/` changes: `build-prompts.mjs` reads only the six named `SKILL.md`
files, `build-feed.mjs` reads only `corpus/`, and neither looks at `.claude/agents/` or `memory/`.
`vercel.json` ships only `prototype/`. T4 above confirms it mechanically.

## Two sources of truth (avoided on purpose)

Only `SKILL.md` reaches production, via `build-prompts.mjs`. If an agent body restated extraction or
verification rules instead of pointing at the skill, the two paths would silently diverge the next time
one was edited and not the other. Both agent bodies contain no such rules — only the step-1 read, the
memory protocol, the report format, and the anti-collusion constraints the original skill didn't need
because it assumed a single shared conversation.
