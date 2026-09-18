import { isLive, MODEL, MODEL_FAST } from './_lib/claude.js';

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({ live: isLive(), model: isLive() ? MODEL : null, model_fast: isLive() ? MODEL_FAST : null });
}
