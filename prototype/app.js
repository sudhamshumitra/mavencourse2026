/**
 * Grapevine prototype — application logic.
 *
 * Hash-routed, no build step, no backend. Everything the agent would compute is
 * read from data.js; everything the user changes is kept in localStorage so the
 * feedback loop is visible across a session.
 */

import { TODAY, GATHERED_AT, EXAMPLES, profile as seedProfile, heldBack, pipelineFor, dismissReasons, topicVocabulary, GOALS, FX } from './data.js';

/* ============================================================
   State
   ============================================================ */

const KEY = 'grapevine.v2';

const defaultState = {
  onboarded: false,
  profile: structuredClone(seedProfile),
  saved: [],
  dismissed: [],
  pasted: [],
  feedback: [],
  changedTopics: [],
  weightAdjust: {},
  showIneligible: false,
  theme: null,
  mode: 'example',   // 'example' = a pre-built example shortlist; 'mine' = live search for your profile
  exampleId: seedProfile.id,
  search: null,      // { key, at, candidates }
  scored: {},        // candidate id -> fully scored opportunity (cached so it's never paid for twice)
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultState);
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode — session only */ }
}

function resetAll() {
  state = structuredClone(defaultState);
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/* ============================================================
   Helpers
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape anything that originated from a text input. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOCALE = { INR: 'en-IN', BRL: 'pt-BR', EUR: 'en-IE', GBP: 'en-GB' };
const money = (n, cur = state.profile.currency) =>
  new Intl.NumberFormat(LOCALE[cur] ?? 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);

/* ---------- priority: "is it worth going?" ---------- */

const SUBS = [
  ['fit', 'Fit', 'How close it is to your research'],
  ['standing', 'Standing', 'How established and well respected it is'],
  ['network', 'Network', 'Who you would meet'],
  ['outcomes', 'Outcomes', 'What you would come away with'],
  ['feasibility', 'Feasibility', 'Whether you can realistically go'],
];
const BASE_WEIGHTS = { fit: 0.35, standing: 0.15, network: 0.15, outcomes: 0.15, feasibility: 0.2 };
const GOAL_BOOST = {
  networking: { network: 0.1 }, publication: { outcomes: 0.1 }, visibility: { standing: 0.1 },
  low_cost: { feasibility: 0.1 }, feedback: { network: 0.05, outcomes: 0.05 },
};

/** Same weighting rule as the compose-brief skill: base + goals + feedback, renormalised. */
function weightsFor(p = state.profile) {
  const w = { ...BASE_WEIGHTS };
  for (const g of p.goals ?? []) for (const [k, v] of Object.entries(GOAL_BOOST[g] ?? {})) w[k] += v;
  for (const [k, v] of Object.entries(state.weightAdjust ?? {})) w[k] = Math.max(0.02, w[k] + v);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum]));
}

function priorityOf(o) {
  const subs = o.priority?.sub_scores;
  if (!subs) return Math.round((o.fit?.score ?? 0) * 100);
  const w = weightsFor();
  let total = 0, wsum = 0;
  for (const [k] of SUBS) {
    const s = subs[k]?.score;
    if (typeof s !== 'number') continue;
    total += w[k] * s; wsum += w[k];
  }
  let score = wsum ? total / wsum : 0;
  if (o.predatory_flag) score = Math.min(score, 30);
  return Math.round(score);
}

const homeCountry = () => state.profile.geography?.country ?? '';

const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const daysUntil = (iso) => Math.round((new Date(iso + 'T00:00:00Z') - TODAY) / 86400000);

const relative = (iso) => {
  const d = daysUntil(iso);
  if (d < 0) return 'closed';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 45) return `in ${d} days`;
  const m = Math.round(d / 30.4);
  return `in ${m} month${m === 1 ? '' : 's'}`;
};

const urgency = (iso) => {
  const d = daysUntil(iso);
  if (d < 0) return 'closed';
  if (d <= 21) return 'soon';
  if (d <= 60) return 'near';
  return 'far';
};

const TYPE_LABEL = { conference: 'Conference', journal_call: 'Journal call', fellowship: 'Fellowship / school' };
const DEADLINE_LABEL = {
  abstract: 'Abstract', full_paper: 'Full paper', scholarship: 'Funding application',
  early_bird: 'Early-bird registration', registration: 'Registration', visa: 'Start visa application',
  funding: 'Funding application',
};
const DEADLINE_WHY = {
  abstract: 'The gate. Nothing downstream exists until this one is met.',
  full_paper: 'The finished article. Budget backwards from here, not forwards from today.',
  scholarship: 'Money, not access — but it opens late and closes fast.',
  early_bird: 'Saves money, not opportunity. Only act once acceptance has landed.',
  registration: 'Last point at which attending is still possible.',
  visa: 'Not printed on any call page. Grapevine works this one backwards from the travel date.',
  funding: 'Money to go. Check what it needs first: many grants want the acceptance letter.',
};

const COST_COLORS = {
  registration: 'var(--grape)',
  travel: 'var(--vine)',
  accommodation: 'var(--amber)',
  visa: 'var(--sky)',
};
const COST_LABEL = { registration: 'Registration', travel: 'Travel', accommodation: 'Accommodation', visa: 'Visa' };

const profileKey = (p = state.profile) => JSON.stringify([
  (p.topics ?? []).map((t) => t.term).sort(), p.fields ?? [], p.adjacent_fields ?? [], p.input_text ?? '', p.geography?.country ?? '', p.career_stage]);
const exampleSet = () => EXAMPLES.find((e) => e.id === state.exampleId) ?? EXAMPLES[0];
const pickExample = () => { const others = EXAMPLES.filter((e) => e.id !== state.exampleId); const pool = others.length ? others : EXAMPLES; return pool[Math.floor(Math.random() * pool.length)]; };
const curPipeline = () => pipelineFor(exampleSet().meta, state.profile.currency);
const mineLive = () => state.mode === 'mine' && LIVE;
const quickPriority = (c) => (c.quick
  ? { sub_scores: Object.fromEntries(Object.entries(c.quick).map(([k, v]) => [k, typeof v === 'number' ? { score: v, reason: '' } : null])) }
  : undefined);
const candidates = () => (state.search?.candidates ?? []).map((c) => state.scored[c.id]
  ?? { ...c, unscored: true, source_url: c.url, priority: quickPriority(c), explore: c.exploration });
const allOpportunities = () => [...(mineLive() ? candidates() : exampleSet().opportunities), ...state.pasted];
const byId = (id) => allOpportunities().find((o) => o.id === id);

/** Every deadline on an opportunity, including the one the agent infers for visas. */
function deadlinesFor(opp) {
  const list = (opp.deadlines ?? []).map((d) => ({ ...d }));
  if (opp.visa?.required === 'yes' && opp.dates?.start) {
    const lead = opp.visa.lead_days ?? 60;
    const date = new Date(new Date(opp.dates.start + 'T00:00:00Z') - lead * 86400000).toISOString().slice(0, 10);
    list.push({ label: 'visa', date, depends_on: null, grounded: false, synthetic: true, lead });
  }
  for (const f of opp.funding ?? []) {
    if (!f.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(f.deadline) || f.eligible === 'no') continue;
    if (list.some((d) => d.label === 'scholarship' && d.date === f.deadline)) continue;
    list.push({ label: 'funding', date: f.deadline, depends_on: null, grounded: !!f.grounded,
      source_quote: f.source_quote ?? null, fund_name: f.name, requires: f.requires ?? null });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

const nextDeadline = (opp) => deadlinesFor(opp).find((d) => daysUntil(d.date) >= 0) ?? deadlinesFor(opp)[0];

/* ============================================================
   Theme
   ============================================================ */

function applyTheme() {
  const t = state.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  const btn = $('#theme-toggle');
  if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

/* ============================================================
   Toast
   ============================================================ */

function toast({ emoji = '✅', title, body = '', ms = 4800 }) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="t-emoji" aria-hidden="true">${emoji}</span>
    <span><span class="t-title">${title}</span>${body ? `<span class="t-body">${body}</span>` : ''}</span>`;
  root.append(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, ms);
}

/* ============================================================
   Modal
   ============================================================ */

let lastFocus = null;

function openModal(html, onMount) {
  lastFocus = document.activeElement;
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back" role="dialog" aria-modal="true"><div class="modal">${html}</div></div>`;
  const back = $('.modal-back', root);
  back.addEventListener('mousedown', (e) => { if (e.target === back) closeModal(); });
  document.addEventListener('keydown', escClose);
  ($('.modal button, .modal input', root) ?? $('.modal', root)).focus?.();
  onMount?.(root);
}

function closeModal() {
  $('#modal-root').innerHTML = '';
  document.removeEventListener('keydown', escClose);
  lastFocus?.focus?.();
}

function escClose(e) { if (e.key === 'Escape') closeModal(); }

/* ============================================================
   Shared components
   ============================================================ */

function ring(score, size = 66, cap = 'fit') {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score));
  const tone = pct >= 0.8 ? '' : pct >= 0.65 ? 'mid' : 'lo';
  return `<div>
    <div class="ring ${tone}" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="5"/>
        <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="5"
                stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}"/>
      </svg>
      <span class="ring-num">${Math.round(pct * 100)}</span>
    </div>
    <div class="ring-cap">${cap}</div>
  </div>`;
}

const CONF_TIP = {
  verified: 'Found verbatim in the source page and re-checked by the Verification Judge.',
  inferred: 'Not stated on the source page. Grapevine worked this one out — check it before you rely on it.',
  advisory: 'Guidance, not advice. Always confirm against the official source linked here.',
  range: 'An estimate expressed as a range. The assumptions behind it are listed below.',
};

const conf = (kind) =>
  `<span class="conf conf-${kind}" title="${CONF_TIP[kind] ?? ''}">${
    { verified: '✓ verified', inferred: '~ inferred', advisory: '⚠ advisory', range: '≈ range' }[kind] ?? kind
  }</span>`;

const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? '')) ? esc(u) : '#');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www./, ''); } catch { return ''; } };
const srcQuote = (q) => (q ? `<details class="src"><summary>source</summary><div class="quote-src">“${esc(q)}”</div></details>` : '');

/* ---------- one visual language for every card: type → deadline → place → cost → funding → visa ---------- */

const TYPE_CHIP = { conference: ['🎤', 'Conference'], journal_call: ['📄', 'Journal call'], fellowship: ['🎓', 'Fellowship'] };
const STATUS_BADGE = {
  'attend-only': ['badge-amber', 'Can attend, not present'],
  watch: ['badge-sky', 'Next edition'],
  stale: ['badge-coral', 'May be out of date'],
};
const statusBadge = (o) => { const b = STATUS_BADGE[o.status]; return b ? `<span class="badge ${b[0]}">${b[1]}</span>` : ''; };

