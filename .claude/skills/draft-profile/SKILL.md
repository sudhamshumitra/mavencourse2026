---
name: draft-profile
description: Turn a few lines of plain text about someone's research (or a pasted abstract, or an optional ORCID iD) into a Grapevine research profile JSON, with weighted topics, the fields and adjacent fields they belong to, goals, and practical constraints. Use when onboarding a new user or test persona, or before scouting when no profile exists yet.
---

# draft-profile — Profile Bootstrapper (PRD §6)

## Purpose
Everything downstream in Grapevine is scored against a profile: scouting, fit, feasibility, funding. A good profile does more than list what the person literally said. It says **which fields they belong to and which fields sit next to theirs**, because that is how discovery reaches venues the person would never have searched for.

## When to use
- A new user or test persona needs a profile.
- `scout-opportunities` is asked to run and `corpus/profiles/` has no profile for the person.
- The onboarding "describe your research" box. In the app (Phase 1B) this file is the prompt behind that box.

## Inputs
- **Required:** 1–5 sentences of plain text *or* a pasted abstract.
- **Optional:** ORCID iD (look the works up on OpenAlex: `https://api.openalex.org/authors/orcid:<id>`), career stage, home country, passport, currency, budget, goals.

## Process
1. **Topics:** extract 4–8 research topics in the person's own vocabulary. Weight them 0–1: the core object of study gets 0.9–1.0, the method or lens 0.7–0.85, secondary interests 0.5–0.65.
2. **Fields:** name 1–3 disciplinary homes (e.g. "South Asian studies", "media & communication").
3. **Adjacent fields:** name 2–4 fields that would *welcome* this work even though the person might not identify with them. Reason from the object of study, not the discipline: someone studying caste on Instagram is also doing *internet studies* and *platform studies*, even if they call themselves a South Asianist.
4. **Citation neighbourhood:** 3–6 scholars whose work the profile clearly sits near. Take them from ORCID/OpenAlex if available. Otherwise mark them `"inferred": true`.
5. **Practicalities:** fill in career stage, geography, passport, currency, budget (in home currency), format, and visa tolerance. Use what's given. Put sensible defaults (INR for India, `visa_tolerance: prefer_none` for a Global South passport unless stated) in `drafted_fields` so the UI can show them as editable guesses.
6. **Goals:** pick up to 3 from `networking | publication | visibility | low_cost | feedback`. Infer them from the text ("I need to publish before the job market" → `publication`). If there are no signals, default to `["networking", "feedback", "low_cost"]` for PhD students.
7. Write `corpus/profiles/<slug>.json`.

## Output shape
PRD §7 Profile, extended:
```jsonc
{
  "id": "p_<slug>", "name": "string", "fictional": true|false, "orcid": null,
  "affiliation": "string", "career_stage": "phd", "year": 2,
  "research_summary": "one sentence, third person",
  "topics": [{ "term": "caste & digital media", "weight": 0.95 }],
  "fields": ["South Asian studies"], "adjacent_fields": ["internet studies"],
  "citation_neighborhood": [{ "name": "string", "inferred": true }],
  "geography": { "country": "India", "city": "Hyderabad", "passport": "India" },
  "currency": "INR",
  "constraints": { "max_cost": 150000, "months_available": ["Jan","Jun","Jul","Dec"], "visa_tolerance": "prefer_none", "format": "any" },
  "goals": ["networking", "publication"],
  "drafted_fields": ["goals", "constraints.max_cost"],
  "profile_type": "academic"
}
```

## Constraints
- **Every inference is a draft.** Anything not stated goes in `drafted_fields`. Never assert an identity attribute (caste, religion, gender, nationality) that the person didn't state. Research *topics* about caste are not a statement about the person's caste.
- Passport is used only for visa and fee-tier logic. Never infer it from a name.
- If a persona is invented for a demo, set `"fictional": true` and make sure it doesn't match a real, identifiable person's name *and* affiliation together.

## Edge cases
- **Very short input** ("I work on memes"): produce 2–3 topics and ask for one more sentence rather than padding the profile out.
- **Interdisciplinary input:** keep all fields. Don't force one home.
- **An ORCID that doesn't resolve:** fall back to the text and say so.

## Example
**Input:** "2nd-year PhD in media studies in Hyderabad. I study how Dalit and Bahujan creators use Instagram and YouTube to build counterpublics, and how platform moderation treats caste speech. Also interested in Partition memory online."
**Output (abridged):**
- topics: caste & digital media 0.95 · Dalit/Bahujan counterpublics 0.9 · content moderation & caste speech 0.8 · creator cultures 0.7 · Partition memory online 0.55
- fields: South Asian studies, media & communication
- adjacent fields: internet studies, platform studies, memory studies

## Runtime notes (Phase 1B)
Cheap model (Haiku). Structured output. Keep `max_tokens` around 800. With no API key, the app falls back to keyword-matching the text against the topic vocabulary in `prototype/data.js`.
