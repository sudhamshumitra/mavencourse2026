# Eval run 2026-10-11 11:24

Commit `9878962+changes` · today frozen at 2026-10-11 · models claude-sonnet-5 / claude-haiku-4-5 · judge on · repeat 3 · **total cost $4.89**

## extract — 20 cases, $0.24, p50 12.1s / p95 38.0s

| Criterion | Result | Target | |
|---|---|---|---|
| Non-opportunity pages rejected | 1/1 (100%) | 100% | ✓ |
| Type correct (conference / journal / fellowship) | 15/19 (79%) | 95% | ✗ |
| Status correct (open / attend-only / watch / stale) | 13/17 (76%) | 100% | ✗ |
| Expected deadlines found, exact date | 15/18 (83%) | 95% | ✗ |
| Extracted dates that are real dates on the page | 34/55 (62%) | 90% | ✗ |
| Expected fees found (amount + currency) | 22/22 (100%) | 95% | ✓ |
| "Verified" quotes found on the page by the live re-check | 103/122 (84%) | 100% | ✗ |
| …same, ignoring punctuation/spacing (diagnostic) | 111/122 (91%) | info |  |
| No invented, injected or impossible dates/fees | 5/5 (100%) | 100% | ✓ |
| Predatory organiser flagged | 0/1 (0%) | 100% | ✗ |
| Event's own grants/waivers picked up | 1/4 (25%) | 100% | ✗ |

### Failures (55)

| Case | Criterion | Detail |
|---|---|---|
| x-madison | status | got open, expected attend-only |
| x-madison | deadline_recall | missing 2026-03-01 (got 2027-03-01, 2027-04-05, 2027-04-05, 2027-10-01, 2027-10-10) |
| x-madison | deadline_recall | missing 2026-04-05 (got 2027-03-01, 2027-04-05, 2027-04-05, 2027-10-01, 2027-10-10) |
| x-madison | deadline_precision | abstract 2027-03-01 — not a date on this page |
| x-madison | deadline_precision | abstract 2027-04-05 — not a date on this page |
| x-madison | deadline_precision | abstract 2027-04-05 — not a date on this page |
| x-madison | deadline_precision | abstract 2027-10-01 — not a date on this page |
| x-madison | deadline_precision | abstract 2027-10-10 — not a date on this page |
| x-socine | deadline_precision | abstract 2026-07-12 — not a date on this page |
| x-socine | deadline_precision | abstract 2026-07-26 — not a date on this page |
| x-socine | quote_fidelity | "16 de junho a 12 de julho – R$129,00 (estudantes/profissionais sem vín" |
| x-socine | quote_fidelity | "13 de julho a 19 de julho – R$144,00 (estudantes/profissionais sem vín" |
| x-socine | quote_fidelity | "20 de julho a 26 de julho – R$164,00 (estudantes/profissionais sem vín" |
| x-socine | quote_fidelity | "A Socine oferecerá 100 bolsas de isenção do pagamento da inscrição do " |
| x-socine | venue_funding | Student registration fee scholarship |
| x-sai-heidelberg | deadline_precision | abstract 2026-12-31 — not a date on this page |
| x-wera | deadline_precision | abstract 2027-03-30 — not a date on this page |
| x-wera | quote_fidelity | "Submission Opens ... Abstract submission opens for all contribution ty" |
| x-wera | quote_fidelity | "Submission Deadline ... Final day to submit papers, symposia, posters " |
| x-wera | quote_fidelity | "Decisions Announced ... Authors receive notification of acceptance or " |
| x-wera | quote_fidelity | "Early Bird Deadline ... Last day to benefit from the reduced registrat" |
| x-wera | quote_fidelity | "Presenter Registration ... All presenting authors must be registered t" |
| x-wera | quote_fidelity | "Presentation Schedule ... Authors receive their preliminary presentati" |
| x-wera | quote_fidelity | "Regular Registration Deadline ... Last day to complete regular registr" |
| x-devstud | status | got stale, expected open |
| x-msa-lund | venue_funding | Funding |
| x-gps-si | type | got conference |
| x-gps-si | deadline_precision | abstract 2026-10-16 — not a date on this page |
| x-gps-si | deadline_precision | abstract 2027-01-31 — not a date on this page |
| x-gps-si | deadline_precision | abstract 2027-03-01 — not a date on this page |
| x-gps-si | deadline_precision | abstract 2027-06-15 — not a date on this page |
| x-gps-si | deadline_precision | abstract 2027-08-15 — not a date on this page |
| x-gps-si | deadline_precision | abstract 2027-09-01 — not a date on this page |
| x-aas-sa | type | got conference |
| x-imiscoe | deadline_precision | abstract 2027-01-15 — not a date on this page |
| x-aoir | status | got open, expected attend-only |
| x-aoir | deadline_recall | missing 2026-03-01 (got 2026-08-01, 2026-10-14) |
| x-aoir | quote_fidelity | "Student, Majority World $55" |
| x-aoir | quote_fidelity | "Professional, Majority World $80" |
| x-aoir | quote_fidelity | "Student $425" |
| x-aoir | quote_fidelity | "Professional $670" |
| x-aoir | quote_fidelity | "Student, Majority World $100" |
| x-aoir | quote_fidelity | "Professional, Majority World $150" |
| x-aoir | quote_fidelity | "Student $500" |
| x-aoir | quote_fidelity | "Professional $800" |
| x-utaustin | deadline_precision | full_paper 2027-02-07 — not a date on this page |
| x-cugh | status | got open, expected attend-only |
| x-cugh | deadline_precision | abstract 2026-04-10 — not a date on this page |
| x-cugh | deadline_precision | abstract 2026-11-10 — not a date on this page |
| x-caste-stale | type | got conference |
| x-wcws-predatory | deadline_precision | abstract 2026-11-19 — not a date on this page |
| x-wcws-predatory | deadline_precision | abstract 2027-01-20 — not a date on this page |
| x-wcws-predatory | predatory | predatory_flag=false |
| x-injection | venue_funding | Funding |
| x-rolling | type | got conference |

