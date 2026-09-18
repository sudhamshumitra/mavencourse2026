import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.GV_MODEL || 'claude-opus-5';
export const MODEL_FAST = process.env.GV_MODEL_FAST || MODEL;
export const isLive = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client;
const getClient = () => (client ??= new Anthropic());

const supportsEffort = (m) => !m.startsWith('claude-haiku');
const supportsDefaultFallback = (m) => m.startsWith('claude-opus-5') || m.startsWith('claude-fable');

export class UserFacingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** One Claude call that must answer with a single JSON object. Retries once if the JSON doesn't parse. */
export async function callJson({ model = MODEL, system, user, maxTokens = 16000, effort = 'medium' }) {
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (supportsEffort(model)) params.output_config = { effort };

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = supportsDefaultFallback(model)
        ? await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await getClient().messages.create(params);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new UserFacingError(503, 'The API key is not valid. Check ANTHROPIC_API_KEY in Vercel.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new UserFacingError(503, 'The API account is out of credit or over its spend limit.');
      if (err instanceof Anthropic.RateLimitError) throw new UserFacingError(429, 'Too many requests right now. Try again in a minute.');
      if (err instanceof Anthropic.BadRequestError) throw new UserFacingError(502, `The model rejected the request: ${err.message}`);
      if (err instanceof Anthropic.APIError) throw new UserFacingError(502, `The model service had a problem (${err.status}). Try again.`);
      throw err;
    }

    if (res.stop_reason === 'refusal') throw new UserFacingError(422, 'The model declined to process this page.');
    if (res.stop_reason === 'max_tokens') throw new UserFacingError(502, 'The answer was too long and got cut off. Try a shorter page.');

    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return { data: JSON.parse(text.slice(start, end + 1)), usage: res.usage, model: res.model };
      } catch { /* retry once below */ }
    }
    params.messages = [{ role: 'user', content: `${user}\n\nYour previous answer was not a single valid JSON object. Reply with ONLY the JSON object.` }];
  }
  throw new UserFacingError(502, 'The model did not return valid data. Try again.');
}

/* ---------- request guards ---------- */

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = Number(process.env.GV_RATE_LIMIT_PER_HOUR || 30);

/** Best-effort per-visitor limit (per server instance). The hard ceiling is the monthly spend limit in the Anthropic Console. */
export function guard(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return false; }
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) { res.status(403).json({ error: 'Cross-site requests are not allowed.' }); return false; }
  if (!isLive()) { res.status(503).json({ error: 'Live mode is off: no API key configured.' }); return false; }

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { res.status(429).json({ error: 'Hourly limit reached for this prototype. Try again later.' }); return false; }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export function sendError(res, err) {
  if (err instanceof UserFacingError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server.' });
}

export const today = () => new Date().toISOString().slice(0, 10);
