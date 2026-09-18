# Grapevine

**An AI agent that finds academic opportunities a humanities researcher would otherwise never hear about, and tells them whether it's worth going.**

> **Module 2 submission → [SKILLS.md](SKILLS.md)**: the skills, what they produced, and before/after.

---

## The problem

Ask a PhD student in media studies, gender studies or sociology how they find out about conferences, journal special issues and travel scholarships. The answer is almost always some version of *someone told me*: a supervisor's forwarded email, a senior's passing mention, a screenshot in a WhatsApp group. That's the grapevine, and it only reaches you if you're already attached to it. There's no central place to look, and nothing that tells you whether the opportunity you just found is worth your time and money.

Grapevine is that missing place, and the missing judgement. It gathers opportunities into one feed tuned to your research. For each one it answers **"is it worth going?"**: how well it fits, how well regarded it is, who you'd meet, what you'd come away with, and whether you can actually get there. That last part covers cost in your currency, visa, and the funding you could apply for, both from the organisers and from elsewhere.

## Status

| | |
|---|---|
| **PRD** | ✅ [PRD.md](PRD.md) |
| **Week 1** | ✅ Clickable prototype on hand-written fixtures. Tagged [`module-1-prototype`](../../tree/module-1-prototype) |
| **Week 2 (Module 2)** | ✅ 7 Claude Code skills in [`.claude/skills/`](.claude/skills/). They produced the real corpus in [`corpus/`](corpus/), which now drives the prototype. See **[SKILLS.md](SKILLS.md)** |
| **Next** | Next.js + Postgres backend. The same SKILL.md files become the app's runtime prompts |

## The prototype

A single-page prototype of the whole user flow, now running on **real calls gathered by the skills** for a fictional persona: **Ananya Rao**, a 2nd-year PhD in media studies in Hyderabad, working on caste and digital media. She has an Indian passport and INR costs, and she'd rather avoid long visa queues.

| Surface | What you can do |
|---|---|
| Welcome | See what the tool does in three steps |
| Onboarding (2 steps) | Describe your research in plain words **or** browse topics by field, side by side. Pick what you want out of it (networking, publication, a well-known venue, low cost, feedback). Set passport, currency, budget and visa appetite. ORCID is optional |
| Feed | Real opportunities ordered by a **"worth it" score** weighted by your goals, with cost ranges in INR, funding counts, visa flags, an exploration pick from a neighbouring field, and paste-a-link |
| Brief | Five sub-scores with reasons, "why go / watch out", deadlines in the order to act (including funding and visa start dates), cost breakdown, funding from the venue and from elsewhere, and a source toggle on every verified fact |
| Tracker | Saved deadlines by month, with `.ics` export |
| Profile | Goals and the ranking weights they produce, plus dismiss-with-reason feedback that visibly changes them |

> ⚠️ The calls are real, but always check the source page before acting. Visa notes are advisory only.

### Run it locally

No build step and no dependencies. It uses ES modules, so serve it over HTTP:

```bash
npx serve prototype
```

To rebuild the feed after rerunning skills: `node scripts/build-feed.mjs --profile ananya`.

### Deploy

A static site on Vercel. [`vercel.json`](vercel.json) sets `prototype/` as the output directory and adds CSP and security headers. No secrets.

## What's here

- **[SKILLS.md](SKILLS.md)**: the Module 2 write-up covering the skills, before/after, and results.
- **[.claude/skills/](.claude/skills/)**: 7 skills, one per agent in the PRD.
- **[corpus/](corpus/)**: skill output: profile, candidates, extracted opportunities, briefs, funders, grounding report.
- **[prototype/](prototype/)**: `index.html` · `styles.css` · `app.js` · `data.js` · `corpus.js` (generated).
- **[scripts/build-feed.mjs](scripts/build-feed.mjs)**: merges `corpus/` into the prototype.
- **[PRD.md](PRD.md)**: the product and technical specification.

## Planned stack

Next.js (App Router) + TypeScript on Vercel · Postgres + Prisma · Anthropic Claude API with tool use (no agent framework) · OpenAlex, a web-search API and an FX API · Vercel Cron for a weekly refresh.
