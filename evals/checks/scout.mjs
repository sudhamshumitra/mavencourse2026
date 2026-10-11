// Grader for one scout (live search) case. Link checks hit the network; no model calls here.

async function linkStatus(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 GrapevineEval/0.1' } });
    if ([401, 403, 429].includes(res.status)) return 'blocked';
    return res.ok ? 'live' : `dead (${res.status})`;
  } catch { return 'dead (no response)'; } finally { clearTimeout(timer); }
}

export async function checkScout(c, { result: r, error }, { today }) {
  const rows = [];
  const row = (criterion, pass, detail = '') => rows.push({ criterion, pass, detail });
  const list = r?.candidates ?? [];

  row('count', list.length >= 1 && list.length <= 8, error ? `failed: ${error.message}` : `${list.length} candidates`);
  if (!list.length) return rows;
  row('exploration', list.some((x) => x.exploration), list.filter((x) => x.exploration).map((x) => x.title).join('; ') || 'none');
  for (const x of list) {
    if (x.status === 'open') row('no_past_open', !x.deadline_hint || x.deadline_hint >= today, `${x.title}: ${x.deadline_hint ?? 'no date'}`);
    row('trace', (x.discovery_trace ?? []).length > 0, x.title);
    const s = await linkStatus(x.url);
    if (s !== 'blocked') row('links_live', s === 'live', `${s}: ${x.url}`);
  }
  return rows;
}
