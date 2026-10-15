import { guard } from './_lib/claude.js';

/** Checks the access code without calling any model: the site uses it to unlock "Get started" (the live, paid path). */
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!guard(req, res)) return;
  res.status(200).json({ ok: true });
}