const shortMoney = (n, cur) => {
  if (cur === 'INR' && n >= 100000) return `₹${(n / 100000).toFixed(2).replace(/\.?0+$/, '')}L`;
  if (cur === 'INR' && n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return money(n, cur);
};
const openFunding = (o) => (o.funding ?? []).filter((f) => f.eligible !== 'no');
const futureDeadline = (o) => deadlinesFor(o).find((d) => daysUntil(d.date) >= 0 && !d.synthetic);
const actionable = (o) => (!o.status || o.status === 'open') && !!futureDeadline(o);

const SUB_SHORT = { fit: 'Fit', standing: 'Standing', network: 'Network', outcomes: 'Outcomes', feasibility: 'Feasible' };
const tone = (s) => (s >= 75 ? 'hi' : s >= 55 ? 'mid' : 'lo');

function placeOf(o) {
  if (o.location.format === 'online' || o.location.city === '—') return 'Online';
  return [o.location.city, o.location.country].filter((x) => x && x !== '—').join(', ');
}

/** One line of plain context: type · place · dates, with status badges. */
function kicker(o) {
  const parts = [TYPE_CHIP[o.type]?.[1] ?? o.type, placeOf(o)];
  if (o.dates?.start) parts.push(fmtDate(o.dates.start));
  return `<div class="kicker">${parts.map(esc).join('<span class="dot">·</span>')}
    ${statusBadge(o)}${o.explore ? '<span class="badge badge-sky">Outside your usual field</span>' : ''}${o.pasted ? '<span class="badge badge-sky">You added this</span>' : ''}</div>`;
}

/** The same four facts, in the same order, everywhere. */
function factsRow(o) {
  const nd = futureDeadline(o);
  const c = o.cost_estimate;
  const nf = openFunding(o).length;
  const abroad = o.location.format !== 'online' && o.location.country !== '—' && o.location.country !== homeCountry();
  const v = o.visa?.required;
  const dl = nd
    ? `<dd class="t-${urgency(nd.date)}">${nd.fund_name ? 'Funding' : DEADLINE_LABEL[nd.label]}<span>${relative(nd.date)}</span></dd>`
    : `<dd class="t-mute">${o.status === 'watch' ? 'Next call not out' : 'None open'}</dd>`;
  const cost = !c ? '<dd class="t-mute">—</dd>'
    : `<dd class="${c.high === 0 ? 't-ok' : overBudget(c) ? 't-warn' : 't-ok'}">${
      c.high === 0 ? 'Free' : `${shortMoney(c.low, c.currency)}–${shortMoney(c.high, c.currency)}`}<span>${overBudget(c) ? 'above your limit' : state.profile.constraints.max_cost == null ? 'no limit set' : 'within your limit'}</span></dd>`;
  const fund = `<dd class="${nf ? 't-ok' : 't-mute'}">${nf ? `${nf} option${nf === 1 ? '' : 's'}` : 'None found'}</dd>`;
  const visa = !abroad ? '<dd class="t-ok">Not needed</dd>'
    : `<dd class="${v === 'yes' ? 't-soon' : v === 'no' ? 't-ok' : 't-near'}">${v === 'yes' ? 'Needed' : v === 'no' ? 'Not needed' : 'Maybe'}</dd>`;
  return `<dl class="facts-row">
    <div><dt>Next deadline</dt>${dl}</div>
    <div><dt>Cost</dt>${cost}</div>
    <div><dt>Funding</dt>${fund}</div>
    <div><dt>Visa</dt>${visa}</div>
  </dl>`;
}

function subBars(o) {
  const subs = o.priority?.sub_scores;
  if (!subs) return '';
  return `<div class="sb">${SUBS.map(([k, label]) => {
    const s = subs[k]?.score;
    if (typeof s !== 'number') return `<div class="sb-r na" title="${label}: doesn't apply"><span>${SUB_SHORT[k]}</span><i></i></div>`;
    return `<div class="sb-r" title="${label}: ${s}/100"><span>${SUB_SHORT[k]}</span><i><b class="${tone(s)}" style="width:${s}%"></b></i></div>`;
  }).join('')}</div>`;
}

function oppRow(o, rank, top = false) {
  const saved = state.saved.includes(o.id);
  const p = priorityOf(o);
  return `<article class="lr ${top ? 'lr-top' : ''}" data-opp="${esc(o.id)}" style="animation-delay:${Math.min(rank * 45, 400)}ms">
    <div class="lr-rank">${String(rank).padStart(2, '0')}</div>
    <div class="lr-score">
      <div class="lr-num ${tone(p)}">${p}</div>
      <div class="lr-cap">worth it</div>
      ${subBars(o)}
    </div>
    <div class="lr-main">
      ${kicker(o)}
      <h3 class="lr-title"><a href="#/brief/${esc(o.id)}">${esc(o.title)}</a></h3>
      <div class="lr-host">${esc(o.host)} <a class="src-link" href="${safeUrl(o.source_url)}" target="_blank" rel="noopener noreferrer">Call page ↗</a></div>
      ${top && o.tagline ? `<p class="lr-tag">${esc(o.tagline)}</p>` : ''}
      ${factsRow(o)}
    </div>
    <div class="lr-act">
      <a class="btn btn-primary btn-sm" href="#/brief/${esc(o.id)}">Is it worth it?</a>
      <button class="btn btn-ghost btn-sm" data-act="save" data-id="${esc(o.id)}" title="Adds its deadlines to your Tracker">${saved ? '★ Saved' : '☆ Save'}</button>
      <button class="btn btn-quiet btn-sm" data-act="dismiss" data-id="${esc(o.id)}" title="Hides it and asks why, so the ranking learns">Not for me</button>
    </div>
  </article>`;
}

/* ============================================================
   Screen — welcome
   ============================================================ */

function renderWelcome() {
  $('#topbar').hidden = true;
  return `<section class="hero">
    <div class="hero-inner">
      <div class="hero-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="44" height="44" fill="none">
          <path d="M16 3c0 4 -4 5 -4 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M16 3c3 1 5 0 6 -1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="16" r="3.4" fill="currentColor"/>
          <circle cx="19" cy="16" r="3.4" fill="currentColor" opacity=".72"/>
          <circle cx="15.5" cy="22.5" r="3.4" fill="currentColor" opacity=".86"/>
          <circle cx="22" cy="22" r="2.8" fill="currentColor" opacity=".5"/>
          <circle cx="9" cy="22" r="2.8" fill="currentColor" opacity=".5"/>
        </svg>
      </div>
      <h1>Conferences, journal calls and fellowships <em>worth your time.</em></h1>

      <ol class="steps3">
        <li><span class="s3-ico" aria-hidden="true">✍️</span><span>Tell us what you research</span></li>
        <li><span class="s3-ico" aria-hidden="true">🔎</span><span>We search societies, journals and funders</span></li>
        <li><span class="s3-ico" aria-hidden="true">✅</span><span>You get a shortlist with costs and deadlines</span></li>
      </ol>

      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="#/onboarding" data-act="fresh-start">Get started</a>
        <a class="btn btn-ghost btn-lg" href="#/example">See an example</a>
      </div>

      <p class="hero-note">Prototype · ${EXAMPLES.length} example researchers · real calls gathered ${fmtDate(GATHERED_AT)}</p>
    </div>
  </section>`;
}

/* ============================================================
   Screen — onboarding
   ============================================================ */

let onbStep = 0;
let draft = null;
let topicQuery = '';

const STEPS = ['Your research', 'Your practicalities'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A new profile starts with nothing selected; unanswered choices get neutral defaults on finish. */
function blankDraft() {
  return {
    id: 'p_you', name: 'You', fictional: false, orcid: null, affiliation: '', input_text: '', research_summary: '',
    career_stage: null, year: null, topics: [], fields: [], adjacent_fields: [], citation_neighborhood: [], goals: [],
    geography: { country: '', city: '', passport: '' }, currency: '',
    constraints: { max_cost: null, months_available: [...MONTHS], visa_tolerance: null, format: null },
    profile_type: 'academic',
  };
}

/** Budget slider [min, max, step] per currency: roughly ₹20k to ₹5 lakh in each. The top stop means no limit. */
const BUDGET_RANGE = {
  INR: [20000, 500000, 5000], USD: [250, 5500, 50], EUR: [200, 4500, 50], GBP: [200, 4000, 50],
  BRL: [1000, 27000, 500], NGN: [300000, 9000000, 50000], PKR: [60000, 1600000, 10000],
  KES: [30000, 780000, 5000], IDR: [3000000, 95000000, 500000], BDT: [25000, 700000, 5000], GHS: [2500, 65000, 500],
};

const budgetLabel = (v, top, cur) => (v == null ? `${money(top, cur)}+ · no limit` : money(v, cur));
const overBudget = (cost) => state.profile.constraints.max_cost != null && cost.high > state.profile.constraints.max_cost;

function progressHtml() {
  const dots = STEPS.map((_, i) =>
    `<span class="onb-dot ${i < onbStep ? 'done' : i === onbStep ? 'active' : ''}"></span>`).join('');
  return `<div class="onb-progress"><span class="onb-step">Step ${onbStep + 1} of ${STEPS.length} · ${STEPS[onbStep]}</span>${dots}</div>`;
}

function renderOnboarding() {
  $('#topbar').hidden = true;
  draft ??= blankDraft();
  return `<div class="onb onb-wide">
    ${progressHtml()}
    <div class="onb-panel" id="onb-panel">${[stepResearch, stepPractical][onbStep]()}</div>
  </div>`;
}

function vocabHtml() {
  const q = topicQuery.trim().toLowerCase();
  const groups = topicVocabulary.map((g) => {
    const ts = g.topics.filter((t) => !q || t.term.toLowerCase().includes(q) || g.field.toLowerCase().includes(q));
    if (!ts.length) return '';
    return `<div class="vocab-g"><div class="vocab-f">${esc(g.field)}</div><div class="row">
      ${ts.map((t) => {
        const on = draft.topics.some((x) => x.term === t.term);
        return `<button class="chip ${on ? 'chip-grape' : 'chip-outline'}" data-act="addtopic" data-term="${esc(t.term)}" aria-pressed="${on}">${on ? '✓' : '+'} ${esc(t.term)}</button>`;
      }).join('')}</div></div>`;
  }).join('');
  return groups || '<p class="small muted">No topics match. Add it as your own below.</p>';
}

function stepResearch() {
  const rows = draft.topics.map((t, i) => `
    <div class="topic-row" style="animation-delay:${i * 35}ms">
      <span class="t-name">${esc(t.term)}</span>
      <input type="range" min="0" max="100" value="${Math.round(t.weight * 100)}"
             data-act="weight" data-i="${i}" aria-label="How central is ${esc(t.term)}" />
      <button class="t-del" data-act="deltopic" data-i="${i}" aria-label="Remove ${esc(t.term)}">×</button>
    </div>`).join('');

  return `<h2 class="onb-q">What do you work on?</h2>
    <p class="onb-help">Describe it in your own words, pick topics from the list, or both. Everything stays editable.</p>

    <div class="onb-split">
      <div class="onb-col">
        <label for="describe">Describe your research</label>
        <textarea id="describe" rows="7" data-act="describe"
          placeholder="e.g. I study how Dalit and Bahujan creators use Instagram and YouTube, and how platforms moderate caste speech. I'd like feedback before writing my chapters, and my budget is tight.">${esc(draft.input_text ?? '')}</textarea>
        <div class="row" style="margin-top:.6rem">
          <button class="btn btn-primary btn-sm" data-act="draft">Suggest topics from this</button>
          <button class="btn btn-quiet btn-sm" data-act="orcid">Import from ORCID</button>
        </div>
      </div>
      <div class="onb-col">
        <label for="topicsearch">Or browse topics</label>
        <input type="search" id="topicsearch" data-act="topicsearch" placeholder="Search, e.g. memory, platform, cinema" value="${esc(topicQuery)}" autocomplete="off" />
        <div class="vocab" id="vocab">${vocabHtml()}</div>
      </div>
    </div>

    <div class="field" style="margin-top:1.6rem">
      <label>Your topics <span class="hint" style="display:inline">— slide right for what matters most</span></label>
      <div class="topic-list">${rows || '<p class="muted small" style="margin:0">None yet. Describe your work or pick from the list above.</p>'}</div>
      <div class="input-row" style="margin-top:.7rem">
        <input type="text" id="newtopic" placeholder="Add your own topic" />
        <button class="btn btn-ghost" data-act="addcustom">Add</button>
      </div>
    </div>

    <div class="field">
      <label>What do you want out of it? <span class="hint" style="display:inline">— pick up to 3. This changes how the feed is ranked.</span></label>
      <div class="opt-grid">
        ${GOALS.map((g) => `<button class="opt" data-act="goal" data-v="${g.id}" aria-pressed="${(draft.goals ?? []).includes(g.id)}">
          <span>${g.emoji} ${g.label}</span><span class="opt-sub">${g.sub}</span></button>`).join('')}
      </div>
    </div>

    <div class="onb-actions">
      <button class="btn btn-primary" data-act="next" ${draft.topics.length ? '' : 'disabled'}>Continue</button>
      <button class="btn btn-quiet" data-act="example">Use the example researcher</button>
    </div>`;
}

function stepPractical() {
  const c = draft.constraints;
  const [min, max, step] = BUDGET_RANGE[draft.currency] ?? BUDGET_RANGE.USD;
  if (c.max_cost != null) c.max_cost = Math.min(max, Math.max(min, c.max_cost));
  const stages = [['phd', 'PhD', 'Doctoral researcher'], ['postdoc', 'Postdoc', 'Early career'],
    ['faculty', 'Faculty', 'Permanent post'], ['independent', 'Independent', 'Unaffiliated']];
  const pick = (act, cur, opts) => `<div class="opt-grid">${opts.map(([v, l, s]) =>
    `<button class="opt" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}"><span>${l}</span><span class="opt-sub">${s}</span></button>`).join('')}</div>`;

  return `<h2 class="onb-q">Where are you, and what can you manage?</h2>
    <p class="onb-help">This decides fee tiers, the currency costs are shown in, and whether a trip means a visa.
      Things outside your limits are still shown, just ranked lower and labelled.</p>

    <div class="field"><label>Career stage</label>${pick('stage', draft.career_stage, stages)}</div>

    <div class="grid3">
      <div class="field"><label for="country">Based in</label>
        <input type="text" id="country" value="${esc(draft.geography.country)}" data-act="country" /></div>
      <div class="field"><label for="passport">Passport</label>
        <input type="text" id="passport" value="${esc(draft.geography.passport)}" data-act="passport" /></div>
      <div class="field"><label for="currency">Show costs in</label>
        <select id="currency" data-act="currency">
          <option value="" ${draft.currency ? '' : 'selected'} disabled>Choose…</option>
          ${['INR', 'USD', 'EUR', 'GBP', 'BRL', 'NGN', 'PKR', 'KES', 'IDR', 'BDT', 'GHS'].map((cur) => `<option value="${cur}" ${draft.currency === cur ? 'selected' : ''}>${cur}</option>`).join('')}
        </select></div>
    </div>
    <span class="hint" style="margin-top:-.6rem;display:block">Your passport is used only for visa requirements and regional fee tiers.</span>

    <div class="field" style="margin-top:1.2rem">
      <label for="budget">Most you could spend on one trip: <strong id="budget-out">${draft.currency ? budgetLabel(c.max_cost, max, draft.currency) : 'pick a currency first'}</strong></label>
      <input type="range" id="budget" min="${min}" max="${max}" step="${step}" value="${c.max_cost ?? max}" data-act="budget" ${draft.currency ? '' : 'disabled'} />
      <span class="hint">Slide all the way right for no limit.</span>
    </div>

    <div class="field"><label>Format</label>${pick('format', c.format,
      [['any', 'Either', 'In person or online'], ['in_person', 'In person', 'Travel is the point'], ['online', 'Online only', 'No travel']])}</div>

    <div class="field"><label>Visas</label>${pick('visatol', c.visa_tolerance,
      [['any', 'Anywhere', 'Visas are fine'], ['prefer_none', 'Prefer easy', 'Rank visa-free higher'], ['none', 'Visa-free only', 'Hide the rest']])}</div>

    <div class="onb-actions">
      <button class="btn btn-primary btn-lg" data-act="finish">Find my opportunities →</button>
      <button class="btn btn-quiet" data-act="back">Back</button>
    </div>`;
}

function suggestFromText(text) {
  const t = ` ${text.toLowerCase()} `;
  let added = 0;
  draft.topics = draft.topics.filter((x) => x.src !== 'suggested');
  for (const g of topicVocabulary) for (const topic of g.topics) {
    const hits = topic.k.filter((kw) => t.includes(kw)).length;
    if (!hits || draft.topics.some((x) => x.term === topic.term)) continue;
    draft.topics.push({ term: topic.term, weight: Math.min(0.95, 0.55 + 0.15 * hits), src: 'suggested' });
    added++;
  }
  draft.topics.sort((a, b) => b.weight - a.weight);
  return added;
}

function onboardingEvents(root) {
  // In-step updates (chips, goals, currency) repaint quietly; changing step replays the slide-in and updates the header.
  const repaint = (stepChanged = false) => {
    $('#onb-panel', root).outerHTML = `<div class="onb-panel ${stepChanged ? '' : 'still'}" id="onb-panel">${[stepResearch, stepPractical][onbStep]()}</div>`;
    if (stepChanged) $('.onb-progress', root).outerHTML = progressHtml();
  };

  root.addEventListener('input', (e) => {
    const act = e.target.dataset.act;
    if (act === 'weight') draft.topics[+e.target.dataset.i].weight = +e.target.value / 100;
    if (act === 'describe') draft.input_text = e.target.value;
    if (act === 'topicsearch') { topicQuery = e.target.value; $('#vocab', root).innerHTML = vocabHtml(); }
    if (act === 'budget') {
      const v = +e.target.value, top = +e.target.max;
      draft.constraints.max_cost = v >= top ? null : v;
      $('#budget-out').textContent = budgetLabel(draft.constraints.max_cost, top, draft.currency);
    }
    if (act === 'country') draft.geography.country = e.target.value;
    if (act === 'passport') draft.geography.passport = e.target.value;
    if (act === 'currency') { draft.currency = e.target.value; draft.constraints.max_cost = null; repaint(); }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || ['INPUT', 'SELECT', 'TEXTAREA'].includes(btn.tagName)) return;

    switch (btn.dataset.act) {
      case 'draft': {
        if (LIVE) { liveDraft(btn, repaint); break; }
        const n = suggestFromText(draft.input_text ?? '');
        repaint();
        toast(n ? { emoji: '✨', title: `Suggested ${n} topic${n === 1 ? '' : 's'}`, body: 'Drafts, not facts. Remove any that are wrong and slide the ones that matter most.' }
          : { emoji: '🤔', title: 'Nothing matched yet', body: 'Try a sentence or two more, or pick from the list. The live version uses a language model here.' });
        break;
      }
      case 'orcid':
        toast({ emoji: '🪪', title: 'ORCID import is coming with the live backend', body: 'It will read your publications from OpenAlex and draft topics from them. It stays optional.' });
        break;
      case 'example':
        { const ex = pickExample(); state.exampleId = ex.id; draft = structuredClone(ex.profile);
        repaint();
        toast({ emoji: '👤', title: `Loaded ${ex.profile.name}`, body: `A fictional researcher in ${ex.profile.geography.country}, drafted from a short description.` }); }
        break;
      case 'next': onbStep = 1; repaint(true); scrollTo(0, 0); break;
      case 'back': onbStep = 0; repaint(true); scrollTo(0, 0); break;
      case 'deltopic': draft.topics.splice(+btn.dataset.i, 1); repaint(); break;
      case 'addtopic': {
        const i = draft.topics.findIndex((t) => t.term === btn.dataset.term);
        i === -1 ? draft.topics.push({ term: btn.dataset.term, weight: 0.7 }) : draft.topics.splice(i, 1);
        repaint(); break;
      }
      case 'addcustom': {
        const v = $('#newtopic').value.trim();
        if (v) { draft.topics.push({ term: v, weight: 0.7 }); repaint(); }
        break;
      }
      case 'goal': {
        const g = btn.dataset.v;
        draft.goals ??= [];
        const i = draft.goals.indexOf(g);
        if (i !== -1) draft.goals.splice(i, 1);
        else if (draft.goals.length < 3) draft.goals.push(g);
        else toast({ emoji: '✋', title: 'Up to three', body: 'Unpick one first. Fewer goals means a sharper ranking.' });
        repaint(); break;
      }
      case 'stage': draft.career_stage = btn.dataset.v; repaint(); break;
      case 'format': draft.constraints.format = btn.dataset.v; repaint(); break;
      case 'visatol': draft.constraints.visa_tolerance = btn.dataset.v; repaint(); break;
      case 'finish': {
        const isExample = EXAMPLES.some((e) => e.id === draft.id);
        draft.currency ||= 'USD';
        draft.constraints.format ||= 'any';
        draft.constraints.visa_tolerance ||= 'any';
        draft.geography.passport ||= draft.geography.country;
        if (isExample) state.exampleId = draft.id;
        state.profile = draft;
        state.onboarded = true;
        state.weightAdjust = {};
        state.mode = isExample ? 'example' : 'mine';
        save();
        draft = null; onbStep = 0;
        location.hash = !isExample && LIVE && state.search?.key !== profileKey() ? '#/searching' : '#/thinking';
        break;
      }
    }
  });
}

