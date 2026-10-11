// One structured log line per live request, so production quality can be watched in the Vercel
// logs with the same metric names the eval runner (evals/) reports. Never logs user text, profile
// content or page content — only counts, timings, flags and cost.

// $ per million tokens (Anthropic first-party rates), and $ per web search. Web fetch has no
// per-use fee, only the tokens it brings in. Shared with evals/run.mjs.
export const PRICES = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-5': { input: 5, output: 25 },
};
export const WEB_SEARCH_USD = 0.01;

/** Cost in USD of one usage record ({input_tokens, output_tokens, web_search_requests}) on a model. */
export function costUsd(model, usage = {}) {
  const p = PRICES[model] ?? PRICES['claude-sonnet-5'];
  return ((usage.input_tokens ?? 0) * p.input + (usage.output_tokens ?? 0) * p.output) / 1e6
    + (usage.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

export const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** Starts a trace for one request; call .end(fields) once with whatever the route learned. */
export function startTrace(route) {
  const t0 = Date.now();
  return {
    end(fields = {}) {
      const line = { gv_trace: 1, route, at: new Date().toISOString(), ms: Date.now() - t0, ...fields };
      if (typeof line.usd === 'number') line.usd = round(line.usd);
      try { console.log(JSON.stringify(line)); } catch { /* never let logging break a request */ }
      return line;
    },
  };
}
