---
name: estimate-cost
description: Estimate what attending (or publishing in) one opportunity would really cost a specific person, in their home currency, as honest ranges with listed assumptions — registration tier, return travel, accommodation, visa fee, FX. Use for every opportunity in a persona's feed, and again when fees, the profile's home city, or exchange rates change.
---

# estimate-cost — the cost part of the Brief Composer (PRD §6)

## Purpose
"Can I afford this?" is the question that decides most Global South applications, and no call page answers it. The price on the page is in USD or EUR, for a tier you may or may not qualify for, and leaves out flights, nights and the visa. This skill puts together the real number, as a **range**, in the person's currency, and says what it assumes.

## When to use
- After `extract-opportunity`, for each (opportunity, profile) pair in the feed.
- When the profile's city or currency changes, when fees are published, or when the FX rate is more than a week old.

## Inputs
- `corpus/opportunities/<id>.json`: fees (with tiers), location, dates, format.
- `corpus/profiles/<slug>.json`: home city and country, passport, currency, career stage, `max_cost`.
- (Optional) the funding list from `find-funding`, used for the `net_note`.

## Process
1. **Registration:** pick the tier this person qualifies for. Order of preference: student + Global South / low-middle-income band → student → Global South → standard. Say which tier and why. If membership is required to present, add the student membership fee as its own line. Convert at today's FX.
2. **FX:** look up today's mid-market rate for each currency needed (search "USD to INR today" or use `https://open.er-api.com/v6/latest/USD`). Record `{ "USD": 83.9, "as_of": "2026-09-19", "source": "<url>" }`. Rates live in `corpus/fx.json` so all opportunities in one run use the same rates.
3. **Travel:** a return economy fare from the nearest major airport to the host city, booked 8–10 weeks ahead. Search the route for a typical fare range. If you can't find one, use the regional heuristic below and mark it `inferred`.
   - Within India: ₹6k–₹14k.
   - India ↔ SE Asia / Gulf: ₹22k–₹40k.
   - India ↔ Europe / UK: ₹45k–₹85k.
   - India ↔ US East / Canada: ₹75k–₹1.3L.
   - India ↔ US West / Australia: ₹85k–₹1.4L.
4. **Accommodation:** nights = conference days + 1. Low end: hostel or university housing (search the city). High end: a mid-range hotel. Use local currency, then convert.
5. **Visa:** fee from the destination's **official** fee page for this passport (e.g. US MRV, UK Standard Visitor, Schengen short-stay), plus the VFS/service charge if it's typical. For visa-free or e-visa destinations, use that fee. Link the official page.
6. **Online or journal calls:** only the registration fee or APC. Travel, accommodation and visa are 0. If an APC is optional, the range runs from 0 to the APC.
7. **Totals:** `low` = sum of the lows, `high` = sum of the highs, both rounded to the nearest ₹500. Compare `high` with `max_cost`.
8. **`net_note`:** if venue or external funding could apply, say in one sentence what the realistic out-of-pocket range becomes and what it depends on (for example, "if the travel grant comes through").

## Output
Written into `corpus/briefs/<profile>/<id>.json` under `cost_estimate`:
```jsonc
{
  "currency": "INR", "low": 98500, "high": 142000,
  "breakdown": {
    "registration": { "low": 12600, "high": 12600, "note": "Student tier, USD 150", "grounded": true },
    "travel": { "low": 60000, "high": 95000, "note": "HYD–LHR return, 8–10 weeks ahead", "grounded": false },
    "accommodation": { "low": 16000, "high": 28000, "note": "4 nights, university halls to mid-range hotel", "grounded": false },
    "visa": { "low": 14500, "high": 16500, "note": "UK Standard Visitor + VFS", "grounded": true, "source": "https://www.gov.uk/..." }
  },
  "assumptions": ["…", "USD→INR 83.9 on 2026-09-19 (open.er-api.com)", "Excludes meals, local transport, insurance"],
  "over_budget": false,
  "net_note": "With the student travel grant (up to USD 500 ≈ ₹42k), out-of-pocket drops to roughly ₹56k–₹1L."
}
```

## Constraints
- **Always a range, never a single precise number.** False precision is the failure this skill exists to prevent.
- Every line says whether it's grounded (came from a page) or inferred (estimated). Registration and visa should be grounded whenever possible.
- Never book or hold anything. Search results for fares are evidence, not reservations.
- Don't assume a discount tier the person hasn't shown they qualify for. If it's unclear, put both tiers in the range and say why.

## Edge cases
- **Fees not yet published:** use last edition's fees, grounded to the archive page if found, and label "last year's fee".
- **Hybrid events:** show the in-person estimate and add the online fee in the `net_note`.
- **Home city is the host city:** travel is 0 and accommodation is 0.

## Runtime notes (Phase 2)
Deterministic arithmetic in code. The model only picks the tier and writes assumptions (capable model, short). FX comes from an FX API, fares from a heuristic table plus an optional search.