/* ============================================================
   Screen — agent pipeline
   ============================================================ */

function renderPipeline() {
  $('#topbar').hidden = true;
  return `<section class="pipe-screen">
    <div class="pipe2">
      <div class="pipe2-head">
        <h2>Finding opportunities for you</h2>
        <button class="btn btn-quiet btn-sm" data-act="skip">Skip →</button>
      </div>
      <div class="pipe-bar"><i id="pipe-bar"></i></div>
      <div class="pipe2-grid">
        <ol class="pipe2-steps" id="pipe-steps">
          ${curPipeline().map((s, i) => `<li data-i="${i}"><span class="p2-dot" aria-hidden="true"></span><span>${s.label}</span></li>`).join('')}
        </ol>
        <div class="pipe2-live" aria-live="polite">
          <div class="p2-title" id="p2-title"></div>
          <div class="p2-detail" id="p2-detail"></div>
          <div class="p2-stream" id="p2-stream"></div>
        </div>
      </div>
    </div>
  </section>`;
}

/** What each step "shows" while it runs: real items from the profile and the gathered data. */
function pipelineStreams() {
  const p = state.profile;
  const opps = allOpportunities().filter((o) => o.status !== 'stale');
  const ranked = [...opps].sort((a, b) => priorityOf(b) - priorityOf(a));
  return [
    (p.topics ?? []).slice(0, 6).map((t) => t.term),
    [...(p.fields ?? []), ...(p.adjacent_fields ?? [])].slice(0, 6).map((f, i) => (i < (p.fields ?? []).length ? f : `+ ${f}`)),
    opps.slice(0, 7).map((o) => o.host.replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 42)),
    opps.slice(0, 7).map((o) => hostOf(o.source_url)).filter(Boolean),
    opps.filter((o) => o.cost_estimate?.high).slice(0, 5).map((o) => `${shortMoney(o.cost_estimate.low, o.cost_estimate.currency)}–${shortMoney(o.cost_estimate.high, o.cost_estimate.currency)} · ${o.title.split(/[—:(]/)[0].trim().slice(0, 28)}`),
    ranked.slice(0, 3).map((o, i) => `${i + 1}. ${o.title.split(/[—:(]/)[0].trim().slice(0, 40)} · ${priorityOf(o)}`),
    ['Deadlines ✓', 'Fees ✓', 'Funding links ✓', `${exampleSet().meta.grounded_pass} of ${exampleSet().meta.grounded_total} matched`],
  ];
}

let pipeTimers = [];

function runPipeline() {
  pipeTimers.forEach(clearTimeout);
  pipeTimers = [];
  const steps = $$('#pipe-steps li');
  const streams = pipelineStreams();
  const STEP_MS = 1900;
  const at = (ms, fn) => pipeTimers.push(setTimeout(fn, ms));

  steps.forEach((el, i) => {
    const start = 300 + i * STEP_MS;
    at(start, () => {
      steps.forEach((s) => s.classList.remove('active'));
      el.classList.add('active');
      $('#pipe-bar').style.width = `${(i / steps.length) * 100}%`;
      $('#p2-title').textContent = curPipeline()[i].label;
      $('#p2-detail').textContent = curPipeline()[i].detail;
      $('#p2-stream').innerHTML = '';
    });
    (streams[i] ?? []).forEach((item, j) => at(start + 250 + j * 210, () => {
      const chip = document.createElement('span');
      chip.className = 'p2-item';
      chip.textContent = item;
      $('#p2-stream')?.append(chip);
    }));
    at(start + STEP_MS - 120, () => { el.classList.remove('active'); el.classList.add('done'); });
  });

  const end = 300 + steps.length * STEP_MS;
  at(end, () => { const bar = $('#pipe-bar'); if (bar) bar.style.width = '100%'; });
  at(end + 450, () => { location.hash = '#/feed'; });
}

/* ============================================================
   Screen — feed
   ============================================================ */

let feedFilter = 'all';

function visibleOpportunities() {
  let list = allOpportunities().filter((o) => !state.dismissed.includes(o.id) && o.status !== 'stale');
  if (!state.showIneligible) list = list.filter((o) => o.eligible !== 'no');
  if (state.profile.constraints.visa_tolerance === 'none') list = list.filter((o) => o.visa?.required !== 'yes');
  if (feedFilter === 'saved') list = list.filter((o) => state.saved.includes(o.id));
  else if (feedFilter !== 'all') list = list.filter((o) => o.type === feedFilter);
  return list.sort((a, b) => priorityOf(b) - priorityOf(a));
}

const hiddenIneligible = () => allOpportunities().filter((o) => !state.dismissed.includes(o.id) && o.status !== 'stale' && o.eligible === 'no').length;

