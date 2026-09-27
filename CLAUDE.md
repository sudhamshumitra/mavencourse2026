# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Grapevine finds academic conferences, journal calls and fellowships for humanities researchers and judges whether each is worth the time and money, given the researcher's fit, standing, network value, outcomes and feasibility (cost, funding, visa). Full spec: [PRD.md](PRD.md). Build write-up: [SKILLS.md](SKILLS.md).

Static site (`prototype/`) + Vercel serverless functions (`api/`), calling the Anthropic Claude API directly — no agent framework. Sonnet 5 for judgement (search, brief composition), Haiku 4.5 for high-volume/simple steps (topic suggestions, reading pages).

## Commands

- Run the static site with no live AI: `npx serve prototype`
- Run with the live API (needs `ANTHROPIC_API_KEY` in `.env.local`, git-ignored): `npx vercel dev`
- After editing any file in `.claude/skills/*/SKILL.md`: `npm run build:prompts` (regenerates `api/_lib/prompts.js` — the live API's prompts are literally the skill files, kept in sync by this script, not maintained separately)
- After editing corpus data or profiles: `npm run build:feed` (rebuilds `prototype/corpus.js`, the example shortlists baked into the static site)
- There is no test suite, linter, or build step beyond the two scripts above.

## Architecture: skills are the source of truth, twice

The core idea is that each step of the product pipeline is written once, in plain language, as a Claude Code skill under `.claude/skills/`, and used in two different runtimes:

1. **By hand, in Claude Code**, to refresh the real data in `corpus/` (8 example researcher profiles, their candidate opportunities, extracted call details, cost/funding briefs, a grounding report).
2. **Live, in the deployed site**, where `api/*.js` sends the *same* SKILL.md text as the system prompt to Claude, so a live user's search runs the identical logic as the offline corpus build.

The link between the two is `scripts/build-prompts.mjs`: it strips frontmatter from each `.claude/skills/*/SKILL.md`, bundles them (plus `corpus/funders/india.json` and `corpus/fx.json`) into the generated `api/_lib/prompts.js`. **Never hand-edit `api/_lib/prompts.js`** — edit the skill file and rerun `npm run build:prompts`.

Pipeline (see PRD §5 for the full diagram): draft-profile → scout-opportunities → extract-opportunity → estimate-cost + find-funding → compose-brief → verify-grounding. Each skill name maps 1:1 to an `api/*.js` route (`topics.js`, `scout.js`, `extract.js`, `brief.js`) except verify-grounding, which only runs offline against the corpus.

Each `api/*.js` route wraps its skill's system prompt with **runtime-only instructions** (tool budgets, e.g. "at most 5 searches", output JSON shape, sanitization rules) that don't belong in the skill file because they don't apply to the by-hand corpus-build usage. When changing a route's behavior, decide whether the change belongs in the skill (both runtimes) or in the route's own runtime instructions (live only).

`scripts/build-feed.mjs` is the other direction: it reads `corpus/` (profiles, opportunities, briefs) and generates `prototype/corpus.js`, the pre-built example shortlists shown when a user picks "see an example" instead of searching live.

## `api/_lib/claude.js`: the one place that talks to Anthropic

All routes go through this module rather than calling the SDK directly:
- `callJson` — single call, must return one JSON object, retries once on malformed JSON.
- `callJsonWithTools` — same, but with server-side tools (web_search / web_fetch); resumes on `pause_turn`, optionally streams search events via `onEvent` for the live progress UI.
- `guard(req, res)` — request gate every route calls first: POST-only, same-origin, live-mode check, per-IP hourly rate limit.
- `sendError(res, err)` — maps `UserFacingError` to its status/message, else 500s generically (never leaks internals).
- Model selection: `MODEL` / `MODEL_FAST` env vars override the Sonnet 5 / Haiku 4.5 defaults.

Untrusted input rule (profiles, fetched page content, web search results) is always treated as data, never instructions — this is stated explicitly in every route's system prompt and in `fetchPage.js`, which also blocks internal/private addresses before fetching a user-pasted link.

## Data shape

`corpus/schema/opportunity.schema.json` is the canonical shape for an opportunity. Every date/fee an opportunity carries must trace back to a verbatim quote from the source page (PRD §7) — this is what `verify-grounding` re-checks and what `corpus/grounding-report.md` records. Status (open/attend-only/watch) is derived from dates in code, not asserted by the model.

## Deploy

Vercel project; `prototype/` is `outputDirectory`, `api/*.js` are the serverless functions (see `vercel.json` for per-function `maxDuration`). Required env var: `ANTHROPIC_API_KEY`. Optional: `GV_MODEL`, `GV_MODEL_FAST`, `GV_RATE_LIMIT_PER_HOUR`.
