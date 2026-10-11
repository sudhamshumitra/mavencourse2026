import { guard, sendError, UserFacingError } from './_lib/claude.js';
import { draftTopics } from './_lib/topics.js';
import { startTrace, costUsd } from './_lib/trace.js';

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const trace = startTrace('topics');
  try {
    const { usage, model, ...profile } = await draftTopics(req.body?.text);
    trace.end({ ok: true, model, topics: profile.topics.length, goals: profile.goals.length, tokens: { input: usage.input_tokens, output: usage.output_tokens }, usd: costUsd(model, usage) });
    res.status(200).json({ ...profile, usage: { input: usage.input_tokens, output: usage.output_tokens } });
  } catch (err) {
    trace.end({ ok: false, status_code: err instanceof UserFacingError ? err.status : 500 });
    sendError(res, err);
  }
}