function renderFeed() {
  $('#topbar').hidden = false;
  if (mineLive()) return renderMineFeed();
  const list = visibleOpportunities();
  const ranked = list.filter((o) => !o.predatory_flag);
  const flagged = list.filter((o) => o.predatory_flag);
  const top = ranked.filter(actionable).slice(0, 3);
  const rest = ranked.filter((o) => !top.includes(o));
  const nIneligible = hiddenIneligible();
  const soon = ranked.map(futureDeadline).filter((d) => d && daysUntil(d.date) <= 30).length;
  const funded = ranked.filter((o) => openFunding(o).length).length;
  const first = state.profile.name === 'You' ? null : esc(state.profile.name.split(' ')[0]);
  const goals = (state.profile.goals ?? []).map((g) => GOALS.find((x) => x.id === g)?.label.toLowerCase()).filter(Boolean);

  const filters = [['all', 'All'], ['conference', 'Conferences'], ['journal_call', 'Journal calls'],
    ['fellowship', 'Fellowships'], ['saved', `Saved · ${state.saved.length}`]];

  return `<div class="wrap wrap-feed">
    <header class="feed-head">
      <div class="eyebrow">Example researcher · real calls gathered ${fmtDate(exampleSet().gathered_at)} · <a href="#/example">show another example</a></div>
      <h1>${first ? `${first}'s shortlist` : 'Your shortlist'}</h1>
      <div class="ledger">
        <div><b>${ranked.length}</b><span>opportunities</span></div>
        <div class="${soon ? 'warm' : ''}"><b>${soon}</b><span>deadlines in the next 30 days</span></div>
        <div class="green"><b>${funded}</b><span>with funding you could apply for</span></div>
      </div>
    </header>

    <div class="feed-bar">
      <div class="filters">
        ${filters.map(([v, l]) => `<button class="filter" data-act="filter" data-v="${v}" aria-pressed="${feedFilter === v}">${l}</button>`).join('')}
      </div>
      <p class="feed-note">Ranked by ${goals.length ? goals.join(', ') : 'your profile'} · <a href="#/profile">change</a> · <a href="#/how">how scores work</a></p>
    </div>

    ${list.length === 0 ? `<div class="empty"><span class="big" aria-hidden="true">🍇</span>
        <p><strong>Nothing here yet.</strong></p>
        <p class="small">${feedFilter === 'saved' ? 'Save something and it shows up here and in your Tracker.' : 'You have dismissed everything in this view.'}</p>
        ${feedFilter !== 'all' ? '<button class="btn btn-ghost btn-sm" data-act="filter" data-v="all">Show all</button>' : ''}
      </div>` : ''}

    ${top.length ? `<h2 class="list-h">Apply now</h2>
      <div class="ledger-list">${top.map((o, i) => oppRow(o, i + 1, true)).join('')}</div>` : ''}

    ${rest.length ? `<h2 class="list-h">Also worth a look <span>closed this year, next edition, or lower fit</span></h2>
      <div class="ledger-list">${rest.map((o, i) => oppRow(o, top.length + i + 1)).join('')}</div>` : ''}

    ${flagged.length ? `<h2 class="list-h">Be careful <span>no traceable scholarly record</span></h2>
      <div class="ledger-list">${flagged.map((o, i) => oppRow(o, ranked.length + i + 1)).join('')}</div>` : ''}

    ${nIneligible ? `<p class="small muted" style="margin-top:1.4rem">
      ${state.showIneligible ? 'Showing' : 'Hiding'} ${nIneligible} you can't apply to.
      <button class="btn btn-quiet btn-sm" data-act="toggle-inelig">${state.showIneligible ? 'Hide them' : 'Show them'}</button></p>` : ''}

    <form class="paste-box" id="paste-form" style="margin-top:2.4rem">
      <span class="paste-label">Know about one that's missing? Paste its link.</span>
      <input type="text" id="paste-url" placeholder="https://…" aria-label="Opportunity URL" />
      <button class="btn btn-primary" type="submit">Add it</button>
    </form>
  </div>`;
}

function pasteEvents(root) {
  const form = $('#paste-form', root);
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('#paste-url').value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({ emoji: '🚫', title: 'Paste a full web link', body: 'It should start with http:// or https://' });
      return;
    }
    LIVE ? showLivePasteModal(url) : showPasteModal(url);
  });
}

/* ---------- live mode: calls the /api functions when an API key is configured ---------- */

async function api(path, body, timeoutMs = 180000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch {
    throw new Error(ctrl.signal.aborted ? 'This took too long and was stopped. Please try again.' : 'Could not reach the server. Check your connection and try again.');
  } finally { clearTimeout(timer); }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

async function liveDraft(btn, repaint) {
  const text = (draft.input_text ?? '').trim();
  if (text.length < 20) { toast({ emoji: '✍️', title: 'Add a bit more', body: 'A sentence or two about what you research is enough.' }); return; }
  btn.disabled = true;
  btn.textContent = 'Reading…';
  try {
    const d = await api('topics', { text });
    let added = 0;
    draft.topics = draft.topics.filter((t) => t.src !== 'suggested');
    for (const t of d.topics) {
      t.src = 'suggested';
      if (draft.topics.some((x) => x.term.toLowerCase() === t.term.toLowerCase())) continue;
      draft.topics.push(t); added++;
    }
    draft.topics.sort((a, b) => b.weight - a.weight);
    if (d.fields.length) draft.fields = d.fields;
    if (d.adjacent_fields.length) draft.adjacent_fields = d.adjacent_fields;
    repaint();
    toast({ emoji: '✨', title: `Suggested ${added} topic${added === 1 ? '' : 's'}`,
      body: d.adjacent_fields.length ? `Also searching nearby fields: ${d.adjacent_fields.slice(0, 3).join(', ')}.` : 'Remove any that are wrong and slide the ones that matter most.' });
  } catch (err) {
    const n = suggestFromText(text);
    repaint();
    toast({ emoji: '⚠️', title: 'Live suggestions unavailable', body: `${err.message} Used simple matching instead (${n} found).` });
  }
}

function showLivePasteModal(url) {
  const steps = [
    ['fetch', 'Opening the page safely', 'Private and internal addresses are blocked'],
    ['read', 'Reading the call', 'Dates, fees, who can apply, funding'],
    ['brief', 'Working out if it’s worth it for you', 'Cost, funding and your score'],
  ];
  openModal(`
    <h3>Adding this to your shortlist</h3>
    <p class="modal-sub">${esc(url)}</p>
    <div class="pipe-steps" id="live-steps">
      ${steps.map(([k, l, d]) => `<div class="pipe-step" data-k="${k}">
        <span class="pipe-bullet" aria-hidden="true">✓</span>
        <span><span class="pipe-label">${l}</span><br/><span class="pipe-detail">${d}</span></span>
      </div>`).join('')}
    </div>
    <p class="tiny muted" style="margin-top:.8rem">Usually takes under a minute.</p>
    <div id="live-out" style="margin-top:1rem"></div>
  `, async () => {
    const mark = (k, cls) => { const el = $(`#live-steps [data-k="${k}"]`); if (el) { el.classList.remove('active'); el.classList.add(cls); } };
    const out = () => $('#live-out');
    try {
      mark('fetch', 'active'); mark('read', 'active');
      const { opportunity } = await api('extract', { url });
      mark('fetch', 'done'); mark('read', 'done'); mark('brief', 'active');
      const { brief } = await api('brief', { opportunity, profile: state.profile });
      mark('brief', 'done');
      const merged = { ...opportunity, venue_funding: opportunity.funding, ...brief, pasted: true };
      if (!out()) return;
      out().innerHTML = `<div class="orcid-result"><span aria-hidden="true">✅</span><span>
          <strong>${esc(merged.title)}</strong><br/>Worth-it score <strong>${priorityOf(merged)}</strong>. ${esc(merged.tagline ?? '')}</span></div>
        <div class="onb-actions"><button class="btn btn-primary" data-act="live-ok">Add to my shortlist</button>
        <button class="btn btn-quiet" data-act="live-cancel">Cancel</button></div>`;
      out().addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (a === 'live-cancel') closeModal();
        if (a === 'live-ok') {
          state.pasted = state.pasted.filter((p) => p.id !== merged.id);
          state.pasted.push(merged);
          save(); closeModal();
          location.hash = `#/brief/${merged.id}`;
          toast({ emoji: '🔗', title: 'Added to your shortlist', body: 'Read by Claude from the page you pasted. Check the source before acting.' });
        }
      });
    } catch (err) {
      $$('#live-steps .pipe-step.active').forEach((el) => el.classList.remove('active'));
      if (out()) out().innerHTML = `<div class="callout danger"><h4>Couldn't add that link</h4><p>${esc(err.message)}</p></div>
        <div class="onb-actions"><button class="btn btn-quiet" type="button">Close</button></div>`;
      $('#live-out .btn')?.addEventListener('click', closeModal);
    }
  });
}

function showPasteModal(url) {
  const checks = [
    ['Scheme allowlist', 'https accepted'],
    ['DNS resolution', 'public address — private, loopback and metadata ranges blocked'],
    ['Redirects', '1 hop, re-checked against the same IP rules'],
    ['Response cap', '412 KB of 2 MB limit, 4.1 s of 10 s timeout'],
    ['Extraction Worker', 'page content delimited as data, never as instructions'],
    ['Schema validation', '18 of 18 fields conform'],
  ];

  openModal(`
    <h3>Fetching that page</h3>
    <p class="modal-sub">Pasted URLs are fetched by the server, which makes this the most attackable path in the product. Here is what it does before the model sees anything.</p>
    <div class="pipe-steps" id="paste-steps">
      ${checks.map((c, i) => `<div class="pipe-step" data-i="${i}">
        <span class="pipe-bullet" aria-hidden="true">✓</span>
        <span><span class="pipe-label">${c[0]}</span><br/><span class="pipe-detail">${c[1]}</span></span>
      </div>`).join('')}
    </div>
    <div id="paste-done" style="margin-top:1.2rem"></div>
  `, () => {
    const steps = $$('#paste-steps .pipe-step');
    steps.forEach((el, i) => setTimeout(() => el.classList.add('done'), 220 + i * 320));
    setTimeout(() => {
      const out = $('#paste-done');
      if (!out) return;
      out.innerHTML = `<div class="orcid-result"><span aria-hidden="true">✅</span>
        <span>${heldBack
          ? `<strong>Extracted.</strong> This prototype has no server yet, so whatever you paste it returns one real call held back from your feed (<em>${esc(heldBack.title)}</em>). The live version runs the extract-opportunity skill on your actual link.`
          : '<strong>Queued.</strong> This prototype has no server yet. The live version runs the extract-opportunity skill on your link.'}</span></div>
        <div class="onb-actions">${heldBack ? '<button class="btn btn-primary" data-act="paste-ok">Add it to my feed</button>' : ''}
        <button class="btn btn-quiet" data-act="paste-cancel">Cancel</button></div>`;
      out.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (a === 'paste-cancel') closeModal();
        if (a === 'paste-ok') {
          // `url` is user input: scheme-checked above, stripped of attribute-breaking
          // characters here, and escaped again wherever it is rendered.
          const clean = url.replace(/["'<>`\s]/g, '');
          if (heldBack && !state.pasted.some((p) => p.id === heldBack.id)) state.pasted.push({ ...heldBack, pasted: true, pasted_url: clean });
          save(); closeModal(); render();
          toast({ emoji: '🔗', title: 'Added to your feed', body: 'Scored against your profile like everything else.' });
        }
      });
    }, 220 + checks.length * 320 + 300);
  });
}

/* ============================================================
   Screen — brief
   ============================================================ */

let briefTab = 'worth';
let briefFor = null;

const BRIEF_TABS = [['worth', 'Worth it?'], ['dates', 'Deadlines'], ['money', 'Cost & funding'], ['go', 'Can I go?'], ['about', 'About']];
const ELIG_FUND = { yes: ['chip-vine', 'You qualify'], likely: ['chip-vine', 'Likely eligible'], check: ['chip-amber', 'Check'],
  no: ['chip-outline', 'Not now'], true: ['chip-vine', 'You qualify'], false: ['chip-outline', 'Not now'] };

