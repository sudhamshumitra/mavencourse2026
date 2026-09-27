# Grounding Report

## Run 1 — 2026-09-19 (9 opportunities)

### Summary
- Opportunities checked: 9
- Grounded items checked (deadlines + fees + funding): 19
- Pass: 17
- Fail: 2 (both `fail_missing`)
- Pass rate: 17/19 = 89.5%
- Unreachable: 0 (asianstudies.org and the msalund2027.dryfta.com/grants page returned HTTP 403 to direct fetch; both were successfully re-fetched via the `https://r.jina.ai/<url>` reader proxy, so no item was left `unreachable`)

### Per-opportunity results

| Opportunity | Field | Stored value | Result | Note |
|---|---|---|---|---|
| madison-sa-2026 | deadline: abstract | 2026-03-01 | pass | "Symposium Proposals are due March 1st" — verbatim on page |
| madison-sa-2026 | deadline: abstract | 2026-04-05 | pass | "Panels, Single Papers, and Round Table Proposals are due April 5th." — verbatim, same sentence |
| madison-sa-2026 | deadline: early_bird | 2026-10-01 | pass | "Early bird registration is open until October 1st." — verbatim |
| madison-sa-2026 | deadline: registration | 2026-10-10 | pass | "The last day to register online is October 10th." — verbatim |
| madison-sa-2026 | fee: Non-Student | $300 USD | pass | "Non-Student: $300" verbatim; matches current (early) tier shown on page |
| madison-sa-2026 | fee: Student | $150 USD | pass | "Student: $150" verbatim |
| madison-sa-2026 | fee: Emeritus | $150 USD | pass | "Emeritus: $150" verbatim |
| samcs-2027 | deadline: abstract | 2026-10-10 | pass | "submit your proposal abstract via the form below by October 10, 2026" — verbatim |
| csaa-2026 | — | — | n/a | No deadlines, fees, or funding items present (all lists empty); nothing to check |
| aas-sa-dissertation-workshop | deadline: full_paper | 2026-05-30 | pass | "All application materials must be submitted via the AAS application portal by May 30, 2026." — verbatim (via r.jina.ai proxy after direct 403) |
| aas-sa-dissertation-workshop | deadline: scholarship | 2026-05-30 | pass | "Letters of recommendation must be emailed directly by your advisor to grants@asianstudies.org no later than May 30, 2026." — verbatim |
| aas-sa-dissertation-workshop | funding: AAS South Asia Council Dissertation Workshop Grant | grant covers airfare/registration/lodging/meals | **fail_missing** | Stored quote capitalizes "Lowest"; page bullet reads lowercase "lowest economy-class airfare...". Downgraded. |
| msa-lund-2027 | deadline: abstract | 2026-10-15 | pass | "PLEASE SUBMIT PROPOSALS NO LATER THAN 15 OCTOBER 2026" — verbatim |
| msa-lund-2027 | funding: MSA Lund 2027 travel grants and fee waivers | — | pass | "A limited number of travel grants and fee waivers will be available for the conference." — verbatim on /grants page (via r.jina.ai proxy after direct 403) |
| msa-forward-2027 | — | — | n/a | No deadlines, fees, or funding items present; nothing to check |
| caste-journal-open-call | fee: Article Processing Charge | $0 USD | pass | "J-CASTE is a free Open Access journal with no publication fees." — verbatim |
| gps-caste-corporeality-si | deadline: abstract | 2026-09-20 | pass | "Proposals: 20 September 2026 – send by email to gps-proposals@psi-web.org" — verbatim |
| gps-caste-corporeality-si | deadline: full_paper | 2026-12-15 | **fail_missing** | Stored quote "First drafts: 15 December 2026" is truncated; page reads "First drafts for editorial review: 15 December 2026". Date value still correct. Downgraded. |
| sai-heidelberg-scholarship | deadline: scholarship | 2026-12-01 | pass | "The application deadline is 01 December 2026, 23:59 CET" — verbatim |
| sai-heidelberg-scholarship | funding: Travel expense reimbursement | up to EUR 1,500 | pass | "reimbursement of international travel expenses of up to EUR 1,500" — verbatim |
| sai-heidelberg-scholarship | funding: Monthly scholarship stipend and accommodation | EUR 1,200/month | pass | "monthly scholarship instalment of EUR 1,200" — verbatim |

### Sanity checks on ungrounded items
No `grounded: false` deadlines existed in these 9 files prior to this run, so the "deadline before today" and "ordering impossibility" checks had nothing to flag going in. No ordering impossibilities (e.g. full paper before abstract) were found among the grounded items either — `gps-caste-corporeality-si`'s full_paper (2026-12-15) correctly follows its abstract (2026-09-20).

### Failure log

