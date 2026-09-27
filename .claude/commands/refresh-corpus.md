---
description: Extract a batch of candidate URLs with parallel opportunity-extractor subagents, then audit them with grounding-auditor.
argument-hint: <profile-slug> | <url> [<url> …]
allowed-tools: Read, Edit, Agent, Bash(git status:*), Bash(git diff:*), Bash(node scripts/build-feed.mjs)
---

Run this batch, in order:

1. **Resolve URLs.** If `$1` looks like a profile slug (e.g. `ananya`), read
   `corpus/candidates/<slug>.json` (falling back to `corpus/candidates.json` if its `profile_id`
   matches) and take every candidate that has no `corpus/opportunities/<id>.json` yet. Otherwise
   treat every argument in `$ARGUMENTS` as a literal URL to extract.

2. **Pre-flight.** Run `git status --short` — it must be clean before you touch anything; if it
   isn't, stop and tell the user. List the hosts you're about to fetch. If any host is not already
   covered by a `WebFetch(domain:…)` entry in `.claude/settings.json`, stop and ask the user to add
   them in one settings edit, rather than triggering a separate permission prompt per fetch.

3. **Read `memory/fetch-notes.md` once** yourself and include the row matching each URL's host (if
   any) directly in that worker's prompt, so each `opportunity-extractor` doesn't have to re-derive
   it (it will also read the file itself as a fallback).

4. **Fan out.** Launch `opportunity-extractor` subagents in parallel, at most 3 at a time, one URL
   each, all in a single message per batch of 3.

5. **Collect memory updates.** Gather every `MEMORY:` line from the workers' reports and apply them
   to `memory/fetch-notes.md` yourself — replacing an existing row for the same host, never adding
   a duplicate. You are the single writer here.

6. **Audit.** Run exactly one `grounding-auditor` over just the opportunity ids you wrote in step 4
   (not the whole corpus, unless the user asked for that). Then run
   `node scripts/build-feed.mjs` and report `git diff --stat` so the user can see what changed.

**Standing rule:** never fan out cost, funding, or brief work (`estimate-cost`, `find-funding`,
`compose-brief`) — all three merge into the same `corpus/briefs/<profile>/<id>.json` file per
(profile, opportunity), and parallel writes there silently lose data. This command is for
extraction and auditing only.
