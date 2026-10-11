import { guard, sendError, UserFacingError } from './_lib/claude.js';
import { fetchPage, fetchViaReader } from './_lib/fetchPage.js';
import { extractFromPage, extractViaWebFetch } from './_lib/extract.js';
import { startTrace, costUsd } from './_lib/trace.js';

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const trace = startTrace('extract');
  try {
    let page = null;
    try {
      page = await fetchPage(req.body?.url);
    } catch (err) {
      // Blocked (403 etc.) or JavaScript-only pages fall back to Claude's web_fetch. Rejected addresses (400s) never do.
      if (!(err instanceof UserFacingError) || ![422, 502].includes(err.status)) throw err;
      page = await fetchViaReader(req.body.url);
    }

    const { opportunity, usage, model } = page ? await extractFromPage(page) : await extractViaWebFetch(req.body.url);
    const via = page ? (page.via ?? 'direct') : 'claude_web_fetch';
    const facts = [...opportunity.deadlines, ...opportunity.fees, ...opportunity.funding];
    trace.end({
      ok: true, via, model, type: opportunity.type, status: opportunity.status,
      deadlines: opportunity.deadlines.length, fees: opportunity.fees.length,
      grounded: facts.filter((f) => f.grounded).length, ungrounded: facts.filter((f) => !f.grounded).length,
      predatory: opportunity.predatory_flag, tokens: { input: usage.input_tokens, output: usage.output_tokens }, usd: costUsd(model, usage),
    });
    res.status(200).json({ opportunity, via, usage: { input: usage.input_tokens, output: usage.output_tokens } });
  } catch (err) {
    trace.end({ ok: false, status_code: err instanceof UserFacingError ? err.status : 500 });
    sendError(res, err);
  }
}
