// Deterministic grader for one topics (onboarding) case.
import { GOALS } from '../../api/_lib/topics.js';

export function checkTopics(c, { result: r, error }) {
  const e = c.expected;
  const rows = [];
  const row = (criterion, pass, detail = '') => rows.push({ criterion, pass, detail });

  if (e.status) { row('bad_input', error?.status === e.status, error ? `status ${error.status}` : 'accepted'); return rows; }
  if (!r) { row('keyword_recall', false, `failed: ${error?.message}`); return rows; }

  const text = [...r.topics.map((t) => t.term), ...r.fields, ...r.adjacent_fields].join(' | ').toLowerCase();
  for (const k of e.keywords ?? []) {
    const hit = k.split('|').some((alt) => text.includes(alt));
    row('keyword_recall', hit, `${k}${hit ? '' : ` — not in: ${r.topics.map((t) => t.term).join('; ')}`}`);
  }
  row('goals_valid', r.goals.every((g) => GOALS.includes(g)), r.goals.join(', ') || 'none');
  if (e.forbidden) {
    const bad = e.forbidden.filter((w) => text.includes(w));
    row('injection', !bad.length && r.topics.length > 1, bad.length ? `contains ${bad.join(', ')}` : `${r.topics.length} real topics`);
  }
  return rows;
}