| Opportunity | Item | Result | Likely cause |
|---|---|---|---|
| aas-sa-dissertation-workshop | funding: AAS South Asia Council Dissertation Workshop Grant | fail_missing | Paraphrase/case drift — extractor capitalized "Lowest" at the start of the quoted fragment where the source bullet is lowercase mid-sentence ("...will receive a grant to cover the costs of: lowest economy-class airfare..."). Not a value error, purely a quote-fidelity error. Downgraded to `grounded: false`; value retained since page still supports it. |
| gps-caste-corporeality-si | deadline: full_paper (2026-12-15) | fail_missing | Truncated quote — extractor dropped "for editorial review" from the source line "First drafts for editorial review: 15 December 2026," leaving an incomplete fragment that doesn't match verbatim. Date value is otherwise correct and current. Downgraded to `grounded: false`; value retained since page still supports it. |

## Run 2 — 2026-09-19 (4 opportunities)

### Summary
- Opportunities checked: 4 (aoir-2026, ecsas-2027, iamcr-2027, basas-2027)
- Grounded items checked (deadlines + fees + funding + standing_signals): 28
- Pass: 27
- Fail: 1 (`fail_mismatch`)
- Pass rate: 27/28 = 96.4%
- Unreachable: 0

### Per-opportunity results

| Opportunity | Field | Stored value | Result | Note |
|---|---|---|---|---|
| aoir-2026 | deadline: abstract | 2026-03-01 | pass | "Proposals Due: 1 March 2026" — verbatim on linked CFP page (aoir.org/aoir2026/aoir2026cfp/) |
| aoir-2026 | deadline: scholarship | 2026-07-10 | pass | "Application Deadline: 10 July 2026" — verbatim on Access Grant page; stored quote "10 July 2026" is a verbatim substring |
| aoir-2026 | deadline: early_bird | 2026-08-01 | pass | "Available until August 1st, 2026 @ Midnight AOE." — verbatim on source_url |
| aoir-2026 | deadline: registration | 2026-10-14 | pass | "Available between August 1st and October 14th, 2026." — verbatim on source_url |
| aoir-2026 | fees: 17 tiers (early_bird/standard × student/professional × majority-world/standard × member/nonmember, + lifetime_member) | $40–$800 USD | pass (all 17) | Every tier and amount re-confirmed on source_url's registration fee table across two independent fetches; e.g. "Student, Majority World: $40/$55", "Professional: $500/$670", "Registration for Lifetime Members: $450" |
| aoir-2026 | funding: AoIR 2026 Access Grant | up to $2,000 / $500 USD, deadline 2026-07-10 | pass | "up to 5 Access Grants of up to 2,000 USD each, and up to 5 Access Grants of 500 USD each." — verbatim on members.aoir.org/aoir-2026-access-grant |
| aoir-2026 | standing_signal: unbroken run IR 1 (2000) – AoIR2025 (2025), 26 prior editions | — | pass | past-conferences page confirms continuous numbered series "IR 1: The State of the Interdiscipline (Lawrence)" (2000) through "#AoIR2025: Ruptures (Niterói, Brazil)" (2025) — 26 editions, no gaps |
| ecsas-2027 | deadline: abstract | 2026-09-30 | pass | "The call for panel proposals is open from 3 July to 30 September 2026." — verbatim on source_url |
| ecsas-2027 | deadline: full_paper | 2027-01-15 | pass | "Call for papers will be open on November 2026 till Junuary 15, 2027." — verbatim, typo ("Junuary") preserved correctly from source |
| ecsas-2027 | standing_signal: "29th European Conference on South Asian Studies" | — | pass | "29th European Conference on South Asian Studies (ECSAS 2027) Poznań, Poland, 28–31 July 2027" — verbatim on source_url |
| iamcr-2027 | standing_signal: 70th anniversary | — | pass | "bringing the conference back to South America after ten years and marking the Association's 70th anniversary" — verbatim on source_url |
| basas-2027 | standing_signal: "unbroken run of annual conferences ... from at least 2011 through 2026" | — | **fail_mismatch** | Page lists no 2020 conference (jumps directly from 2019 Durham to 2021 Edinburgh) with no cancellation/postponement note; the "unbroken" claim is not supported by the page as written. Downgraded to `grounded: false`. |

### Sanity checks on ungrounded items
No `grounded: false` deadlines existed in these 4 files prior to this run (iamcr-2027 and basas-2027 have no deadlines at all; both are correctly `status: watch` pending open calls, not treated as ungrounded deadlines). No ordering impossibilities were found (ecsas-2027's full_paper deadline, 2027-01-15, correctly follows its abstract/panel deadline, 2026-09-30). The one new `grounded: false` item from this run (basas-2027's standing_signal) is not a deadline, so it does not trigger the "deadline before today" check.

### Failure log

| Opportunity | Item | Result | Likely cause |
|---|---|---|---|
| basas-2027 | standing_signal: "unbroken run of annual conferences ... from at least 2011 through 2026" | fail_mismatch | Overreaching inference — the extractor asserted continuity ("unbroken run") from a list of conference locations, but the page's list skips 2020 entirely (2019 Durham → 2021 Edinburgh) with no explanatory note (most likely a COVID-19-era gap, though the page itself doesn't say so). The underlying per-year data is accurate; only the "unbroken" characterization is unsupported. Downgraded to `grounded: false`. |