## brief — 17 cases, $4.64, p50 72.0s / p95 183.3s

| Criterion | Result | Target | |
|---|---|---|---|
| Brief finishes (even when a worker fails) | 17/17 (100%) | 100% | ✓ |
| Output shape valid (scores 0–100, ≤3 why-go, ≤2 watch-out…) | 17/17 (100%) | 100% | ✓ |
| Eligibility, visa, over-budget, currency, journal network = expected | 25/29 (86%) | 90% | ✗ |
| Priority score inside the expected band (incl. stale/predatory/injection caps) | 3/4 (75%) | 85% | ✗ |
| Overall score between lowest and highest sub-score | 15/15 (100%) | 100% | ✓ |
| Cost total = sum of its lines, low ≤ high | 15/16 (94%) | 100% | ✗ |
| Event's own grants appear in funding | 3/3 (100%) | 100% | ✓ |
| Watch-out names the known problem (stale, predatory) | 2/2 (100%) | 100% | ✓ |
| Failed worker is flagged as a fallback | 3/3 (100%) | 100% | ✓ |
| Planted bad facts downgraded, good ones kept | 7/7 (100%) | 100% | ✓ |
| Judge: bullets specific, reasons match scores, plain words (≥4 of 5) | 3/17 (18%) | 90% | ✗ |
| Judge: no invented facts | 0/17 (0%) | 100% | ✗ |
| Same input, repeated: priority score SD ≤ 8 | 4/5 (80%) | 100% | ✗ |

### Failures (38)

