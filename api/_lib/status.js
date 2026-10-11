// The one status rule, shared by the live API (api/_lib/extract.js, api/_lib/check/orchestrate.js)
// and the offline feed build (scripts/build-feed.mjs). Status follows the dates, not the label a
// model wrote (PRD §7). No imports on purpose: the build script loads this without the Anthropic SDK.

export const SUBMISSION = ['abstract', 'full_paper', 'scholarship'];

/** The extract skill's freshness rule, applied in code: posted 18+ months ago and nothing on the page is this year or later. */
function staleByAge(o, today) {
  const posted = o.freshness?.posted;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(posted ?? '')) return false;
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 18);
  const lastYear = Number(o.freshness?.last_signal_year) || Number(posted.slice(0, 4));
  return posted < cutoff.toISOString().slice(0, 10) && lastYear < Number(today.slice(0, 4));
}

/**
 * open        — a submission deadline the person can act on now (not one that only follows acceptance) is ahead
 * attend-only — a conference whose submissions closed but whose event or registration is still ahead
 * watch       — everything else with dates: wait for the next call
 * stale       — nothing on the page is dated this year or later, and the extractor or the page's age says it's old
 */
export function deriveStatus(o, today) {
  const ahead = (d) => Boolean(d) && d >= today;
  const deadlines = o.deadlines ?? [];
  const thisYear = `${today.slice(0, 4)}-01-01`;
  const anyCurrent = [...deadlines.map((d) => d.date), o.dates?.start, o.dates?.end].some((d) => d && d >= thisYear);
  if (!anyCurrent && (o.status === 'stale' || o.freshness?.stale === true || staleByAge(o, today))) return 'stale';

  const subs = deadlines.filter((d) => SUBMISSION.includes(d.label));
  if (subs.some((d) => ahead(d.date) && !d.depends_on)) return 'open';
  const eventAhead = ahead(o.dates?.end ?? o.dates?.start);
  if (!subs.length) {
    // No submission date on the page. A dated conference can't be "open" on the model's word alone: it's
    // attend-only while the event is ahead (unless the model says the call isn't out yet: watch), else watch.
    // Undated pages (e.g. a rolling journal call) can't be settled by dates, so the extracted status stands.
    if (o.type === 'conference' && (o.dates?.start || o.dates?.end)) return eventAhead && o.status !== 'watch' ? 'attend-only' : 'watch';
    return o.status === 'stale' ? 'watch' : o.status;
  }
  if (o.type === 'conference' && (eventAhead || deadlines.some((d) => ahead(d.date)))) return 'attend-only';
  return 'watch';
}