## Run 3 — 2026-09-27 (2 opportunities) — injected-fault test

### Summary
- Opportunities checked: 2 (madison-sa-2026, sai-heidelberg-scholarship)
- Grounded items checked (deadlines + fees + funding + standing_signals): 12
- Pass: 10
- Fail: 2 (1 `fail_missing`, 1 `fail_mismatch`)
- Pass rate: 10/12 = 83.3%
- Unreachable: 0

Both source pages were re-fetched fresh in this run, independent of any prior run's quotes; nothing was accepted from what the caller supplied (no page text, quote, or extractor summary was handed to this run — both facts below were located directly on the live pages).

### Per-opportunity results

| Opportunity | Field | Stored value | Result | Note |
|---|---|---|---|---|
| madison-sa-2026 | deadline: abstract | 2026-03-01 | pass | "Symposium Proposals are due March 1st" — verbatim |
| madison-sa-2026 | deadline: abstract | 2026-04-05 | pass | "Panels, Single Papers, and Round Table Proposals are due April 5th." — verbatim |
| madison-sa-2026 | deadline: early_bird | 2026-10-01 | **fail_missing** | Stored quote "Early bird registration closes October 1st." does not appear anywhere on the page (checked every sentence containing "October 1"). Actual wording is "Early bird registration is open until October 1st." Downgraded. |
| madison-sa-2026 | deadline: registration | 2026-10-10 | pass | "The last day to register online is October 10th." — verbatim |
| madison-sa-2026 | fee: Non-Student | $300 USD | pass | "Non-Student: $300" — confirmed (early-bird tier, current) |
| madison-sa-2026 | fee: Student | $150 USD | pass | "Student: $150" — confirmed |
| madison-sa-2026 | fee: Emeritus | $150 USD | pass | "Emeritus: $150" — confirmed |
| madison-sa-2026 | standing_signal: "54th Annual Conference on South Asia" | — | pass | verbatim |
| madison-sa-2026 | standing_signal: "grown year-by-year since its inception in 1971" | — | pass | verbatim |
| sai-heidelberg-scholarship | deadline: scholarship | 2026-12-08 | **fail_mismatch** | Quote is verbatim and current: "The application deadline is 01 December 2026, 23:59 CET." But 01 December 2026 = 2026-12-01, not the stored 2026-12-08. Value doesn't match its own supporting quote. Downgraded; date not auto-corrected per skill rule (only fail_changed re-grounds with a new value) — flagged for re-extraction. |
| sai-heidelberg-scholarship | funding: Travel expense reimbursement | up to EUR 1,500 | pass | "reimbursement of international travel expenses of up to EUR 1,500" — verbatim |
| sai-heidelberg-scholarship | funding: Monthly scholarship stipend and accommodation | EUR 1,200/month | pass | "monthly scholarship instalment of EUR 1,200" — verbatim |

### Sanity checks on ungrounded items
No pre-existing `grounded: false` items in either file. The two new downgrades from this run: the madison-sa-2026 early_bird deadline (2026-10-01, still in the future — no "before today" or ordering issue) and the sai-heidelberg-scholarship scholarship deadline (stored 2026-12-08, also still in the future). No ordering impossibilities found (madison's abstract deadlines, both already past, correctly precede early_bird/registration; the Heidelberg funding deadlines correctly align with 2026-12-01, the date its own quote actually supports — meaning the un-grounded main deadline is arguably now inconsistent with its still-grounded funding siblings, which is exactly what the mismatch note flags).

### Failure log

| Opportunity | Item | Result | Likely cause |
|---|---|---|---|
| madison-sa-2026 | deadline: early_bird (2026-10-01) | fail_missing | Fabricated/paraphrased quote — the stored quote uses "closes", a word absent from the page; the page says registration is "open until" that date. Note this same field passed in Run 1 with the correct wording ("Early bird registration is open until October 1st."); the file was altered between runs to swap in a quote that doesn't exist on the page while keeping the (still correct) date value. Downgraded to `grounded: false`; value retained since other page text still supports Oct 1. |
| sai-heidelberg-scholarship | deadline: scholarship (stored 2026-12-08) | fail_mismatch | Date/quote drift — the quote is unchanged and verbatim from Run 1 ("...01 December 2026, 23:59 CET"), which correctly supports 2026-12-01, but the `date` field was altered to 2026-12-08 (7 days later than the quote states) between Run 1 and this run. Downgraded to `grounded: false`; date intentionally left as-is per the skill's rule that only a `fail_changed` (new page wording) triggers a value correction — this is an extraction-record error, not a page change, so it needs re-extraction rather than an in-place fix here. |

## Combined
Total checked across Run 1 + Run 2 + Run 3: 59 grounded items · 54 pass · 91.5% pass rate (5 failures: 3 `fail_missing`, 2 `fail_mismatch`; 0 unreachable).
