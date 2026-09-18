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
| **Live demo** | 🔗 **[mavencourse2026.vercel.app](https://mavencourse2026.vercel.app)** |
| **PRD** | ✅ [PRD.md](PRD.md) |
| **Week 1** | ✅ Clickable prototype on hand-written fixtures. Tagged [`module-1-prototype`](../../tree/module-1-prototype) |
| **Week 2 (Module 2)** | ✅ 7 Claude Code skills in [`.claude/skills/`](.claude/skills/). They built ready-made shortlists for 8 example researchers ([`corpus/`](corpus/)) and power the live search. See **[SKILLS.md](SKILLS.md)** |
| **Next** | Accounts (username and password) so profiles and saved calls persist, a database instead of files, and a weekly automatic refresh |

## The prototype

Two ways in:

- **See an example.** One of 8 fictional researchers opens at random, each with a ready-made, fully checked shortlist built by the skills: India, Nigeria, Brazil, Pakistan, Kenya, Indonesia, Bangladesh and Ghana, across career stages from Master's to lecturer, with costs in their own currency and their own country's funders.
- **Your own research.** Describe your work (or pick topics), choose your goals, and Grapevine **searches the web live** (about a minute, showing each search as it runs). Each result gets a quick score; opening one runs the full check (about a minute): it reads the call page and works out dates, cost, funding and visa.

| Surface | What you can do |
|---|---|
| Welcome | What the tool does, in three steps |
| Onboarding (2 steps) | Describe your research **or** browse topics, side by side. Pick up to 3 goals (meet people, get published, a well-known conference, keep it affordable, feedback). Set country, passport, currency, budget (or no limit), format and visas. Nothing is pre-selected |
| Shortlist | Ranked like an index: score with five part-score bars, a link to the call page, and the same four facts every time (next deadline · cost · funding · visa) |
| "Is it worth it?" | A verdict card with four key facts, then tabs: Worth it? · Deadlines · Cost & funding · Can I go? · About. Every verified fact has a "source" toggle |
| Tracker | Saved deadlines by month, with `.ics` export |
| Profile | Goals and the ranking weights they produce; "Not for me" feedback visibly changes them |
| How it works | Plain-language FAQ, including exactly how the score is calculated |

> ⚠️ The calls are real, but always check the source page before acting. Visa notes are advisory only.

### Run it locally

- **Just the site (no live AI):** `npx serve prototype`
- **With the live API:** put `ANTHROPIC_API_KEY=…` in `.env.local` (git-ignored), then `npx vercel dev`

After re-running skills: `node scripts/build-feed.mjs` (rebuilds the example shortlists) and `node scripts/build-prompts.mjs` (updates the live prompts from the SKILL.md files).

### Deploy

Vercel: `prototype/` is the site, `api/` holds the server functions (topics, scout, extract, brief). Set `ANTHROPIC_API_KEY` in the project's environment variables. Optional: `GV_MODEL` / `GV_MODEL_FAST` to change models (defaults: Claude Sonnet 5 / Claude Haiku 4.5).

## What's here

- **[SKILLS.md](SKILLS.md)**: the Module 2 write-up covering the skills, before/after, and results.
- **[.claude/skills/](.claude/skills/)**: 7 skills, one per step in the PRD's "How it works".
- **[corpus/](corpus/)**: skill output: 8 profiles, candidates, extracted opportunities, briefs, funder lists by country, grounding report.
- **[api/](api/)**: server functions that send the SKILL.md files to Claude.
- **[prototype/](prototype/)**: `index.html` · `styles.css` · `app.js` · `data.js` · `corpus.js` (generated).
- **[scripts/](scripts/)**: `build-feed.mjs` (corpus → prototype) and `build-prompts.mjs` (skills → API prompts).
- **[PRD.md](PRD.md)**: the product specification.

## Stack

Static site + Vercel serverless functions · Anthropic Claude API (Sonnet 5 and Haiku 4.5, with web search and web fetch; no agent framework) · planned: Postgres for accounts and a weekly refresh via Vercel Cron.
