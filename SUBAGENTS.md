# Module 3: two subagents for Grapevine

## Before

Two steps in Grapevine's pipeline need to be done by something that doesn't already know the
answer:

- **extract-opportunity** reads one call page (a conference or fellowship listing) and writes
  down its facts — deadlines, fees, funding.
- **verify-grounding** goes back and checks those facts are actually on the page.

Both used to run as skills — just instructions followed in the same ongoing conversation. That
meant the "checker" had already seen everything the "extractor" wrote, and everything else in the
conversation besides. It wasn't independently checking anything, and running several extractions
side by side wasn't safe either, since they'd all share the same context and could interfere.

## The two agents

I split these into two separate subagents. Each one only gets exactly what it needs for its own
job, and nothing else:

- **[opportunity-extractor](.claude/agents/opportunity-extractor.md)** — given one link, reads
  that page, writes the facts to a file. It never sees a researcher's profile, other opportunities,
  or anything but that one page.
- **[grounding-auditor](.claude/agents/grounding-auditor.md)** — given a list of already-extracted
  opportunities, re-fetches each source page itself and checks the facts are really there. It never
  sees what the extractor wrote down — it has to find each fact on the page on its own.

Both still follow the same rules as the original skills (`.claude/skills/extract-opportunity` and
`.claude/skills/verify-grounding`) — the agent files don't repeat those rules, they just point to
them, so there's one place the rules live.

Because they don't share context, several extractors can run at once on different pages without
stepping on each other. The one thing that still can't run in parallel: cost, funding and brief
steps, since those three all write into the same shared file per opportunity — running them at once
would cause one to overwrite another's work.

## How memory works

Subagents don't remember anything between runs — each one starts fresh. So there's a small shared
file, [`memory/fetch-notes.md`](memory/fetch-notes.md), where they leave notes for whoever runs
next: one row per website, saying things like "this site blocks normal fetching, use this
workaround instead." Never facts or dates — just how to get the page.

The extractor only ever reports what it learned; it doesn't write to the file itself, so two
extractors running at the same time can't overwrite each other's notes. Whoever's coordinating
(the `/refresh-corpus` command, or the auditor when it runs alone) applies the note afterward.

## Testing

- Re-ran the extractor on a page it had already extracted and diffed the result — only the date
  changed, nothing else was rewritten.
- Planted two fake errors (a wrong quote, a wrong date) and ran the auditor — it caught both.
- Ran three extractors on three different pages at the same time — each wrote only its own file,
  no interference.
- Confirmed none of this touches the live website — these subagents only run locally while
  building the data.

## Files

- `.claude/agents/opportunity-extractor.md`, `.claude/agents/grounding-auditor.md` — the two agents
- `.claude/commands/refresh-corpus.md` — runs a batch of extractions, then one audit
- `memory/` — the shared notes file and its rules
