---
name: verify-grounding
description: Audit the Grapevine corpus — re-fetch each opportunity's source pages and check that every fact marked grounded (deadlines, fees, venue funding) really appears there, verbatim, and supports the stored value; downgrade anything that fails to "inferred — verify" and write a grounding report with the failure log. Use after every corpus refresh or extraction batch, and before a demo or release.
---

# verify-grounding — Verification Judge (PRD §6, eval #4)

## Purpose
Extraction models are confident even when they're wrong: a date from last year's call, a fee from the wrong tier, a quote slightly "improved". Grapevine's promise is that **anything shown as ✓ verified can be traced to the source**. This skill is a separate second pass that doesn't trust the first.

## When to use
- After every batch of `extract-opportunity` runs.
- Before a demo, submission or release.
- When a user reports a wrong date.

## Inputs
- `corpus/opportunities/*.json` (and `funding` in `corpus/briefs/*/*.json` for venue items with `grounded: true`).

## Process
For each opportunity:
1. Re-fetch `source_url`, plus any other URL cited in a grounded item.
2. For every item with `grounded: true`, run three checks:
   - **(a) The quote exists.** `source_quote` appears in the page text. Normalise whitespace, quote marks and dashes only; the wording must match.
   - **(b) The quote supports the value.** The date or amount stored is the one the quote states, with the right year (watch for last year's call), day/month order, currency and tier.
   - **(c) It's still current.** The page hasn't changed the date (e.g. "extended to…").
3. Result per item: `pass`, `fail_missing` (quote not found), `fail_mismatch` (quote found but the value differs), `fail_changed` (the page now says something else), or `unreachable`.
4. For every failure: set `grounded: false`, keep the old quote in `"previous_quote"`, add `"verify_note": "<what went wrong>"`, and correct the value **only** if (c) gives a new quoted value. In that case re-ground it with the new quote.
5. **Freshness check** for every opportunity: find the page's posted or updated date and the latest year it refers to. If both are more than 18 months old and nothing on the page points to the current or a future year, set `status: "stale"` and fill in `freshness`, even if every quote passes. A quote can be verbatim and still be out of date.
6. Also sanity-check **ungrounded** items: flag any `grounded: false` deadline that falls before today, or any ordering impossibility (full paper before abstract).

## Output: `corpus/grounding-report.md`
- Summary: opportunities checked · grounded items checked · pass rate (target 100% or every failure explained) · unreachable count.
- A table per opportunity: field · stored value · result · note.
- **Failure log:** each failure with its likely cause (wrong year, tier confusion, paraphrased quote, page changed). This is the running failure log the PRD asks for, so append to it and never overwrite earlier runs.

## Constraints
- Read-only against the web. Writes only to the corpus files and the report.
- Never upgrade an item to `grounded: true` without a verbatim quote found in this run.
- If a page is unreachable, **don't** downgrade. Mark it `unreachable` and recheck next run (sites go down; facts don't change).

## Edge cases
- **JS-rendered pages** that come back empty: try the site's print/plain view or the PDF version. Otherwise `unreachable`.
- **PDF sources:** search the extracted text, and allow hyphenation line breaks.
- **Quotes in a different language:** match in the original language. The value check uses the translated meaning.

## Example report line
| sasa-2027 | abstract 2026-10-31 | fail_mismatch | Quote says "31 October 2025": last year's call page. Downgraded, needs re-extract from the 2027 page |

## Runtime notes (Phase 3)
Runs after the weekly refresh. Capable model only for check (b). Checks (a) and (c) are string matching in code.
