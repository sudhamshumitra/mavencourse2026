// The live "Full check": a thin streaming route around the brief orchestrator
// (api/_lib/check/orchestrate.js). See MULTIAGENT.md for the worker design.
import { guard, sendError, UserFacingError } from './_lib/claude.js';
import { runBrief } from './_lib/check/orchestrate.js';
import { startTrace } from './_lib/trace.js';

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const trace = startTrace('brief');
  let streaming = false;
  try {
    const opportunity = req.body?.opportunity;
    const profile = req.body?.profile;
    if (!opportunity || typeof opportunity !== 'object' || !opportunity.title) throw new UserFacingError(400, 'Missing opportunity.');
    if (!profile || typeof profile !== 'object') throw new UserFacingError(400, 'Missing profile.');

    res.status(200);
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    streaming = true;
    const emit = (evt) => { try { res.write(`${JSON.stringify(evt)}\n`); } catch { /* client went away */ } };

    const { brief, usage, metrics } = await runBrief({ opportunity, profile }, { emit });
    trace.end({ ok: true, type: opportunity.type, priority: brief.priority?.score ?? null, eligible: brief.eligible, ...metrics });
    emit({ type: 'done', brief, usage });
    res.end();
  } catch (err) {
    trace.end({ ok: false, status_code: err instanceof UserFacingError ? err.status : 500 });
    if (streaming) {
      try { res.write(`${JSON.stringify({ type: 'error', error: err instanceof UserFacingError ? err.message : 'Something went wrong on the server.' })}\n`); } catch { /* ignore */ }
      if (!(err instanceof UserFacingError)) console.error(err);
      res.end();
    } else sendError(res, err);
  }
}
