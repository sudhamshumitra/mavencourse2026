---
name: find-funding
description: For one opportunity and one researcher, list every realistic source of money to attend — the venue's own travel grants, bursaries and waivers, plus external funders found from the person's country, field and career stage (national research councils, university/UGC travel support, trusts, society early-career funds) — each with eligibility, deadline, and how it sequences against the conference deadlines. Use for every opportunity in a feed, and to maintain the reusable corpus/funders/<country>.json registry.
---

# find-funding — the funding part of the Brief Composer (PRD §6)

## Purpose
Many researchers see a USD fee and stop. But money often exists in two places people don't look: the **venue's own** grants (often on a separate page, and often only open after acceptance), and **external** schemes tied to the researcher's country, field or institution. This skill finds both and, most importantly, **puts them in order**: which one you apply for when, and which one needs another to come first.

## When to use
- For each opportunity in a persona's feed, after `extract-opportunity`.
- When a new country or field appears (to seed `corpus/funders/<country>.json`).
- Periodically, to refresh deadlines in the funder registry.

## Inputs
- `corpus/opportunities/<id>.json`: especially `funding[]` (the venue's own), dates, location, type.
- `corpus/profiles/<slug>.json`: country, passport, career stage, fields.
- `corpus/funders/<country>.json` if it exists. **Reuse it before searching.**

## Process
1. **The venue's own:** start with `opportunity.funding`. If it's empty but the site has a "grants", "travel support", "bursaries", "scholarships" or "diversity" page, fetch it (≤ 2 fetches) and add the entries, with verbatim `source_quote` for amounts and deadlines. Tag each one `"source": "venue"`.
2. **External, derived by rule rather than a fixed list:** work out the categories that usually exist for someone with this country, career stage and field, then find the current schemes in each:
   - (a) **National research council(s)** for the person's field in their country, e.g. the social-science council's travel grant for international conferences. Search `"<country> <field> research council travel grant international conference"`.
   - (b) **Higher-education regulator or ministry** schemes for doctoral students' conference travel.
   - (c) **The home institution:** most universities have a PhD conference-travel fund. Record it as a category ("check your university's research/travel office"), because the specific institution is unknown.
   - (d) **Bilateral or regional trusts and foundations** connecting the home country to the destination country (e.g. UK–India or US–India cultural and educational trusts, Europe–Asia programmes).
   - (e) **Field societies' early-career or Global South travel funds** (the society that runs the venue, plus the person's own disciplinary association).
   - (f) **Destination-specific:** host-country funding for international early-career participants, if any.
3. For each external scheme: current page URL, eligibility summary, amount note, deadline or cycle (e.g. "rolling, ≥ 8 weeks before travel"), and **`requires`**, meaning what it needs first (acceptance letter, supervisor endorsement, invitation). Tag it `"source": "external"`.
4. **Check eligibility** against the profile: `eligible: yes | likely | no | check`, with one line of why.
5. **Sequence:** turn each item into dated steps in relation to the opportunity's deadlines. For example, "Apply after acceptance (expected ~April) and at least 8 weeks before the 14 Oct travel date → window Apr 15–Aug 15." These become tracker entries.
6. Save any scheme that isn't venue-specific to `corpus/funders/<country>.json` (name, url, categories, eligibility, cycle, last_checked), so the next opportunity reuses it.

## Output
Written to `corpus/briefs/<profile>/<id>.json` under `funding`:
```jsonc
[
  { "name": "Student travel grant", "source": "venue", "type": "travel_scholarship",
    "amount_note": "up to USD 500", "deadline": "2027-06-01", "requires": "accepted paper",
    "eligible": "yes", "why": "PhD student presenting", "grounded": true, "source_quote": "…", "source_url": "…",
    "sequence_note": "Opens with acceptance in April; apply by 1 June." },
  { "name": "<National council> international conference travel grant", "source": "external", "type": "travel_scholarship",
    "amount_note": "airfare + registration (partial)", "deadline": null, "cycle": "apply ≥ 2 months before travel",
    "requires": "acceptance letter + institutional endorsement", "eligible": "likely", "why": "Indian PhD in social sciences",
    "grounded": true, "source_url": "…", "sequence_note": "Needs the acceptance letter: apply the week it arrives." }
]
```

## Constraints
- **Never apply, register or submit** anything for the person. List and sequence only.
- Every item has a `source_url` to the funder's own page. No URL means it's not listed.
- Mark an amount or deadline `grounded: true` only with a verbatim quote. Scheme descriptions paraphrased from a funder's page are fine, but don't state an amount you didn't see.
- Don't overpromise. Use "likely eligible", never "you will get".
- Don't invent schemes. If a category (a–f) turns up nothing current, say "none found" for it.

## Edge cases
- **The scheme's page is outdated** (a past year's circular): list it with `"stale": true` and the latest year seen.
- **Journal calls:** only APC waivers or discounts apply (many publishers waive for low-income countries). Travel funding isn't relevant.
- **Fellowships and summer schools** that already cover costs: say so and skip external travel funding unless travel isn't covered.

## Runtime notes (Phase 2)
The venue part runs per click, cached per (opportunity, profile). The external part mostly reads `corpus/funders/<country>.json`, refreshed monthly by this skill. Capable model for eligibility reasoning.