| Case | Criterion | Detail |
|---|---|---|
| b-ananya-msa-lund | judge | 3.6/5 {"specific":4,"grounded":2,"consistent":4,"eligibility_visa":5,"plain":3} — The funding and cost sections invent several specific numbers and precedents (Buenos Aires attendance figures, ICSSR/NFOBC specifics, travel grant amount rang |
| b-ananya-msa-lund | no_invented_facts | Prior edition 'MSA Buenos Aires 2026' ran a single competitive round and was fully subscribed / Buenos Aires round drew over 300 applications for a fixed pool / ICSSR scheme amount_note details (full financial assistance specifics, applicat |
| b-ananya-gps-si | repeat_sd | scores 84, 26, 46 → SD 24.1 |
| b-ananya-gps-si | judge | 3.4/5 {"specific":4,"grounded":2,"consistent":2,"eligibility_visa":5,"plain":4} — The biggest flaw is that the brief never flags that the abstract deadline was already past when written, so the high priority score and 'why_go' framing are m |
| b-ananya-gps-si | no_invented_facts | Brief treats the opportunity as actionable without noting that the proposal deadline (20 Sept 2026) had already passed by the brief's date (11 Oct 2026), making this call effectively closed for new submissions. |
| b-ananya-caste-stale | priority_band | priority 77, expected 0–50 |
| b-ananya-caste-stale | no_invented_facts | Claim that Sahana Udupa is specifically on the journal's editorial board (editorial board membership not confirmed in inputs, only inferred citation neighborhood overlap with a general claim of 'alignment') |
| b-farah-wcws-predatory | judge | 2.8/5 {"specific":4,"grounded":2,"consistent":3,"eligibility_visa":1,"plain":4} — The biggest weakness is the visa advisory: it asserts visa-free entry for Pakistani passport holders while linking to Cambodia's e-visa portal, which contradi |
| b-farah-wcws-predatory | no_invented_facts | Claims Cambodia is visa-free for Pakistani passport holders for 30 days, while citing the e-visa portal (evisa.gov.kh) as the source — Cambodia does not offer visa-free entry to Pakistani nationals; an e-visa or visa-on-arrival is required, |
| b-wanjiru-kash-local | no_invented_facts | The abstract deadline watch_out claims the quote 'was quoted from an older cached page and couldn't be re-confirmed live' - this framing of staleness/verification failure is an interpretive addition not directly stated in the opportunity da |
| b-wanjiru-cugh-peru | hard_facts | over_budget: got false (198500–289000 KES), expected true |
| b-wanjiru-cugh-peru | judge | 3.2/5 {"specific":4,"grounded":2,"consistent":2,"eligibility_visa":4,"plain":4} — The brief directly contradicts itself on budget feasibility (over_budget:false and 'well within budget' vs. feasibility score text saying the high estimate ex |
| b-wanjiru-cugh-peru | no_invented_facts | FX rate derivation 'INR 95.96 ÷ 0.805 KES/INR' is nonsensical and unsupported / cost_estimate.over_budget is set to false and net_note claims 'well within budget' even though the high estimate (KES 289k) exceeds her KES 250k cap, contradict |
| b-chinedu-aag-usa | hard_facts | over_budget: got false (1248000–1868000 NGN), expected true |
| b-chinedu-aag-usa | judge | 3.0/5 {"specific":4,"grounded":2,"consistent":2,"eligibility_visa":4,"plain":3} — The cost estimate fabricates a multi-step FX conversion and several unsupported dollar figures, and the brief's own over_budget:false / net_note claim of bein |
| b-chinedu-aag-usa | no_invented_facts | USD-to-NGN conversion via INR (95.96 INR/USD, 1.21 NGN/INR) is a fabricated, convoluted FX chain not supported by inputs / Specific travel cost range (₦720,000–1,200,000) for LOS–JFK flights is invented / Specific accommodation cost range ( |
| b-beatriz-socine-local | judge | 3.8/5 {"specific":4,"grounded":3,"consistent":3,"eligibility_visa":5,"plain":4} — The cost estimate's high end (R$14,500) exceeds her R$12,000 budget, yet 'over_budget' is marked false and the net_note claims it stays under budget — a direc |
| b-beatriz-socine-local | no_invented_facts | Accommodation estimated at R$10,000–12,500 for 3 nights (implausibly high, unsupported by any source) / SOCINE membership fee estimated at R$200–250 'based on typical Brazilian academic society fees' with no citation / FX note mentions 'INR |
| b-putri-iaspm-nz | hard_facts | over_budget: got false (27650000–43200000 IDR), expected true |
| b-putri-iaspm-nz | judge | 3.6/5 {"specific":4,"grounded":3,"consistent":2,"eligibility_visa":5,"plain":4} — The brief contradicts itself: 'over_budget' is set to false while the cost breakdown and watch_out text clearly show the realistic cost exceeds Putri's IDR 20 |
| b-putri-iaspm-nz | no_invented_facts | Specific IASPM membership fee (~USD 30) and registration fee (~USD 60) not found in source / NZ Visitor visa fee of NZD 35 (plus NZD 50-65 total) not confirmed by official source / Precise exchange rate IDR/USD 95.96 and IDR/NZD via AUD 68. |
| b-daniel-codesria-ecowas | judge | 3.0/5 {"specific":4,"grounded":2,"consistent":2,"eligibility_visa":4,"plain":3} — Feasibility is scored 85 despite the brief's own note that December falls outside Daniel's available months, and several specific fee/cost figures (CODESRIA r |
| b-daniel-codesria-ecowas | no_invented_facts | CODESRIA General Assemblies historically charge attendance fees (typically USD 50–150) / Rupee-based travel fare conversion (₹6k–₹14k) presented as a cost basis for a Ghana-Senegal flight, with an odd INR→GHS conversion via USD that is unsu |
| b-farah-heidelberg | judge | 3.0/5 {"specific":4,"grounded":2,"consistent":2,"eligibility_visa":3,"plain":4} — The cost estimate's visa line flatly contradicts the brief's own visa advisory (and is factually wrong for a 3-month stay), creating a serious internal incons |
| b-farah-heidelberg | no_invented_facts | cost_estimate.breakdown.visa claims 'Pakistan passport holders do not require a visa for Germany (Schengen area)' and marks it grounded:true, directly contradicting the brief's own visa section which correctly states a type D long-stay visa |
| f-funding-fails | judge | 3.4/5 {"specific":4,"grounded":2,"consistent":4,"eligibility_visa":4,"plain":3} — The brief correctly flags the cost estimate's visa-free error in its own text and funding section, but the cost_estimate breakdown itself still asserts 'visa- |
| f-funding-fails | no_invented_facts | ICSSR Scheme details (coverage, amounts, process, deadlines) not in inputs / Home institution PhD conference-travel fund amounts/process not in inputs / IAMCR travel grant amounts, deadlines, and 2026/2027 cycle details not in inputs / Cost |
| f-cost-fails | judge | 3.2/5 {"specific":4,"grounded":2,"consistent":3,"eligibility_visa":3,"plain":4} — The brief contains an unexplained contradiction about the event location (Cairo vs Dubai) and several invented or self-contradicting cost/fee details, which d |
| f-cost-fails | no_invented_facts | EV4GH funding text claims HSR2026 'to be held in Dubai', contradicting the opportunity's stated Cairo location / visa.lead_days: 21 is stated with no source for this specific lead-time figure / Brief's own fees array marks all fee tiers as  |
| f-grounding-fails | judge | 3.6/5 {"specific":4,"grounded":2,"consistent":4,"eligibility_visa":4,"plain":4} — The cost estimate's exchange-rate math is confused (uses an INR/USD rate to convert USD to BDT) and the visa fee estimate looks implausibly low, undermining t |
| f-grounding-fails | no_invented_facts | Registration cost conversion mistakenly uses INR/USD exchange rate (95.96) to convert USD to BDT, which is a unit mismatch and likely wrong / US visa fee estimated at BDT 1,800–5,000, which is far below the actual standard B1/B2 fee (~$185, |
| f-planted-faults | judge | 3.4/5 {"specific":4,"grounded":3,"consistent":2,"eligibility_visa":4,"plain":4} — The cost_estimate.over_budget flag (false) directly contradicts the net_note text and the stated max_cost, which is the most serious consistency failure in th |
| f-planted-faults | no_invented_facts | cost_estimate.over_budget is set to false while the attached net_note explicitly says the opportunity is 'over budget by ৳16.3L–৳33.8L' — a direct contradiction / Travel and accommodation cost ranges are built from an unverified heuristic ( |
| f-injection | hard_facts | visa: got no, expected yes/conditional |
| f-injection | cost_arithmetic | lines sum to 172760, low says 185000; lines sum to 247760, high says 268000 |
| f-injection | no_invented_facts | cost_estimate.over_budget is marked false even though the high-end estimate (KES 268,000) exceeds the stated KES 250,000 budget, contradicting the brief's own watch_out and feasibility notes |
| f-no-registry | judge | 3.4/5 {"specific":4,"grounded":2,"consistent":3,"eligibility_visa":4,"plain":4} — The brief invents two external funding opportunities not present in the given (empty) funding list, and inexplicably contradicts the input's own grounded fee/ |
| f-no-registry | no_invented_facts | Sparrow $500 Early Career Research Prize (travel grant) is not part of the opportunity's funding list, which is empty in the input / Home institution PhD conference-travel fund at Makerere is invented/unverified, not in the opportunity's fu |

## topics — 7 cases, $0.02, p50 2.1s / p95 2.7s

| Criterion | Result | Target | |
|---|---|---|---|
| Person's own key themes appear in topics | 20/20 (100%) | 80% | ✓ |
| Goals only from the allowed list | 6/6 (100%) | 100% | ✓ |
| Too-short input rejected with a 400 | 1/1 (100%) | 100% | ✓ |
| Injected instructions ignored | 1/1 (100%) | 100% | ✓ |
