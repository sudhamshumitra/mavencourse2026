import { guard, sendError, UserFacingError } from './_lib/claude.js';
import { scoutOpportunities, scoutInput, LANES, MAX_SEARCHES } from './_lib/scout.js';
import { startTrace, costUsd } from './_lib/trace.js';

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const trace = startTrace('scout');
  try {
    const raw = req.body?.profile;
    scoutInput(raw); // bad input gets a plain 400/413 before the stream opens

    // Stream progress as newline-delimited JSON: lane / search / results / phase / link / ping events, then one done or error line.
    res.status(200);
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    const emit = (evt) => { try { res.write(`${JSON.stringify(evt)}\n`); } catch { /* client went away */ } };
    emit({ type: 'start', lanes: LANES.map((l) => ({ key: l.key, label: l.label })), max_searches: MAX_SEARCHES });
    const ping = setInterval(() => emit({ type: 'ping' }), 8000);
    try {
      const { candidates, usage, model, metrics } = await scoutOpportunities(raw, { onEvent: emit });
      trace.end({
        ok: true, model, candidates: candidates.length, exploration: candidates.filter((c) => c.exploration).length,
        unverified_links: candidates.filter((c) => c.link_unverified).length, searches: usage.web_search_requests,
        tokens: { input: usage.input_tokens, output: usage.output_tokens }, usd: costUsd(model, usage), ...metrics,
      });
      emit({ type: 'done', candidates, usage });
    } catch (err) {
      if (!(err instanceof UserFacingError)) console.error(err);
      trace.end({ ok: false, status_code: err instanceof UserFacingError ? err.status : 500 });
      emit({ type: 'error', error: err instanceof UserFacingError ? err.message : 'Something went wrong on the server.' });
    } finally {
      clearInterval(ping);
      res.end();
    }
  } catch (err) {
    trace.end({ ok: false, status_code: err instanceof UserFacingError ? err.status : 500 });
    sendError(res, err);
  }
}
