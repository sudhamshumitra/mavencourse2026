# Grapevine

**An AI agent that finds academic opportunities a humanities researcher would otherwise never hear about — and tells them whether it's worth going.**

---

## The problem

Ask a PhD student in media studies, gender studies or sociology how they find out about conferences, journal special issues and travel scholarships, and the answer is almost always some version of *someone told me* — a supervisor's forwarded email, a senior's passing mention, a screenshot in a WhatsApp group. That's the grapevine, and it only reaches you if you're already attached to it. There is no centralised place to look, and nothing that tells you whether the opportunity you just found is worth your time and money.

Grapevine is that missing place, and the missing judgement. It gathers opportunities into one feed tuned to your research, and for each one produces a decision brief: is this a fit, are you eligible, when are the deadlines in what order, what will it cost in your currency, and is there funding to cover it.

## Status

| | |
|---|---|
| **PRD** | ✅ Complete — [PRD.md](PRD.md) |
| **Prototype** | ✅ Week 1 — clickable UX prototype, no backend — [`prototype/`](prototype/) |
| **Demo link** | 🔗 **[maven-course-project.vercel.app](https://maven-course-project.vercel.app)** |

## The week 1 prototype

A clickable, single-page prototype of the whole user flow. Every screen is real and navigable; nothing calls an API. All content is hand-written fixture data in [`prototype/data.js`](prototype/data.js), so the flow can be demonstrated end to end without keys, a database or cost.

**What it covers**

| Surface | What you can do |
|---|---|
| Onboarding | Bootstrap a profile from an ORCID (canned), edit drafted topics and their weights, set geography, passport, currency and constraints |
| Agent pipeline | Watch the six-step discovery run from §6 of the PRD — querier, explorer, extraction, eligibility, ranker, verification judge |
| Feed | Ten ranked opportunities with fit scores and rationales, filters, a reserved exploration slot, a flagged predatory venue, and paste-a-link |
| Brief | Fit rationale, sequenced deadlines with dependencies, cost breakdown in the user's currency, funding, visa advisory, and a verified / inferred label on every high-stakes field |
| Tracker | Saved deadlines grouped by month, with `.ics` export carrying reminders and grounding notes |
| Feedback | Dismiss-with-reason, and a visible diff of what it changed in the profile |

**Persona:** Rafael Duarte Lima, third-year PhD at UFRJ, working on oral history and memory in Rio's housing-rights movements. **Demo spine:** IOHA 2027 in Chicago — one case that exercises semantic fit with zero keyword overlap, a Global-South fee tier, a bursary that only opens after acceptance, USD costs rendered in BRL, and a US visa whose interview wait is longer than the gap between acceptance and the conference.

> ⚠️ Deliberately not real. Venues, deadlines, fees and visa notes are plausible composites. In the product these come from the Extraction Workers and Verification Judge described in [§7 of the PRD](PRD.md#7-system-architecture).

### Run it locally

No build step and no dependencies — but it uses ES modules, so it must be served over HTTP rather than opened from the filesystem:

```bash
npx serve prototype     # then open the printed URL
```

### Deploy

Configured for Vercel as a static site — [`vercel.json`](vercel.json) sets `prototype/` as the output directory and adds CSP and related security headers. No build command, no environment variables, no secrets.

```bash
npx vercel --prod
```

## What's here

- **[PRD.md](PRD.md)** — full product and technical specification: problem definition, agent design and autonomy boundaries, system architecture, data schemas, security model, evaluation plan, and the phased build plan.
- **[prototype/](prototype/)** — the week 1 clickable prototype. `index.html` · `styles.css` · `app.js` (routing and interaction) · `data.js` (all fixture content).

## Planned stack

Next.js (App Router) + TypeScript on Vercel · Postgres + Prisma · Anthropic Claude API with tool use (no agent framework) · OpenAlex, a web-search API and an FX API as external services · Vercel Cron for weekly refresh.

Reasoning for each choice is in [§7 of the PRD](PRD.md#7-system-architecture).