function tabWorth(o) {
  const subs = o.priority?.sub_scores ?? {};
  const w = weightsFor();
  return `<div class="subs">
      ${SUBS.map(([k, label, q]) => {
        const s = subs[k];
        if (!s || typeof s.score !== 'number') return `<div class="sub-row na"><span class="sub-l">${label}</span><span class="muted tiny">doesn't apply to ${TYPE_CHIP[o.type]?.[1].toLowerCase() ?? 'this'}s</span></div>`;
        const tone = s.score >= 75 ? 'hi' : s.score >= 55 ? 'mid' : 'lo';
        return `<details class="sub-row">
          <summary><span class="sub-l">${label}<span class="sub-q">${q}</span></span>
            <span class="sub-bar"><i class="${tone}" style="width:${s.score}%"></i></span>
            <span class="sub-n">${s.score}</span><span class="sub-why">why?</span></summary>
          <p class="sub-r">${esc(s.reason)} <span class="muted tiny">Counts for ${Math.round(w[k] * 100)}% of the score.</span></p>
        </details>`;
      }).join('')}
    </div>
    <div class="gowatch">
      ${o.why_go?.length ? `<div class="go"><h4>👍 Why go</h4><ul>${o.why_go.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${o.watch_out?.length ? `<div class="watch"><h4>⚠️ Watch out</h4><ul>${o.watch_out.slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
}

function timelineRow(d) {
  const u = urgency(d.date);
  return `<div class="tl ${daysUntil(d.date) < 0 ? 'is-past' : ''}">
    <div class="tl-date"><div class="tl-d">${fmtDate(d.date)}</div><div class="tl-in">${relative(d.date)}</div></div>
    <div class="tl-rail"><span class="tl-line"></span><span class="tl-dot ${d.depends_on || d.requires ? 'dep' : ''} ${u === 'soon' ? 'soon' : ''}"></span></div>
    <div class="tl-body">
      <div class="tl-label">${d.fund_name ? `🎁 ${esc(d.fund_name)}` : DEADLINE_LABEL[d.label]} ${d.grounded ? conf('verified') : conf('inferred')}</div>
      ${d.synthetic ? `<div class="tl-why">Not on the call page. Start about ${d.lead} days before you travel.</div>` : ''}
      ${d.depends_on ? `<span class="tl-dep">⛓ only after your ${DEADLINE_LABEL[d.depends_on]?.toLowerCase() ?? esc(d.depends_on)} is accepted</span>` : ''}
      ${d.requires ? `<span class="tl-dep">⛓ needs: ${esc(d.requires)}</span>` : ''}
      ${srcQuote(d.source_quote)}
    </div>
  </div>`;
}

function tabDates(o) {
  const dl = deadlinesFor(o);
  const past = dl.filter((d) => daysUntil(d.date) < 0);
  const next = dl.filter((d) => daysUntil(d.date) >= 0);
  if (!dl.length) return '<p class="small muted">No dates published yet. They get picked up on the next refresh.</p>';
  return `${next.length ? `<div class="timeline">${next.map(timelineRow).join('')}</div>`
      : '<p class="small muted">Nothing left to act on for this edition.</p>'}
    ${past.length ? `<details class="more"><summary>${past.length} date${past.length === 1 ? '' : 's'} already passed</summary>
      <div class="timeline">${past.map(timelineRow).join('')}</div></details>` : ''}`;
}

function fundRow(f) {
  const [cls, label] = ELIG_FUND[String(f.eligible)] ?? ['chip-outline', 'Check'];
  const when = f.deadline && /^\d{4}-/.test(f.deadline) ? `closes ${fmtDate(f.deadline)}` : f.cycle ? esc(f.cycle) : 'no fixed deadline';
  return `<details class="fund-row">
    <summary><span class="fund-name">${esc(f.name)}</span><span class="chip ${cls}">${label}</span>
      <span class="fund-meta">${esc(f.amount_note ?? '')}${f.amount_note ? ' · ' : ''}${when}</span></summary>
    <div class="fund-body">
      ${f.requires ? `<p><strong>Needs first:</strong> ${esc(f.requires)}</p>` : ''}
      ${f.sequence_note ? `<p><strong>When to apply:</strong> ${esc(f.sequence_note)}</p>` : ''}
      ${f.why || f.eligibility_notes ? `<p>${esc(f.why ?? f.eligibility_notes)}</p>` : ''}
      ${srcQuote(f.source_quote)}
      <a class="tiny" href="${safeUrl(f.source_url)}" target="_blank" rel="noopener noreferrer">Official page ↗</a>
    </div>
  </details>`;
}

function tabMoney(o) {
  const cost = o.cost_estimate;
  const segs = cost ? Object.entries(cost.breakdown ?? {}) : [];
  const totalHigh = segs.reduce((s, [, v]) => s + (v?.high ?? 0), 0) || 1;
  const venue = (o.funding ?? []).filter((f) => f.source !== 'external');
  const ext = (o.funding ?? []).filter((f) => f.source === 'external');
  return `${cost ? `<div class="money-top">
      <div><div class="cost-total">${cost.high === 0 ? 'Free' : `${money(cost.low, cost.currency)} – ${money(cost.high, cost.currency)}`}</div>
        <p class="tiny muted" style="margin:.2rem 0 0">Estimated range, in ${esc(cost.currency)}</p></div>
      ${overBudget(cost) ? `<span class="chip chip-amber">Above your ${shortMoney(state.profile.constraints.max_cost, cost.currency)} limit</span>`
        : '<span class="chip chip-vine">Within your limit</span>'}
    </div>
    ${cost.high > 0 ? `<div class="cost-bar">${segs.map(([k, v]) => `<span class="cost-seg" style="width:${((v?.high ?? 0) / totalHigh) * 100}%;background:${COST_COLORS[k] ?? 'var(--muted)'}"></span>`).join('')}</div>
    <div class="cost-key">${segs.filter(([, v]) => v?.high).map(([k, v]) => `<div class="cost-k">
        <span class="cost-sw" style="background:${COST_COLORS[k] ?? 'var(--muted)'}"></span>
        <span>${COST_LABEL[k] ?? esc(k)}</span>
        <span>${v.low === v.high ? money(v.low, cost.currency) : `${money(v.low, cost.currency)}–${money(v.high, cost.currency)}`}</span>
      </div>`).join('')}</div>` : ''}
    ${cost.net_note ? `<div class="net-note">${esc(cost.net_note)}</div>` : ''}
    <details class="more"><summary>How this was worked out</summary>
      <ul class="small">${segs.filter(([, v]) => v?.note).map(([k, v]) => `<li><strong>${COST_LABEL[k] ?? esc(k)}:</strong> ${esc(v.note)}</li>`).join('')}
      ${(cost.assumptions ?? []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}

    <h4 class="fund-h">🎁 From the ${o.type === 'journal_call' ? 'journal' : 'organisers'}</h4>
    ${venue.length ? venue.map(fundRow).join('') : '<p class="small muted">None published.</p>'}
    <h4 class="fund-h">🎁 Elsewhere you could apply</h4>
    ${ext.length ? ext.map(fundRow).join('') : '<p class="small muted">Nothing specific found. Ask your university\'s research office about conference travel funds.</p>'}`;
}

function tabGo(o) {
  const elig = o.eligibility ?? {};
  const v = o.visa;
  return `<div class="go-grid">
    <div class="go-card">
      <h4>✅ Can you apply? ${conf(o.confidence.eligibility)}</h4>
      <p class="small">${esc(o.eligibility_notes ?? '')}</p>
      <dl class="kv">
        <dt>Career stage</dt><dd>${!elig.career_stage?.length ? 'Not stated' : elig.career_stage.includes(state.profile.career_stage) ? 'Accepted' : 'Not listed'}</dd>
        <dt>Membership</dt><dd>${elig.membership_required ? 'Required' : 'Not required'}</dd>
        <dt>Nationality</dt><dd>${esc(elig.nationality ?? 'No restriction')}</dd>
      </dl>
    </div>
    ${v ? `<div class="go-card">
      <h4>🛂 Visa ${conf('advisory')}</h4>
      <p class="visa-verdict ${v.required === 'yes' ? 'v-yes' : v.required === 'no' ? 'v-no' : 'v-maybe'}">${
        v.required === 'yes' ? 'Visa needed' : v.required === 'no' ? 'No visa needed' : 'Depends on your situation'}${v.lead_days ? ` · start ~${v.lead_days} days ahead` : ''}</p>
      <p class="small">${esc(v.note)}</p>
      ${v.official_source ? `<a class="tiny" href="${safeUrl(v.official_source)}" target="_blank" rel="noopener noreferrer">Official source ↗</a>` : ''}
      <p class="tiny muted" style="margin:.6rem 0 0">General information only. Check the official source before you act.</p>
    </div>` : ''}
  </div>`;
}

function tabAbout(o) {
  return `<p>${esc(o.description)}</p>
    ${o.fit?.rationale ? `<h4 class="fund-h">How it connects to your work</h4><p class="small">${esc(o.fit.rationale)}</p>
      <div class="row">${(o.fit.matched_topics ?? []).map((t) => `<span class="chip chip-grape">${esc(t)}</span>`).join('')}</div>` : ''}
    ${o.past_editions?.length ? `<details class="more"><summary>Past editions (${o.past_editions.length})</summary>
      <div class="past">${o.past_editions.map((p) => `<div class="past-ed"><div class="past-y">${esc(p.year ?? '')}</div>
        <div class="past-t">${esc(p.theme ?? '')}${p.city ? ` · ${esc(p.city)}` : ''}</div></div>`).join('')}</div></details>` : ''}
    <details class="more"><summary>How much to trust this</summary>
      <dl class="kv">
        <dt>Deadlines</dt><dd>${conf(o.confidence.dates)}</dd>
        <dt>Fees</dt><dd>${conf(o.confidence.fees)}</dd>
        <dt>Cost</dt><dd>${conf('range')}</dd>
        <dt>Visa</dt><dd>${conf('advisory')}</dd>
      </dl>
      <p class="tiny muted">✓ verified means the exact words were found on the source page and re-checked.</p>
    </details>
    <p style="margin-top:1rem"><a class="btn btn-ghost btn-sm" href="${safeUrl(o.source_url)}" target="_blank" rel="noopener noreferrer">Open the original call ↗</a>
      <span class="tiny muted">checked ${fmtDate(o.extracted_at.slice(0, 10))}</span></p>`;
}

function renderBrief(id) {
  $('#topbar').hidden = false;
  const o = byId(id);
  if (!o) return `<div class="wrap"><div class="empty"><span class="big">🤔</span><p>No brief for that one.</p>
    <a class="btn btn-ghost btn-sm" href="#/feed">Back to the feed</a></div></div>`;
  if (o.unscored) return renderScoring(o);
  if (briefFor !== id) { briefTab = 'worth'; briefFor = id; }

  const saved = state.saved.includes(o.id);
  const nd = futureDeadline(o);
  const cost = o.cost_estimate;
  const funds = openFunding(o);
  const v = o.visa;
  const abroad = o.location.format !== 'online' && o.location.country !== '—' && o.location.country !== homeCountry();
  const p = priorityOf(o);
  const TAB_FN = { worth: tabWorth, dates: tabDates, money: tabMoney, go: tabGo, about: tabAbout };

  return `<div class="wrap wrap-mid">
    <a class="back-link" href="#/feed">← Back to your shortlist</a>

    <header class="brief-head">
      ${kicker(o)}
      <h1>${esc(o.title)}</h1>
      <p class="brief-sub">${esc(o.host)}${o.dates?.end && o.dates.end !== o.dates.start ? ` · until ${fmtDate(o.dates.end)}` : ''}</p>
      <a class="btn btn-ghost btn-sm src-btn" href="${safeUrl(o.source_url)}" target="_blank" rel="noopener noreferrer">Open the call page ↗</a>
      <span class="tiny muted">${esc(hostOf(o.source_url))} · checked ${fmtDate(o.extracted_at.slice(0, 10))}</span>
    </header>

    ${o.status === 'stale' ? `<div class="callout danger" style="margin-bottom:1rem"><h4>⚠️ This page may be out of date</h4>
      <p>${esc(o.freshness?.note ?? 'The call page has not been updated recently.')} Check it is still open before you spend time on it.</p></div>` : ''}

    <section class="verdict">
      <div class="verdict-main">
        ${ring(p / 100, 92, 'worth it')}
        <div>
          <div class="verdict-label">${p >= 75 ? 'Strong pick' : p >= 60 ? 'Worth considering' : 'Probably not this time'}</div>
          <p class="verdict-tag">${esc(o.tagline ?? '')}</p>
        </div>
      </div>
      <div class="facts">
        <div class="fact"><span class="fact-k">⏳ Next step</span>
          <span class="fact-v">${nd ? `${nd.fund_name ? 'Funding' : DEADLINE_LABEL[nd.label]}` : 'Nothing open'}</span>
          <span class="fact-s">${nd ? `${fmtDate(nd.date)} · ${relative(nd.date)}` : o.status === 'watch' ? 'Watch for the next call' : 'This edition has closed'}</span></div>
        <div class="fact"><span class="fact-k">💰 Cost</span>
          <span class="fact-v">${!cost ? '—' : cost.high === 0 ? 'Free' : `${shortMoney(cost.low, cost.currency)} – ${shortMoney(cost.high, cost.currency)}`}</span>
          <span class="fact-s">${cost && overBudget(cost) ? 'above your limit' : state.profile.constraints.max_cost == null ? 'no limit set' : 'within your limit'}</span></div>
        <div class="fact"><span class="fact-k">🎁 Funding</span>
          <span class="fact-v">${funds.length ? `${funds.length} option${funds.length === 1 ? '' : 's'}` : 'None open'}</span>
          <span class="fact-s">${funds.length ? esc(funds[0].name).slice(0, 38) : 'see Cost & funding'}</span></div>
        <div class="fact"><span class="fact-k">🛂 Visa</span>
          <span class="fact-v">${!abroad ? 'Not needed' : v?.required === 'yes' ? 'Needed' : v?.required === 'no' ? 'Not needed' : 'Maybe'}</span>
          <span class="fact-s">${abroad && v?.lead_days ? `start ~${v.lead_days} days ahead` : abroad ? 'see Can I go?' : o.location.format === 'online' ? 'online' : 'in your country'}</span></div>
      </div>
      <div class="verdict-actions">
        <button class="btn ${saved ? 'btn-ghost' : 'btn-primary'} btn-sm" data-act="save" data-id="${esc(o.id)}">${saved ? '★ In your tracker' : '☆ Save to tracker'}</button>
        <button class="btn btn-ghost btn-sm" data-act="ics" data-id="${esc(o.id)}">📅 Add dates to calendar</button>
        <button class="btn btn-quiet btn-sm" data-act="dismiss" data-id="${esc(o.id)}">✕ Not for me</button>
      </div>
    </section>

    <nav class="tabs-inline" role="tablist">
      ${BRIEF_TABS.map(([k, l]) => `<button role="tab" class="tab-i" data-act="tab" data-v="${k}" aria-selected="${briefTab === k}">${l}</button>`).join('')}
    </nav>
    <section class="panel tab-panel" role="tabpanel">${TAB_FN[briefTab](o)}</section>

    <p class="tiny muted" style="margin-top:1rem">Grapevine never registers, pays, submits or books for you.</p>
  </div>`;
}

/* ============================================================
   Live search for your own profile (scout → score on open)
   ============================================================ */

function startExample() {
  const ex = pickExample();
  state.exampleId = ex.id;
  state.profile = structuredClone(ex.profile);
  state.dismissed = [];
  state.weightAdjust = {};
  state.mode = 'example';
  state.onboarded = true;
  save();
  setTimeout(() => { location.hash = '#/thinking'; }, 0);
  return '';
}

let searchRun = null;
const searchLog = { searches: [], titles: [], max: 5, phase: 'searching' };

/** POST that streams newline-delimited JSON events; resolves with the final "done" event. */
async function apiStream(path, body, onEvent, timeoutMs = 200000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(`/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    } catch {
      throw new Error(ctrl.signal.aborted ? 'This took too long and was stopped. Please try again.' : 'Could not reach the server. Check your connection and try again.');
    }
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch { /* not JSON */ }
      throw new Error(data.error ?? `Request failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      let chunk;
      try { chunk = await reader.read(); } catch { throw new Error(ctrl.signal.aborted ? 'This took too long and was stopped. Please try again.' : 'The connection dropped. Please try again.'); }
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const evt = JSON.parse(line);
        if (evt.type === 'done') return evt;
        if (evt.type === 'error') throw new Error(evt.error);
        onEvent(evt);
      }
    }
    throw new Error('The search stopped unexpectedly. Please try again.');
  } finally { clearTimeout(timer); }
}

function searchPanelHtml() {
  const L = searchLog;
  const n = L.searches.length;
  const pct = L.phase === 'done' ? 100 : L.phase === 'picking' ? 92 : Math.min(85, 8 + (n / L.max) * 77);
  return `<div class="p2-title">${L.phase === 'done' ? `Found ${L.titles.length ? 'these' : ''} for you` : L.phase === 'picking' ? 'Checking dates and scoring each match' : n ? `Search ${n} of up to ${L.max}` : 'Starting the search'}</div>
    <div class="p2-detail">${L.phase === 'picking' ? 'Checking dates and choosing the 6–8 that fit you best.' : L.phase === 'done' ? 'Opening your shortlist…' : 'Each search looks in a different place: societies, next year’s editions, journals, fellowships.'}</div>
    <ol class="s-log">${L.searches.map((s, i) => `<li class="${s.count == null && i === n - 1 && L.phase === 'searching' ? 'running' : 'done'}">
      <span class="s-q">“${esc(s.query)}”</span><span class="s-n">${s.count == null ? 'searching…' : `${s.count} results`}</span></li>`).join('')}</ol>
    ${L.titles.length ? `<div class="s-found-h">Spotted so far</div><div class="p2-stream">${L.titles.slice(-8).map((t) => `<span class="p2-item">${esc(t)}</span>`).join('')}</div>` : ''}
    <span hidden id="s-pct" data-pct="${pct}"></span>`;
}

function paintSearch() {
  const panel = $('#s-panel');
  if (!panel) return;
  panel.innerHTML = searchPanelHtml();
  const pct = Number($('#s-pct')?.dataset.pct ?? 0);
  const bar = $('#pipe-bar');
  if (bar) bar.style.width = `${pct}%`;
  const L = searchLog;
  const set = (k, cls) => { const el = $(`#s-steps [data-k="${k}"]`); if (el) el.className = cls; };
  if (L.phase === 'picking') L.pickingAt ??= Date.now();
  const scoringNow = L.phase === 'picking' && Date.now() - L.pickingAt > 10000;
  set('search', L.phase === 'searching' ? 'active' : 'done');
  set('dates', L.phase === 'picking' && !scoringNow ? 'active' : L.phase === 'done' || scoringNow ? 'done' : '');
  set('score', scoringNow ? 'active' : L.phase === 'done' ? 'done' : '');
}

function renderSearching() {
  $('#topbar').hidden = true;
  const p = state.profile;
  const fields = [...(p.fields ?? []), ...(p.adjacent_fields ?? [])];
  return `<section class="pipe-screen">
    <div class="pipe2">
      <div class="pipe2-head"><h2>Searching for your opportunities</h2><span class="tiny muted" id="s-timer">0s</span></div>
      <div class="pipe-bar"><i id="pipe-bar" style="width:4%"></i></div>
      <div class="pipe2-grid">
        <div>
          <ol class="pipe2-steps" id="s-steps">
            <li class="done"><span class="p2-dot"></span><span>Reading your interests</span></li>
            <li class="active" data-k="search"><span class="p2-dot"></span><span>Searching the web</span></li>
            <li data-k="dates"><span class="p2-dot"></span><span>Checking dates and dropping closed calls</span></li>
            <li data-k="score"><span class="p2-dot"></span><span>Scoring each match for you</span></li>
          </ol>
          <div class="s-fields">
            <div class="s-found-h">Looking in</div>
            ${fields.slice(0, 7).map((f) => `<span class="s-field">${esc(f)}</span>`).join('') || `<span class="s-field">${esc((p.topics?.[0]?.term) ?? 'your topics')}</span>`}
          </div>
          <p class="tiny muted" style="margin-top:1rem">Usually 1–2 minutes. It runs up to ${searchLog.max} web searches, then picks the best 6–8.</p>
        </div>
        <div class="pipe2-live" aria-live="polite"><div id="s-panel">${searchPanelHtml()}</div><div id="s-out"></div></div>
      </div>
    </div>
  </section>`;
}

async function runSearch() {
  const started = Date.now();
  const tick = setInterval(() => {
    const t = $('#s-timer');
    if (!t) return clearInterval(tick);
    t.textContent = `${Math.round((Date.now() - started) / 1000)}s`;
    if (searchLog.phase === 'picking') paintSearch();
  }, 1000);
  paintSearch();
  try {
    if (!searchRun) {
      Object.assign(searchLog, { searches: [], titles: [], phase: 'searching', pickingAt: null });
      searchRun = apiStream('scout', { profile: state.profile }, (evt) => {
        if (evt.type === 'start') searchLog.max = evt.max_searches ?? searchLog.max;
        if (evt.type === 'search') searchLog.searches.push({ query: evt.query, count: null });
        if (evt.type === 'results') {
          const last = [...searchLog.searches].reverse().find((s) => s.count == null);
          if (last) last.count = evt.count;
          for (const t of evt.titles ?? []) if (!searchLog.titles.includes(t)) searchLog.titles.push(t);
          if (searchLog.searches.length >= searchLog.max) searchLog.phase = 'picking';
        }
        if (evt.type === 'ping' && searchLog.searches.length && searchLog.searches.every((s) => s.count != null)) searchLog.phase = 'picking';
        paintSearch();
      });
    }
    const { candidates: found } = await searchRun;
    searchRun = null;
    state.search = { key: profileKey(), at: new Date().toISOString(), candidates: found };
    save();
    clearInterval(tick);
    searchLog.phase = 'done';
    searchLog.titles = found.map((c) => c.title.split(/[—:(]/)[0].trim().slice(0, 60));
    paintSearch();
    setTimeout(() => { if (location.hash === '#/searching') location.hash = '#/feed'; }, 1400);
  } catch (err) {
    searchRun = null;
    clearInterval(tick);
    const out = $('#s-out');
    if (out) out.innerHTML = `<div class="callout danger" style="margin-top:1rem"><h4>The search didn't finish</h4><p>${esc(err.message)}</p></div>
      <div class="onb-actions"><a class="btn btn-primary btn-sm" href="#/searching" data-act="retry-search">Try again</a>
      <a class="btn btn-quiet btn-sm" href="#/example">See an example instead</a></div>`;
    $('#s-out [data-act="retry-search"]')?.addEventListener('click', (e) => { e.preventDefault(); render(); });
  }
}

function candRow(c, rank, top = false) {
  const nd = c.deadline_hint && daysUntil(c.deadline_hint) >= 0 ? c.deadline_hint : null;
  const p = c.priority ? priorityOf(c) : null;
  return `<article class="lr lr-cand ${top ? 'lr-top' : ''}" data-opp="${esc(c.id)}" style="animation-delay:${Math.min(rank * 45, 400)}ms">
    <div class="lr-rank">${String(rank).padStart(2, '0')}</div>
    <div class="lr-score">
      <div class="lr-num ${p == null ? 't-mute' : tone(p)}">${p ?? '–'}</div>
      <div class="lr-cap">${p == null ? 'not scored yet' : 'quick score'}</div>
      ${subBars(c)}
    </div>
    <div class="lr-main">
      <div class="kicker">${esc(TYPE_CHIP[c.type]?.[1] ?? 'Call')}${nd ? `<span class="dot">·</span>deadline ${fmtDate(nd)}` : ''}
        ${statusBadge(c)}${c.exploration ? '<span class="badge badge-sky">Outside your usual field</span>' : ''}</div>
      <h3 class="lr-title"><a href="#/brief/${esc(c.id)}">${esc(c.title)}</a></h3>
      <div class="lr-host">${esc(c.host)} <a class="src-link" href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer">Call page ↗</a></div>
      ${c.status === 'watch' && c.next_expected ? `<div class="next-exp">Next call: ${esc(c.next_expected)}</div>` : ''}
      ${top && c.tagline ? `<p class="lr-tag">${esc(c.tagline)}</p>` : ''}
      <p class="lr-why">${esc(c.relevance)}</p>
    </div>
    <div class="lr-act">
      <a class="btn btn-primary btn-sm" href="#/brief/${esc(c.id)}">Full check · ~1 min</a>
      <button class="btn btn-quiet btn-sm" data-act="dismiss" data-id="${esc(c.id)}">Not for me</button>
    </div>
  </article>`;
}

function renderMineFeed() {
  const all = allOpportunities().filter((o) => !state.dismissed.includes(o.id) && o.status !== 'stale')
    .sort((a, b) => (b.priority ? priorityOf(b) : -1) - (a.priority ? priorityOf(a) : -1));
  const checked = all.filter((o) => !o.unscored).length;
  const stale = !state.search || state.search.key !== profileKey();
  const openNow = all.filter((o) => o.status === 'open').length;
  const row = (o, i) => (o.unscored ? candRow(o, i + 1, i < 3) : oppRow(o, i + 1, i < 3));

  return `<div class="wrap wrap-feed">
    <header class="feed-head">
      <div class="eyebrow">Live search${state.search ? ` · ${fmtDate(state.search.at.slice(0, 10))}` : ''}</div>
      <h1>Your shortlist</h1>
      <div class="ledger">
        <div><b>${all.length}</b><span>found for your topics</span></div>
        <div class="${openNow ? 'warm' : ''}"><b>${openNow}</b><span>you can apply to now</span></div>
        <div class="green"><b>${checked}</b><span>fully checked</span></div>
      </div>
    </header>

    <div class="feed-bar">
      <p class="feed-note">Quick scores come from the search. Open one for the full check: dates, cost, funding and visa, read from the call page.
        · <a href="#/how">how scores work</a></p>
      <a class="btn btn-ghost btn-sm" href="#/searching">${stale ? 'Search for my updated profile' : 'Search again'}</a>
    </div>

    ${!state.search ? `<div class="empty"><p><strong>No search yet.</strong></p><a class="btn btn-primary btn-sm" href="#/searching">Search for my topics</a></div>` : ''}

    ${all.length ? `<h2 class="list-h">Best first</h2><div class="ledger-list">${all.map(row).join('')}</div>` : ''}

    <form class="paste-box" id="paste-form" style="margin-top:2.4rem">
      <span class="paste-label">Know about one that's missing? Paste its link.</span>
      <input type="text" id="paste-url" placeholder="https://…" aria-label="Opportunity URL" />
      <button class="btn btn-primary" type="submit">Add it</button>
    </form>
    <p class="tiny muted" style="margin-top:1rem">Want to see a fully worked example? <a href="#/example">Open an example researcher's shortlist</a>.</p>
  </div>`;
}

const scoring = {};

function maybeScore(id) {
  const c = byId(id);
  if (!c?.unscored || scoring[id]?.running) return;
  scoring[id] = { running: true, phase: 'extract', started: Date.now(), phaseStarted: Date.now(), error: null };
  (async () => {
    try {
      const { opportunity } = await api('extract', { url: c.url });
      Object.assign(scoring[id], { phase: 'brief', phaseStarted: Date.now() });
      paintScoring(id);
      const { brief } = await api('brief', { opportunity, profile: state.profile });
      state.scored[id] = { ...opportunity, venue_funding: opportunity.funding, ...brief, id, explore: c.exploration || brief.explore, discovery_trace: c.discovery_trace };
      save();
      delete scoring[id];
    } catch (err) {
      scoring[id] = { running: false, phase: null, error: err.message };
    }
    if (location.hash === `#/brief/${id}`) render();
  })();
}

/** Four visible steps over two real server calls; the second step of each call switches on a short timer. */
function scoringSteps(s) {
  const since = (Date.now() - (s.phaseStarted ?? Date.now())) / 1000;
  const steps = [
    ['Opening the call page', s.phase === 'extract' && since < 5],
    ['Reading dates, fees and who can apply', s.phase === 'extract' && since >= 5],
    ['Finding funding and working out cost', s.phase === 'brief' && since < 18],
    ['Scoring it for you', s.phase === 'brief' && since >= 18],
  ];
  const activeAt = steps.findIndex(([, on]) => on);
  return steps.map(([label], i) => `<li class="${s.error ? '' : i < activeAt ? 'done' : i === activeAt ? 'active' : ''}"><span class="p2-dot"></span><span>${label}</span></li>`).join('');
}

function paintScoring(id) {
  const s = scoring[id];
  const list = $('#score-steps');
  if (!s || !list) return;
  list.innerHTML = scoringSteps(s);
  const t = $('#score-timer');
  if (t) t.textContent = `${Math.round((Date.now() - s.started) / 1000)}s`;
}

setInterval(() => {
  const m = location.hash.match(/^#\/brief\/(.+)$/);
  if (m && scoring[decodeURIComponent(m[1])]?.running) paintScoring(decodeURIComponent(m[1]));
}, 1000);

function renderScoring(c) {
  const s = scoring[c.id] ?? { phase: 'extract', started: Date.now(), phaseStarted: Date.now() };
  return `<div class="wrap wrap-mid">
    <a class="back-link" href="#/feed">← Back to your shortlist</a>
    <header class="brief-head">
      <div class="kicker">${esc(TYPE_CHIP[c.type]?.[1] ?? 'Call')} ${statusBadge(c)}</div>
      <h1>${esc(c.title)}</h1>
      <p class="brief-sub">${esc(c.host)}</p>
      <a class="btn btn-ghost btn-sm src-btn" href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer">Open the call page ↗</a>
    </header>
    <section class="verdict">
      ${c.priority ? `<div class="verdict-main" style="margin-bottom:1rem">${ring(priorityOf(c) / 100, 72, 'quick score')}
        <div><div class="verdict-label">First impression</div><p class="verdict-tag">${esc(c.tagline || c.relevance)}</p></div></div>` : ''}
      <p class="small" style="margin:0 0 ${c.next_expected ? '.4rem' : '1rem'}"><strong>Why it came up:</strong> ${esc(c.relevance)}</p>
      ${c.status === 'watch' && c.next_expected ? `<p class="small" style="margin:0 0 1rem"><strong>Next call:</strong> ${esc(c.next_expected)}</p>` : ''}
      ${s.error ? `<div class="callout danger"><h4>Couldn't finish the full check</h4><p>${esc(s.error)}</p></div>
          <div class="onb-actions"><button class="btn btn-primary btn-sm" data-act="rescore" data-id="${esc(c.id)}">Try again</button></div>`
        : `<div class="spread" style="margin-bottom:.4rem"><strong class="small">Full check in progress</strong><span class="tiny muted" id="score-timer">0s</span></div>
        <ol class="pipe2-steps" id="score-steps">${scoringSteps(s)}</ol>
        <p class="tiny muted" style="margin:.8rem 0 0">Usually about a minute. You can go back to your shortlist; it keeps going.</p>`}
    </section>
  </div>`;
}

/* ============================================================
   Screen — how it works (FAQ)
   ============================================================ */

function renderHow() {
  $('#topbar').hidden = false;
  const w = weightsFor();
  const pct = (k) => `${Math.round(w[k] * 100)}%`;
  const goals = (state.profile.goals ?? []).map((g) => GOALS.find((x) => x.id === g)?.label).filter(Boolean);
  const live = allOpportunities().filter((o) => o.status !== 'stale');
  const usd = FX?.inr_per?.USD;

  const qa = (q, a, open = false) => `<details class="qa" ${open ? 'open' : ''}><summary>${q}</summary><div class="qa-a">${a}</div></details>`;

  return `<div class="wrap wrap-mid faq">
    <div class="eyebrow">How it works</div>
    <h1>What Grapevine does, and how it scores things</h1>
    <p class="lede">Short answers. Tap a question to open it.</p>

    <h2 class="list-h">The basics</h2>
    ${qa('What does Grapevine do?', `<p>It finds conferences, journal calls and fellowships that fit your research, then tells you which ones are worth your time and money: what it costs, who pays, what the deadlines are, and whether you need a visa.</p>`)}
    ${qa('Where do the opportunities come from?', `<p>Grapevine works out which fields your research belongs to, including neighbouring ones you might not think of. Then it looks for:</p>
      <ul><li>the main scholarly societies in those fields and their yearly conferences</li>
      <li>next year's editions of conferences that meet regularly</li>
      <li>journal special issues and fellowships</li></ul>
      <p>That's how it found the internet researchers' conference (AoIR) for someone working on caste and social media. It isn't on any built-in list.</p>`)}
    ${qa('What is saved right now?', `<ul>
      <li><strong>${live.length} real calls</strong>, gathered on ${fmtDate(exampleSet().gathered_at)} for the example you are viewing. Each one has its dates, fees and funding copied from the call page.</li>
      <li><strong>A list of Indian funders</strong> who pay for conference travel, such as ICSSR's scheme for presenting abroad.</li>
      <li><strong>Exchange rates</strong>${usd ? ` (1 USD ≈ ₹${usd.toFixed(1)})` : ''} used for cost estimates.</li></ul>
      <p>There are ${EXAMPLES.length} example researchers, in different fields, countries and career stages, each with a shortlist built ahead of time. "See an example" opens one at random. When you set up <em>your own</em> profile, Grapevine searches the web live for your topics, and scores each call when you open it.</p>`)}
    ${qa('Why are some calls missing?', `<p>Grapevine hides calls that look out of date (for example, a page last updated years ago) and calls you can't apply to (wrong career stage or region). You can show the second group from the bottom of your shortlist.</p>`)}

    <h2 class="list-h">The "worth it" score</h2>
    ${qa('How is the score worked out?', `<p>Every opportunity gets five scores out of 100, each with a one-line reason. The final score is a weighted average of the five, and <strong>your goals set the weights</strong>.</p>
      <table class="faq-t"><thead><tr><th>Part</th><th>Your weight now</th></tr></thead><tbody>
      ${SUBS.map(([k, l]) => `<tr><td>${l}</td><td>${pct(k)}</td></tr>`).join('')}
      </tbody></table>
      <p class="small muted">Your goals: ${goals.length ? goals.join(', ') : 'none picked'}. Each goal you pick adds weight to one part. For example, "Keep it affordable" adds to Feasibility. Change them on your <a href="#/profile">profile</a>.</p>`)}
    ${qa('Fit: how close is it to my research?', `<p>Does the call's theme, tracks and past papers match what you work on? It judges by meaning, not shared words, so a theme like "Regeneration(s)" can still be a strong match for platform research.</p>
      <p><strong>Higher:</strong> your main topic is a named theme or track. <strong>Lower:</strong> only a loose link.</p>`)}
    ${qa('Standing: is it well respected?', `<p>Who runs it, and how long has it been going?</p>
      <p><strong>Higher:</strong> run by a scholarly society or university, many past editions, published proceedings, known speakers. <strong>Lower:</strong> little information. <strong>Much lower:</strong> signs of a predatory, for-profit "all topics" event.</p>`)}
    ${qa('Network: who would I meet?', `<p>Is this where people in your area actually go?</p>
      <p><strong>Higher:</strong> it's a field's main meeting, has sessions for PhD students, or a small group you'd get to know. Journal calls don't get this score.</p>`)}
    ${qa('Outcomes: what would I come away with?', `<p><strong>Higher:</strong> a route to publication, awards for students, feedback sessions, or a strong line on your CV. <strong>Lower:</strong> attending without presenting.</p>`)}
    ${qa('Feasibility: can I realistically go?', `<p>It starts at 100 and drops if:</p>
      <ul><li>the cost is above your limit</li><li>a hard visa is needed</li><li>it falls in a month you can't travel</li><li>the deadline is very close</li><li>you might not be eligible</li></ul>
      <p>It goes back up if funding would likely cover a good part of the cost.</p>`)}
    ${qa('Why is a famous conference ranked lower than a small one?', `<p>Because "worth it" is about <em>you, this year</em>. A top conference whose deadline has passed, that you can't afford, and that needs a slow visa can rightly rank below a smaller one you can apply to next week. The page for each one says exactly why.</p>`)}
    ${qa('What happens when I tap "Not for me"?', `<p>It asks why, and the ranking learns from your answer. "Too expensive" makes cost count for more, and "Off topic" lowers that topic. You can see and undo every change on your profile.</p>`)}

    <h2 class="list-h">Trusting what you see</h2>
    ${qa('What do ✓ verified and "inferred" mean?', `<p><strong>✓ verified</strong> means the exact words were found on the call page and re-checked. Tap "source" to see them. <strong>Inferred</strong> means Grapevine worked it out but couldn't find it written down, so check it yourself.</p>`)}
    ${qa('How is the cost worked out?', `<p>Registration (the fee tier you qualify for), plus a return flight, nights of accommodation and the visa fee. It's always shown as a range with its assumptions, because a single exact number would be false precision.</p>`)}
    ${qa('Where does the funding list come from?', `<p>Two places: the organisers' own grants (from their website), and outside funders you're likely to qualify for, based on your country, field and career stage. Grapevine also tells you what each one needs first, such as an acceptance letter.</p>`)}
    ${qa('Is the visa information advice?', `<p>No. It's general information with a link to the official source. Always check there before you act.</p>`)}
    ${qa('Will Grapevine apply or pay for me?', `<p>Never. It reads and advises. Registering, paying, submitting and booking are always yours to do.</p>`)}
    ${qa('What happens when I paste a link?', `<p>Grapevine opens the page safely, reads the call, works out cost and funding for your profile, and scores it like everything else. It takes under a minute.</p>`)}
    ${qa('Where is my data stored?', `<p>For now, only in this browser. Nothing about you is sent anywhere except the text you type into "describe your research" or a link you paste, which is sent to the AI to be read. Accounts that save your profile are coming next.</p>`)}
  </div>`;
}

/* ============================================================
   Screen — tracker
   ============================================================ */

function renderTracker() {
  $('#topbar').hidden = false;
  const items = state.saved.map(byId).filter(Boolean)
    .flatMap((o) => deadlinesFor(o).map((d) => ({ ...d, opp: o })))
    .filter((d) => daysUntil(d.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const groups = items.reduce((acc, d) => {
    const k = new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    (acc[k] ??= []).push(d);
    return acc;
  }, {});

  return `<div class="wrap wrap-narrow">
    <div class="eyebrow">Tracker</div>
    <h1>Everything you saved, in the order it binds.</h1>
    <p class="lede">Deadlines only. Grapevine does not submit, register or pay — that is a hard stop in the agent, not a preference you can change.</p>

    ${items.length ? `<div class="row" style="margin:1.4rem 0 2rem">
      <button class="btn btn-primary btn-sm" data-act="ics-all">⬇ Export all to calendar (.ics)</button>
      <span class="tiny muted">${items.length} deadline${items.length === 1 ? '' : 's'} across ${state.saved.length} opportunit${state.saved.length === 1 ? 'y' : 'ies'}</span>
    </div>` : ''}

    ${items.length === 0 ? `<div class="empty" style="margin-top:2rem"><span class="big" aria-hidden="true">🗓</span>
      <p><strong>Nothing tracked yet.</strong></p>
      <p class="small">Save something from your feed and every one of its deadlines lands here, sequenced.</p>
      <a class="btn btn-primary btn-sm" href="#/feed">Go to the feed</a></div>` : ''}

    ${Object.entries(groups).map(([month, ds]) => `<div class="track-group">
      <div class="section-rule">${month}</div>
      ${ds.map((d) => {
        const u = urgency(d.date);
        const dt = new Date(d.date + 'T00:00:00Z');
        return `<div class="track-item ${u === 'soon' ? 'urgent' : ''}">
          <div class="track-when">
            <div class="track-day">${dt.getUTCDate()}</div>
            <div class="track-mon">${dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</div>
          </div>
          <div>
            <div class="track-what">${d.fund_name ? esc(d.fund_name) : DEADLINE_LABEL[d.label]} ${d.grounded ? '' : conf('inferred')}</div>
            <div class="track-sub"><a href="#/brief/${esc(d.opp.id)}">${esc(d.opp.title)}</a></div>
            ${d.depends_on ? `<span class="tl-dep">⛓ only after ${DEADLINE_LABEL[d.depends_on].toLowerCase()}</span>` : ''}
          </div>
          <span class="chip ${u === 'soon' ? 'chip-coral' : u === 'near' ? 'chip-amber' : 'chip-outline'}">${relative(d.date)}</span>
        </div>`;
      }).join('')}
    </div>`).join('')}
  </div>`;
}

/* ============================================================
   Screen — profile
   ============================================================ */

function renderProfile() {
  $('#topbar').hidden = false;
  const p = state.profile;
  const initials = p.name.split(' ').map((w) => w[0]).slice(0, 2).join('');

  return `<div class="wrap wrap-narrow">
    <div class="prof-head">
      <div class="avatar" aria-hidden="true">${esc(initials)}</div>
      <div>
        <h1 style="font-size:1.9rem">${esc(p.name)}</h1>
        <p class="muted small" style="margin:.2rem 0 0">${esc(p.affiliation)} · ORCID ${esc(p.orcid ?? '—')}</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel-h"><h3><span class="ico" aria-hidden="true">⚖️</span> What Grapevine thinks you work on</h3></div>
      <p class="small muted">These weights drive ranking. Grapevine edits them when you dismiss something with a reason —
        and it shows you exactly what it changed, because a profile you cannot see is a profile you cannot correct.</p>
      <div style="margin-top:1rem">
        ${p.topics.map((t) => {
          const changed = state.changedTopics.includes(t.term);
          return `<div class="weight-row ${changed ? 'changed' : ''}">
            <span class="t-name">${esc(t.term)}</span>
            <span class="weight-bar"><i class="${changed ? 'down' : ''}" style="width:${t.weight * 100}%"></i></span>
            <span class="weight-num">${t.weight.toFixed(2)}</span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="panel">
      <div class="panel-h"><h3><span class="ico" aria-hidden="true">🎯</span> What you want out of it, and how that ranks things</h3></div>
      <div class="row" style="margin-bottom:.9rem">
        ${GOALS.map((g) => `<button class="chip ${(p.goals ?? []).includes(g.id) ? 'chip-grape' : 'chip-outline'}" data-act="profgoal" data-v="${g.id}">${g.emoji} ${g.label}</button>`).join('')}
      </div>
      ${(() => {
        const w = weightsFor();
        return SUBS.map(([k, label, q]) => `<div class="weight-row ${state.weightAdjust?.[k] ? 'changed' : ''}">
          <span class="t-name">${label} <span class="muted tiny">· ${q.toLowerCase()}</span></span>
          <span class="weight-bar"><i style="width:${Math.round(w[k] * 250)}%"></i></span>
          <span class="weight-num">${w[k].toFixed(2)}</span></div>`).join('');
      })()}
      <p class="tiny muted" style="margin:.8rem 0 0">Tap a goal to turn it on or off (up to 3). Dismissing something with a reason nudges these weights too, and the changed row is highlighted.</p>
    </section>

    <section class="panel">
      <div class="panel-h"><h3><span class="ico" aria-hidden="true">🧭</span> Constraints</h3></div>
      <dl class="kv">
        <dt>Career stage</dt><dd>${({ phd: 'PhD candidate', postdoc: 'Postdoc', faculty: 'Faculty', independent: 'Independent researcher', other: 'Other' })[p.career_stage] ?? 'Not set'}${p.year ? `, year ${p.year}` : ''}</dd>
        <dt>Based in</dt><dd>${esc(p.geography.city ? p.geography.city + ', ' : '')}${esc(p.geography.country)}</dd>
        <dt>Passport</dt><dd>${esc(p.geography.passport)}</dd>
        <dt>Currency</dt><dd>${esc(p.currency)}</dd>
        <dt>Cost ceiling</dt><dd>${p.constraints.max_cost == null ? 'No limit' : money(p.constraints.max_cost)}</dd>
        <dt>Months available</dt><dd>${p.constraints.months_available.join(' · ') || 'none set'}</dd>
        <dt>Visa appetite</dt><dd>${{ any: 'Anywhere', prefer_none: 'Prefer visa-free', none: 'Visa-free only' }[p.constraints.visa_tolerance]}</dd>
        <dt>Format</dt><dd>${{ any: 'Either', in_person: 'In person', online: 'Online only' }[p.constraints.format]}</dd>
      </dl>
      <div class="row" style="margin-top:1.2rem">
        <a class="btn btn-ghost btn-sm" href="#/onboarding" data-act="reonboard">Edit my profile</a>
      </div>
    </section>

    <section class="panel">
      <div class="panel-h"><h3><span class="ico" aria-hidden="true">📝</span> Feedback the learner has seen</h3></div>
      ${state.feedback.length === 0
        ? '<p class="small muted" style="margin:0">Nothing yet. Dismiss something from the feed with a reason and it shows up here, along with what it changed.</p>'
        : `<div class="log">${state.feedback.slice().reverse().map((f) => `<div class="log-item">
            <span class="log-sig">${f.signal === 'dismiss' ? '✕' : '★'}</span>
            <span><strong>${esc(byId(f.opportunity_id)?.title ?? f.opportunity_id)}</strong>
            <br/><span class="muted tiny">${f.reason ? `reason: ${f.reason.replace(/_/g, ' ')} — ${esc(f.effect ?? '')}` : 'saved'}</span></span>
          </div>`).join('')}</div>`}
    </section>

    <section class="panel">
      <div class="panel-h"><h3><span class="ico" aria-hidden="true">🔒</span> What is and is not stored</h3></div>
      <p class="small" style="margin:0 0 .6rem">Your passport is used for two things — visa requirements and regional fee tiers — and nothing else.
        Inferred attributes are shown as editable inferences, never asserted as fact. No other user's data ever enters a model context alongside yours.</p>
      <p class="tiny muted" style="margin:0">In this prototype nothing leaves your browser: state lives in localStorage and there is no server.</p>
      <div class="row" style="margin-top:1.1rem">
        <button class="btn btn-quiet btn-sm" data-act="reset">Reset the prototype</button>
      </div>
    </section>
  </div>`;
}

/* ============================================================
   Actions — save, dismiss, feedback learner, .ics
   ============================================================ */

function toggleSave(id) {
  const o = byId(id);
  const i = state.saved.indexOf(id);
  if (i === -1) {
    state.saved.push(id);
    state.feedback.push({ opportunity_id: id, profile_id: state.profile.id, signal: 'save', reason: null, timestamp: new Date().toISOString() });
    const n = deadlinesFor(o).filter((d) => daysUntil(d.date) >= 0).length;
    toast({ emoji: '★', title: 'Saved to your tracker', body: `${n} deadline${n === 1 ? '' : 's'} added, in the order they bind.` });
  } else {
    state.saved.splice(i, 1);
    toast({ emoji: '☆', title: 'Removed from your tracker' });
  }
  save();
  render();
}

function askDismiss(id) {
  const o = byId(id);
  openModal(`
    <h3>Why isn't this one for you?</h3>
    <p class="modal-sub">“${o.title}”. Grapevine uses the reason to change your profile — and will show you exactly what it changed.</p>
    <div class="reason-grid">
      ${dismissReasons.map((r) => `<button class="reason" data-reason="${r.id}">
        <span class="r-emoji" aria-hidden="true">${r.emoji}</span>
        <span><span class="r-label">${r.label}</span><br/><span class="r-effect">${r.effect}</span></span>
      </button>`).join('')}
    </div>
    <div class="row"><button class="btn btn-quiet btn-sm" data-act="cancel">Cancel — keep it in my feed</button></div>
  `, (root) => {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="cancel"]')) return closeModal();
      const r = e.target.closest('[data-reason]')?.dataset.reason;
      if (r) { closeModal(); doDismiss(id, r); }
    });
  });
}

/** The Feedback Learner: a reason maps to one specific, visible reweight. */
function doDismiss(id, reason) {
  const o = byId(id);
  const p = state.profile;
  let effect = 'Logged for review — no automatic reweight.';
  state.changedTopics = [];

  switch (reason) {
    case 'off_topic': {
      const hit = (o.fit?.matched_topics ?? []).filter((t) => p.topics.some((x) => x.term === t));
      hit.forEach((t) => {
        const topic = p.topics.find((x) => x.term === t);
        topic.weight = Math.max(0.05, +(topic.weight - 0.15).toFixed(2));
      });
      state.changedTopics = hit;
      effect = hit.length ? `Lowered ${hit.map((t) => `“${t}”`).join(', ')} by 0.15.` : 'No matching topics to lower.';
      break;
    }
    case 'too_expensive': {
      const was = p.constraints.max_cost ?? (BUDGET_RANGE[p.currency] ?? BUDGET_RANGE.USD)[1];
      p.constraints.max_cost = Math.round(was * 0.85);
      state.weightAdjust.feasibility = +((state.weightAdjust.feasibility ?? 0) + 0.05).toFixed(2);
      effect = `Cost ceiling ${money(was)} → ${money(p.constraints.max_cost)}, and affordability now counts for more.`;
      break;
    }
    case 'not_prestigious':
      state.weightAdjust.standing = +((state.weightAdjust.standing ?? 0) + 0.05).toFixed(2);
      effect = 'How well respected something is now counts for more in your ranking.';
      break;
    case 'bad_timing': {
      const m = o.dates.start ? new Date(o.dates.start + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) : null;
      if (m && p.constraints.months_available.includes(m)) {
        p.constraints.months_available = p.constraints.months_available.filter((x) => x !== m);
        effect = `Removed ${m} from the months you can travel.`;
      } else {
        effect = m ? `${m} was already outside your available months — the ranker will weight timing harder.` : 'No event date to learn from; logged only.';
      }
      break;
    }
    case 'visa_infeasible':
      p.constraints.visa_tolerance = 'prefer_none';
      state.weightAdjust.feasibility = +((state.weightAdjust.feasibility ?? 0) + 0.05).toFixed(2);
      effect = 'Visas set to “prefer easy”, and feasibility now counts for more.';
      break;
    case 'wrong_stage':
      effect = `Eligibility filter tightened on career stage (${p.career_stage}).`;
      break;
  }

  state.dismissed.push(id);
  state.saved = state.saved.filter((x) => x !== id);
  state.feedback.push({ opportunity_id: id, profile_id: p.id, signal: 'dismiss', reason, effect, timestamp: new Date().toISOString() });
  save();

  const card = $(`[data-opp="${id}"]`);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (location.hash === `#/brief/${id}`) location.hash = '#/feed';
    render();
    toast({ emoji: '🧠', title: 'Profile updated', body: `${effect} Visible on your profile page — and reversible there.`, ms: 6500 });
  };

  if (card) {
    card.classList.add('leaving');
    card.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 450); // animationend never arrives if the animation doesn't run
  } else {
    finish();
  }
}

/* ---------- .ics ---------- */

function icsFor(opps) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const fold = (s) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');

  const events = opps.flatMap((o) =>
    deadlinesFor(o).filter((d) => daysUntil(d.date) >= 0).map((d) => {
      const start = new Date(d.date + 'T00:00:00Z');
      const end = new Date(start.getTime() + 86400000);
      return ['BEGIN:VEVENT',
        `UID:${o.id}-${d.label}@grapevine.prototype`,
        `DTSTAMP:${stamp(TODAY)}T000000Z`,
        `DTSTART;VALUE=DATE:${stamp(start)}`,
        `DTEND;VALUE=DATE:${stamp(end)}`,
        `SUMMARY:${fold(`${DEADLINE_LABEL[d.label]} — ${o.title}`)}`,
        `DESCRIPTION:${fold(
          `${o.host}\n${d.grounded ? 'Verified against the source page.' : 'Inferred by Grapevine — verify before relying on it.'}` +
          `${d.source_quote ? `\n\n"${d.source_quote}"` : ''}\n\n${o.source_url}`)}`,
        'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${fold(`One week to ${DEADLINE_LABEL[d.label].toLowerCase()} — ${o.title}`)}`, 'END:VALARM',
        'END:VEVENT'].join('\r\n');
    }));

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Grapevine//Prototype//EN', 'CALSCALE:GREGORIAN',
    ...events, 'END:VCALENDAR'].join('\r\n');
}

function downloadIcs(opps, name) {
  if (!opps.length) return;
  const blob = new Blob([icsFor(opps)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast({ emoji: '⬇', title: 'Calendar file downloaded', body: 'Each deadline carries a one-week reminder and a note saying whether it was verified or inferred.' });
}

/* ============================================================
   Router
   ============================================================ */

const routes = {
  '': renderWelcome,
  '/': renderWelcome,
  '/onboarding': renderOnboarding,
  '/thinking': renderPipeline,
  '/example': startExample,
  '/searching': renderSearching,
  '/feed': renderFeed,
  '/tracker': renderTracker,
  '/profile': renderProfile,
  '/how': renderHow,
};

let lastRenderedHash = null;

function render() {
  const hash = location.hash.replace(/^#/, '');
  const app = $('#app');

  let html;
  const brief = hash.match(/^\/brief\/(.+)$/);
  if (brief) html = renderBrief(brief[1]);
  else html = (routes[hash] ?? renderWelcome)();

  // Entrance animations only when moving to a new page; in-page updates (save, tabs) redraw silently.
  app.classList.toggle('no-anim', hash === lastRenderedHash);
  lastRenderedHash = hash;
  app.innerHTML = html;

  // nav state
  const tab = hash.startsWith('/brief') ? '/feed' : hash;
  $$('#tabs a').forEach((a) => {
    const match = a.getAttribute('href') === '#' + tab;
    match ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  const count = $('#tab-count');
  if (count) {
    const n = state.saved.map(byId).filter(Boolean).flatMap(deadlinesFor).filter((d) => daysUntil(d.date) >= 0).length;
    count.textContent = n;
    count.hidden = n === 0;
  }

  // Bound to `.onb`, which is recreated on every render — binding to #app would stack listeners.
  if (hash === '/onboarding') onboardingEvents($('.onb', app));
  if (hash === '/thinking') runPipeline();
  if (hash === '/searching') runSearch();
  const b = hash.match(/^\/brief\/(.+)$/);
  if (b) maybeScore(decodeURIComponent(b[1]));
  if (hash === '/feed') pasteEvents(app);
}

/* ============================================================
   Global events
   ============================================================ */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.closest('.onb') || btn.closest('#modal-root')) return;

  switch (btn.dataset.act) {
    case 'save': toggleSave(btn.dataset.id); break;
    case 'dismiss': askDismiss(btn.dataset.id); break;
    case 'ics': downloadIcs([byId(btn.dataset.id)], `grapevine-${btn.dataset.id}.ics`); break;
    case 'ics-all': downloadIcs(state.saved.map(byId).filter(Boolean), 'grapevine-deadlines.ics'); break;
    case 'filter': feedFilter = btn.dataset.v; render(); break;
    case 'tab': briefTab = btn.dataset.v; render(); break;
    case 'rescore': delete scoring[btn.dataset.id]; maybeScore(btn.dataset.id); render(); break;
    case 'toggle-inelig': state.showIneligible = !state.showIneligible; save(); render(); break;
    case 'profgoal': {
      const goals = state.profile.goals ??= [];
      const i = goals.indexOf(btn.dataset.v);
      if (i !== -1) goals.splice(i, 1);
      else if (goals.length < 3) goals.push(btn.dataset.v);
      else { toast({ emoji: '✋', title: 'Up to three goals', body: 'Turn one off first.' }); break; }
      save(); render(); break;
    }
    case 'skip': pipeTimers.forEach(clearTimeout); location.hash = '#/feed'; break;
    case 'reonboard': draft = structuredClone(state.profile); onbStep = 0; break;
    case 'fresh-start': draft = blankDraft(); onbStep = 0; topicQuery = ''; break;
    case 'reset':
      resetAll();
      location.hash = '#/';
      render();
      toast({ emoji: '↺', title: 'Prototype reset', body: 'Profile, saves, dismissals and the feedback log are all back to their starting state.' });
      break;
  }
});

$('#theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  state.theme = current === 'dark' ? 'light' : 'dark';
  save();
  applyTheme();
});

addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

let LIVE = false;
fetch('/api/status').then((r) => (r.ok ? r.json() : null)).then((d) => {
  LIVE = !!d?.live;
  // Only screens whose content depends on live mode need a redraw; redrawing the homepage replays its animation.
  if (LIVE && state.mode === 'mine' && /^#\/(feed|brief\/|tracker)/.test(location.hash)) render();
}).catch(() => {});

applyTheme();
render();
