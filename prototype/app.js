/**
 * Grapevine prototype — application logic.
 *
 * Hash-routed, no build step, no backend. Everything the agent would compute is
 * read from data.js; everything the user changes is kept in localStorage so the
 * feedback loop is visible across a session.
 */

import { TODAY, GATHERED_AT, profile as seedProfile, opportunities, heldBack, pipeline, dismissReasons, topicVocabulary, GOALS } from './data.js';

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
  ['standing', 'Standing', 'How established and respected the venue is'],
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

const allOpportunities = () => [...opportunities, ...state.pasted];
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
const srcQuote = (q) => (q ? `<details class="src"><summary>source</summary><div class="quote-src">“${esc(q)}”</div></details>` : '');
const STATUS_CHIP = { 'attend-only': '<span class="chip chip-amber">Submissions closed · can attend</span>',
  watch: '<span class="chip chip-sky">👀 Next edition — watch</span>' };

function oppCard(opp, i = 0) {
  const nd = nextDeadline(opp);
  const u = nd ? urgency(nd.date) : 'far';
  const saved = state.saved.includes(opp.id);
  const cls = ['opp', opp.explore ? 'is-explore' : '', opp.predatory_flag ? 'is-flagged' : ''].join(' ').trim();
  const cost = opp.cost_estimate;
  const abroad = opp.location.country !== '—' && opp.location.country !== homeCountry();

  return `<article class="${cls}" data-opp="${esc(opp.id)}" style="animation-delay:${Math.min(i * 55, 400)}ms">
    <div class="ring-wrap">${ring(priorityOf(opp) / 100, 66, 'worth it')}</div>
    <div>
      ${opp.explore ? `<div class="banner-explore"><span aria-hidden="true">🧭</span><span><strong>Outside your usual field.</strong> ${esc(opp.explore_reason)}</span></div>` : ''}
      ${opp.predatory_flag ? `<div class="banner-flag"><span aria-hidden="true">⚠️</span><span><strong>Flagged — no traceable scholarly footprint.</strong> Shown so you recognise it, not so you apply.</span></div>` : ''}
      ${opp.pasted ? `<div class="banner-explore"><span aria-hidden="true">🔗</span><span><strong>You added this.</strong> From the link you pasted.</span></div>` : ''}

      <h3 class="opp-title"><a href="#/brief/${esc(opp.id)}">${esc(opp.title)}</a></h3>
      <div class="opp-host">${esc(opp.host)}</div>
      <p class="opp-tag">${esc(opp.tagline ?? '')}</p>
      ${opp.why_go?.length ? `<p class="opp-why">👍 ${esc(opp.why_go[0])}</p>` : ''}

      <div class="opp-chips">
        <span class="chip chip-grape">${TYPE_LABEL[opp.type]}</span>
        ${STATUS_CHIP[opp.status] ?? ''}
        ${opp.location.city !== '—' ? `<span class="chip">📍 ${esc(opp.location.city)}, ${esc(opp.location.country)}</span>` : ''}
        ${opp.dates?.start ? `<span class="chip">🗓 ${fmtDate(opp.dates.start)}</span>` : ''}
        ${nd && daysUntil(nd.date) >= 0 ? `<span class="chip ${u === 'soon' ? 'chip-coral' : u === 'near' ? 'chip-amber' : 'chip-outline'}">
            ⏳ ${DEADLINE_LABEL[nd.label]} ${relative(nd.date)}</span>` : ''}
        ${cost ? `<span class="chip ${cost.high === 0 ? 'chip-vine' : cost.high > state.profile.constraints.max_cost ? 'chip-amber' : 'chip-vine'}">
          💰 ${cost.high === 0 ? 'No cost' : `${money(cost.low, cost.currency)}–${money(cost.high, cost.currency)}`}</span>` : ''}
        ${(opp.funding ?? []).some((f) => f.eligible !== 'no') ? `<span class="chip chip-vine">🎁 ${opp.funding.filter((f) => f.eligible !== 'no').length} funding route${opp.funding.filter((f) => f.eligible !== 'no').length === 1 ? '' : 's'}</span>` : ''}
        ${opp.visa?.required === 'yes' ? '<span class="chip chip-coral">🛂 Visa needed</span>'
          : opp.visa?.required === 'no' && abroad ? '<span class="chip chip-vine">🛂 No visa</span>' : ''}
        ${opp.eligible === 'conditional' ? '<span class="chip chip-amber">Conditional</span>' : ''}
        ${opp.eligible === 'no' ? '<span class="chip chip-coral">Not eligible</span>' : ''}
      </div>

      <div class="opp-actions">
        <a class="btn btn-primary btn-sm" href="#/brief/${esc(opp.id)}">Is it worth it?</a>
        <button class="btn btn-ghost btn-sm" data-act="save" data-id="${esc(opp.id)}">${saved ? '★ Saved' : '☆ Save'}</button>
        <button class="btn btn-quiet btn-sm" data-act="dismiss" data-id="${esc(opp.id)}">Not for me</button>
      </div>
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
      <h1>Conferences, journal calls and fellowships<br/><em>for your research — and whether they're worth it.</em></h1>
      <p class="hero-sub">Tell Grapevine what you work on. It finds opportunities across societies, journals and funders,
        then tells you which ones are worth your time and money, and why.</p>

      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="#/onboarding">Tell it about your research</a>
        <a class="btn btn-ghost btn-lg" href="#/thinking">See an example feed</a>
      </div>

      <ol class="how">
        <li><span class="how-n">1</span><span><strong>Describe your research</strong><br/>
          A few sentences or an abstract, or pick topics from a list. Takes a minute.</span></li>
        <li><span class="how-n">2</span><span><strong>It searches for you</strong><br/>
          Scholarly societies, next year's editions, journal special issues, fellowships, and funding in your country.</span></li>
        <li><span class="how-n">3</span><span><strong>You get a ranked shortlist</strong><br/>
          Each one scored on fit, reputation, who you'd meet, cost in your currency and visa, with every deadline in order.</span></li>
      </ol>

      <p class="hero-note">Prototype · real calls gathered ${fmtDate(GATHERED_AT)} · always check the source before you act</p>
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

function blankDraft() {
  const d = structuredClone(seedProfile);
  return { ...d, id: 'p_you', name: 'You', fictional: false, affiliation: '', input_text: '', topics: [], goals: [], research_summary: '' };
}

function renderOnboarding() {
  $('#topbar').hidden = true;
  draft ??= state.onboarded ? structuredClone(state.profile) : blankDraft();

  const dots = STEPS.map((_, i) =>
    `<span class="onb-dot ${i < onbStep ? 'done' : i === onbStep ? 'active' : ''}"></span>`).join('');

  return `<div class="onb onb-wide">
    <div class="onb-progress">
      <span class="onb-step">Step ${onbStep + 1} of ${STEPS.length} · ${STEPS[onbStep]}</span>${dots}
    </div>
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
  const inr = draft.currency === 'INR';
  const [min, max, step] = inr ? [20000, 400000, 5000] : [200, 8000, 100];
  c.max_cost = Math.min(max, Math.max(min, c.max_cost));
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
          ${['INR', 'USD', 'EUR', 'GBP', 'BRL'].map((cur) => `<option value="${cur}" ${draft.currency === cur ? 'selected' : ''}>${cur}</option>`).join('')}
        </select></div>
    </div>
    <span class="hint" style="margin-top:-.6rem;display:block">Your passport is used only for visa requirements and regional fee tiers.</span>

    <div class="field" style="margin-top:1.2rem">
      <label for="budget">Most you could spend on one trip: <strong id="budget-out">${money(c.max_cost, draft.currency)}</strong></label>
      <input type="range" id="budget" min="${min}" max="${max}" step="${step}" value="${c.max_cost}" data-act="budget" />
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

const GOAL_HINTS = { publication: ['publish', 'journal', 'article'], feedback: ['feedback', 'chapter', 'draft', 'work in progress'],
  networking: ['network', 'meet', 'collaborat', 'mentor'], low_cost: ['budget', 'afford', 'cheap', 'tight', 'lakh', 'funding'],
  visibility: ['top ', 'prestig', 'good venue', 'well-known', 'flagship', 'somewhere good'] };

function suggestFromText(text) {
  const t = ` ${text.toLowerCase()} `;
  let added = 0;
  for (const g of topicVocabulary) for (const topic of g.topics) {
    const hits = topic.k.filter((kw) => t.includes(kw)).length;
    if (!hits || draft.topics.some((x) => x.term === topic.term)) continue;
    draft.topics.push({ term: topic.term, weight: Math.min(0.95, 0.55 + 0.15 * hits) });
    added++;
  }
  draft.topics.sort((a, b) => b.weight - a.weight);
  if (!(draft.goals ?? []).length) {
    draft.goals = Object.entries(GOAL_HINTS).filter(([, ks]) => ks.some((k) => t.includes(k))).map(([g]) => g).slice(0, 3);
  }
  return added;
}

function onboardingEvents(root) {
  const repaint = () => { $('#onb-panel', root).outerHTML = `<div class="onb-panel" id="onb-panel">${[stepResearch, stepPractical][onbStep]()}</div>`; };

  root.addEventListener('input', (e) => {
    const act = e.target.dataset.act;
    if (act === 'weight') draft.topics[+e.target.dataset.i].weight = +e.target.value / 100;
    if (act === 'describe') draft.input_text = e.target.value;
    if (act === 'topicsearch') { topicQuery = e.target.value; $('#vocab', root).innerHTML = vocabHtml(); }
    if (act === 'budget') { draft.constraints.max_cost = +e.target.value; $('#budget-out').textContent = money(+e.target.value, draft.currency); }
    if (act === 'country') draft.geography.country = e.target.value;
    if (act === 'passport') draft.geography.passport = e.target.value;
    if (act === 'currency') { draft.currency = e.target.value; repaint(); }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || ['INPUT', 'SELECT', 'TEXTAREA'].includes(btn.tagName)) return;

    switch (btn.dataset.act) {
      case 'draft': {
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
        draft = structuredClone(seedProfile);
        repaint();
        toast({ emoji: '👤', title: `Loaded ${seedProfile.name}`, body: 'A fictional PhD researcher drafted by the draft-profile skill from a short description.' });
        break;
      case 'next': onbStep = 1; repaint(); scrollTo(0, 0); break;
      case 'back': onbStep = 0; repaint(); scrollTo(0, 0); break;
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
      case 'finish':
        state.profile = draft;
        state.onboarded = true;
        state.weightAdjust = {};
        save();
        draft = null; onbStep = 0;
        location.hash = '#/thinking';
        break;
    }
  });
}

/* ============================================================
   Screen — agent pipeline
   ============================================================ */

function renderPipeline() {
  $('#topbar').hidden = true;
  return `<section class="pipe-screen">
    <div class="pipe">
      <h2>Grapevine is working.</h2>
      <p class="pipe-sub">Six specialised steps, not one clever prompt. This is what runs every week.</p>
      <div class="pipe-steps" id="pipe-steps">
        ${pipeline.map((s, i) => `<div class="pipe-step" data-i="${i}">
          <span class="pipe-bullet" aria-hidden="true">✓</span>
          <span><span class="pipe-label">${s.label}</span><br/><span class="pipe-detail">${s.detail}</span></span>
          <span class="pipe-tick" hidden>done</span>
        </div>`).join('')}
      </div>
      <div class="pipe-bar"><i id="pipe-bar"></i></div>
      <button class="btn btn-quiet pipe-skip" data-act="skip">Skip →</button>
    </div>
  </section>`;
}

let pipeTimers = [];

function runPipeline() {
  pipeTimers.forEach(clearTimeout);
  pipeTimers = [];
  const steps = $$('#pipe-steps .pipe-step');
  let t = 250;

  steps.forEach((el, i) => {
    pipeTimers.push(setTimeout(() => {
      steps.forEach((s) => s.classList.remove('active'));
      el.classList.add('active');
      $('#pipe-bar').style.width = `${(i / steps.length) * 100}%`;
    }, t));
    t += pipeline[i].ms;
    pipeTimers.push(setTimeout(() => {
      el.classList.remove('active');
      el.classList.add('done');
      $('.pipe-tick', el).hidden = false;
    }, t - 120));
  });

  pipeTimers.push(setTimeout(() => {
    const bar = $('#pipe-bar');
    if (bar) bar.style.width = '100%';
  }, t));
  pipeTimers.push(setTimeout(() => { location.hash = '#/feed'; }, t + 420));
}

/* ============================================================
   Screen — feed
   ============================================================ */

let feedFilter = 'all';

function visibleOpportunities() {
  let list = allOpportunities().filter((o) => !state.dismissed.includes(o.id));
  if (!state.showIneligible) list = list.filter((o) => o.eligible !== 'no');
  if (state.profile.constraints.visa_tolerance === 'none') list = list.filter((o) => o.visa?.required !== 'yes');
  if (feedFilter === 'saved') list = list.filter((o) => state.saved.includes(o.id));
  else if (feedFilter !== 'all') list = list.filter((o) => o.type === feedFilter);
  return list.sort((a, b) => {
    if (!!a.predatory_flag !== !!b.predatory_flag) return a.predatory_flag ? 1 : -1;
    return priorityOf(b) - priorityOf(a);
  });
}

const hiddenIneligible = () => allOpportunities().filter((o) => !state.dismissed.includes(o.id) && o.eligible === 'no').length;

function renderFeed() {
  $('#topbar').hidden = false;
  const list = visibleOpportunities();
  const main = list.filter((o) => !o.predatory_flag);
  const rest = list.filter((o) => o.predatory_flag);
  const nIneligible = hiddenIneligible();
  const soon = allOpportunities()
    .filter((o) => !state.dismissed.includes(o.id))
    .map((o) => nextDeadline(o))
    .filter((d) => d && daysUntil(d.date) >= 0 && daysUntil(d.date) <= 30).length;

  const filters = [['all', 'Everything'], ['conference', 'Conferences'], ['journal_call', 'Journal calls'],
    ['fellowship', 'Fellowships'], ['saved', `Saved (${state.saved.length})`]];

  return `<div class="wrap">
    <header class="feed-head">
      <div class="eyebrow">Your feed · real calls gathered ${fmtDate(GATHERED_AT)}</div>
      <h1>${state.profile.name === 'You' ? 'Your shortlist.' : `Hello, ${esc(state.profile.name.split(' ')[0])}.`}</h1>
      <p class="lede">${list.length} opportunit${list.length === 1 ? 'y' : 'ies'}, most worth your time first${
        soon ? `, and <strong>${soon}</strong> deadline${soon === 1 ? '' : 's'} in the next thirty days` : ''}.
        The score weighs fit, reputation, who you'd meet, what you'd get out of it, and whether you can afford to go,
        using <a href="#/profile">your goals</a>.</p>
    </header>

    <form class="paste-box" id="paste-form">
      <span class="paste-label">🔗 Know about something that's not here? Paste the link.</span>
      <input type="text" id="paste-url" placeholder="https://…" aria-label="Opportunity URL" />
      <button class="btn btn-primary" type="submit">Extract it</button>
    </form>

    <div class="filters">
      ${filters.map(([v, l]) => `<button class="filter" data-act="filter" data-v="${v}" aria-pressed="${feedFilter === v}">${l}</button>`).join('')}
    </div>

    ${list.length === 0 ? `<div class="empty"><span class="big" aria-hidden="true">🍇</span>
        <p><strong>Nothing here.</strong></p>
        <p class="small">${feedFilter === 'saved' ? 'Save something from the feed and it will show up here — and in your tracker.' : 'You have dismissed everything. The weekly refresh runs again on Saturday.'}</p>
        ${feedFilter !== 'all' ? '<button class="btn btn-ghost btn-sm" data-act="filter" data-v="all">Show everything</button>' : ''}
      </div>` : ''}

    <div class="feed-list">${main.map((o, i) => oppCard(o, i)).join('')}</div>

    ${rest.length ? `<div class="section-rule">Flagged, shown so you can recognise it</div>
      <div class="feed-list">${rest.map((o, i) => oppCard(o, i)).join('')}</div>` : ''}

    ${nIneligible ? `<p class="small muted" style="margin-top:1.4rem">
      ${state.showIneligible ? 'Showing' : 'Hiding'} ${nIneligible} you can't apply to (career stage, region or membership).
      <button class="btn btn-quiet btn-sm" data-act="toggle-inelig">${state.showIneligible ? 'Hide them' : 'Show them'}</button></p>` : ''}

    ${list.length ? `<p class="tiny muted" style="margin-top:1.4rem">
      At least one item comes from a field next to yours (marked 🧭), so the feed doesn't only show what you'd already search for.
      Every deadline and fee marked ✓ was quoted from the source page. Check before you act.</p>` : ''}
  </div>`;
}

function pasteEvents(root) {
  const form = $('#paste-form', root);
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('#paste-url').value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({ emoji: '🚫', title: 'Only http and https are accepted', body: 'The URL fetcher runs server-side, so the scheme allowlist is a security control, not a formatting rule.' });
      return;
    }
    showPasteModal(url);
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

function renderBrief(id) {
  $('#topbar').hidden = false;
  const o = byId(id);
  if (!o) return `<div class="wrap"><div class="empty"><span class="big">🤔</span><p>No brief for that one.</p>
    <a class="btn btn-ghost btn-sm" href="#/feed">Back to the feed</a></div></div>`;

  const saved = state.saved.includes(o.id);
  const dl = deadlinesFor(o);
  const cost = o.cost_estimate;
  const segs = cost ? Object.entries(cost.breakdown ?? {}) : [];
  const totalHigh = segs.reduce((s, [, v]) => s + (v?.high ?? 0), 0) || 1;
  const subs = o.priority?.sub_scores ?? {};
  const w = weightsFor();
  const venueFunds = (o.funding ?? []).filter((f) => f.source !== 'external');
  const extFunds = (o.funding ?? []).filter((f) => f.source === 'external');
  const elig = o.eligibility ?? {};

  const eligibleChip = { yes: '<span class="chip chip-vine">✓ You can apply</span>',
    conditional: '<span class="chip chip-amber">⚠ Conditional</span>',
    no: '<span class="chip chip-coral">✕ Not eligible</span>' }[o.eligible] ?? '';
  const ELIG_FUND = { yes: ['chip-vine', 'You qualify'], likely: ['chip-vine', 'Likely eligible'],
    check: ['chip-amber', 'Check eligibility'], no: ['chip-outline', 'Not eligible'], true: ['chip-vine', 'You qualify'] };

  const fundItem = (f) => {
    const [cls, label] = ELIG_FUND[String(f.eligible)] ?? ['chip-outline', 'Check eligibility'];
    return `<div class="fund-item">
      <div class="fund-name">${esc(f.name)} <span class="chip ${cls}">${label}</span></div>
      <div class="fund-meta">${esc(f.amount_note ?? '')}${f.deadline && /^\d{4}-/.test(f.deadline) ? ` · closes ${fmtDate(f.deadline)} (${relative(f.deadline)})`
        : f.cycle ? ` · ${esc(f.cycle)}` : ' · no fixed deadline'}</div>
      ${f.requires ? `<div class="tl-dep">⛓ needs: ${esc(f.requires)}</div>` : ''}
      ${f.sequence_note ? `<div class="fund-note"><strong>When:</strong> ${esc(f.sequence_note)}</div>` : ''}
      ${f.why || f.eligibility_notes ? `<div class="fund-note">${esc(f.why ?? f.eligibility_notes)}</div>` : ''}
      ${srcQuote(f.source_quote)}
      <a class="tiny" href="${safeUrl(f.source_url)}" target="_blank" rel="noopener noreferrer">Official page ↗</a>
    </div>`;
  };

  return `<div class="wrap">
    <a class="back-link" href="#/feed">← Back to the feed</a>

    <header class="brief-top">
      ${o.predatory_flag ? `<div class="callout danger" style="margin-bottom:1.2rem">
        <h4><span aria-hidden="true">⚠️</span> Grapevine does not recommend this venue</h4>
        <ul class="small" style="margin:.2rem 0 0;padding-left:1.1rem">${(o.predatory_reasons ?? []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>` : ''}
      ${o.explore ? `<div class="banner-explore" style="margin-bottom:1rem"><span aria-hidden="true">🧭</span>
        <span><strong>From a field next to yours.</strong> ${esc(o.explore_reason)}</span></div>` : ''}

      <div class="eyebrow">${TYPE_LABEL[o.type]} · is it worth it?</div>
      <h1>${esc(o.title)}</h1>
      <p class="lede" style="margin-top:.4rem">${esc(o.host)}${o.location.city !== '—' ? ` · ${esc(o.location.city)}, ${esc(o.location.country)}` : ''}${
        o.dates?.start ? ` · ${fmtDate(o.dates.start)}${o.dates.end && o.dates.end !== o.dates.start ? `–${fmtDate(o.dates.end)}` : ''}` : ''}</p>
      <div class="row" style="margin-top:.8rem">
        ${eligibleChip}
        ${STATUS_CHIP[o.status] ?? ''}
        <span class="chip chip-outline">${esc(o.location.format.replace('_', '-'))}</span>
        <a class="chip chip-sky" href="${safeUrl(o.source_url)}" target="_blank" rel="noopener noreferrer">Source page ↗</a>
        <span class="chip chip-outline">checked ${fmtDate(o.extracted_at.slice(0, 10))}</span>
      </div>
    </header>

    <div class="brief-grid">
      <div>
        <section class="panel worth">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">⚖️</span> Is it worth going?</h3></div>
          <div class="fitline">${ring(priorityOf(o) / 100, 86, 'worth it')}
            <div><p style="margin:0" class="worth-tag">${esc(o.tagline ?? '')}</p>
              <p class="tiny muted" style="margin:.35rem 0 0">Weighted by your goals: ${(state.profile.goals ?? []).map((g) => GOALS.find((x) => x.id === g)?.label).filter(Boolean).join(' · ') || 'none set'}.
              <a href="#/profile">Change</a></p></div></div>

          <div class="subs">
            ${SUBS.map(([k, label, q]) => {
              const s = subs[k];
              if (!s || typeof s.score !== 'number') return `<div class="sub na"><div class="sub-h"><span>${label}</span><span class="muted tiny">n/a for ${TYPE_LABEL[o.type].toLowerCase()}s</span></div></div>`;
              const tone = s.score >= 75 ? 'hi' : s.score >= 55 ? 'mid' : 'lo';
              return `<div class="sub">
                <div class="sub-h"><span>${label} <span class="muted tiny">· ${q.toLowerCase()}</span></span><span class="sub-n">${s.score}<span class="muted tiny"> ×${w[k].toFixed(2)}</span></span></div>
                <div class="sub-bar"><i class="${tone}" style="width:${s.score}%"></i></div>
                <p class="sub-r">${esc(s.reason)}</p>
              </div>`;
            }).join('')}
          </div>

          <div class="gowatch">
            ${o.why_go?.length ? `<div class="go"><h4>👍 Why go</h4><ul>${o.why_go.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            ${o.watch_out?.length ? `<div class="watch"><h4>⚠️ Watch out</h4><ul>${o.watch_out.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          </div>
        </section>

        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🎯</span> How it connects to your work</h3></div>
          <p style="margin:0 0 .8rem">${esc(o.fit?.rationale ?? '')}</p>
          <div class="row">${(o.fit?.matched_topics ?? []).map((t) => `<span class="chip chip-grape">${esc(t)}</span>`).join('')}</div>
          ${o.fit?.neighborhood_evidence?.length ? `<div class="evidence"><ul>${o.fit.neighborhood_evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        </section>

        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🗓</span> What to do, in order</h3></div>
          ${dl.length ? `<div class="timeline">
            ${dl.map((d) => {
              const u = urgency(d.date);
              const past = daysUntil(d.date) < 0;
              return `<div class="tl ${past ? 'is-past' : ''}">
                <div class="tl-date"><div class="tl-d">${fmtDate(d.date)}</div>
                  <div class="tl-in">${relative(d.date)}</div></div>
                <div class="tl-rail"><span class="tl-line"></span>
                  <span class="tl-dot ${d.depends_on || d.requires ? 'dep' : ''} ${u === 'soon' ? 'soon' : ''}"></span></div>
                <div class="tl-body">
                  <div class="tl-label">${d.fund_name ? esc(d.fund_name) : DEADLINE_LABEL[d.label]} ${d.grounded ? conf('verified') : conf('inferred')}</div>
                  <div class="tl-why">${d.synthetic
                    ? `Not on the call page. Grapevine counts back ${d.lead} days from the event for this visa route. Start by this date.`
                    : DEADLINE_WHY[d.label]}</div>
                  ${d.depends_on ? `<span class="tl-dep">⛓ only after the ${DEADLINE_LABEL[d.depends_on]?.toLowerCase() ?? esc(d.depends_on)} is accepted</span>` : ''}
                  ${d.requires ? `<span class="tl-dep">⛓ needs: ${esc(d.requires)}</span>` : ''}
                  ${srcQuote(d.source_quote)}
                </div>
              </div>`;
            }).join('')}
          </div>` : '<p class="small muted" style="margin:0">No dated deadlines published yet. We will pick them up on the next refresh.</p>'}
        </section>

        ${cost ? `<section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">💰</span> What it costs you</h3>${conf('range')}</div>
          <div class="cost-total">${cost.high === 0 ? 'No cost' : `${money(cost.low, cost.currency)} – ${money(cost.high, cost.currency)}`}</div>
          <p class="tiny muted" style="margin:.2rem 0 0">In ${esc(cost.currency)}. A range, because a single number would be false precision.</p>
          ${cost.high > 0 ? `<div class="cost-bar">
            ${segs.map(([k, v]) => `<span class="cost-seg" style="width:${((v?.high ?? 0) / totalHigh) * 100}%;background:${COST_COLORS[k] ?? 'var(--muted)'}" title="${COST_LABEL[k] ?? esc(k)}"></span>`).join('')}
          </div>` : ''}
          <div class="cost-key">
            ${segs.map(([k, v]) => `<div class="cost-k">
              <span class="cost-sw" style="background:${COST_COLORS[k] ?? 'var(--muted)'}"></span>
              <span>${COST_LABEL[k] ?? esc(k)} ${v?.grounded ? conf('verified') : ''}<br/><span class="cost-note">${esc(v?.note ?? '')}</span></span>
              <span>${!v?.high ? '—' : v.low === v.high ? money(v.low, cost.currency) : `${money(v.low, cost.currency)}–${money(v.high, cost.currency)}`}</span>
            </div>`).join('')}
          </div>
          ${cost.assumptions?.length ? `<details class="assumptions"><summary><strong>Assumptions behind those numbers</strong></summary>
            <ul>${cost.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
          ${cost.net_note ? `<div class="net-note">${esc(cost.net_note)}</div>` : ''}
          ${cost.high > state.profile.constraints.max_cost ? `<div class="callout" style="margin-top:.9rem">
            <h4><span aria-hidden="true">📈</span> Above your limit</h4>
            <p>You set ${money(state.profile.constraints.max_cost)} per trip. The high end here is ${money(cost.high, cost.currency)}. The funding below may close the gap.</p></div>` : ''}
        </section>` : ''}

        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🎁</span> Money you can apply for</h3></div>
          <h4 class="fund-h">From the ${o.type === 'journal_call' ? 'publisher' : 'organisers'}</h4>
          ${venueFunds.length ? `<div class="fund">${venueFunds.map(fundItem).join('')}</div>`
            : '<p class="small muted">None published on the call or its grants page.</p>'}
          <h4 class="fund-h">Elsewhere you could apply</h4>
          ${extFunds.length ? `<div class="fund">${extFunds.map(fundItem).join('')}</div>`
            : '<p class="small muted">Nothing specific found. Your university\'s research office usually has a conference-travel fund.</p>'}
        </section>

        ${o.past_editions?.length ? `<section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">📚</span> Past editions</h3></div>
          <div class="past">${o.past_editions.map((p) => `<div class="past-ed">
            <div class="past-y">${esc(p.year ?? '')}</div>
            <div class="past-t">${esc(p.theme ?? '')}${p.city ? ` · ${esc(p.city)}` : ''}</div>
            ${p.representative_papers?.length ? `<ul>${p.representative_papers.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          </div>`).join('')}</div>
        </section>` : ''}

        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">📄</span> The call, in brief</h3></div>
          <p>${esc(o.description)}</p>
        </section>
      </div>

      <aside class="side">
        <div class="panel">
          <div class="stack">
            <button class="btn ${saved ? 'btn-ghost' : 'btn-primary'}" data-act="save" data-id="${esc(o.id)}">
              ${saved ? '★ Saved: in your tracker' : '☆ Save & track the deadlines'}</button>
            <button class="btn btn-ghost btn-sm" data-act="ics" data-id="${esc(o.id)}">⬇ Add to calendar (.ics)</button>
            <button class="btn btn-quiet btn-sm" data-act="dismiss" data-id="${esc(o.id)}">Not for me</button>
          </div>
          <p class="tiny muted" style="margin:.9rem 0 0">Grapevine never registers, pays, submits or books for you.</p>
        </div>

        <div class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">✅</span> Can you apply?</h3>${conf(o.confidence.eligibility)}</div>
          <p class="small" style="margin:0 0 .7rem">${esc(o.eligibility_notes ?? '')}</p>
          <dl class="kv">
            <dt>Career stage</dt><dd>${!elig.career_stage?.length ? 'Not stated' : elig.career_stage.includes(state.profile.career_stage) ? 'Accepted' : 'Not listed'}</dd>
            <dt>Membership</dt><dd>${elig.membership_required ? 'Required' : 'Not required'}</dd>
            <dt>Nationality</dt><dd>${esc(elig.nationality ?? 'No restriction')}</dd>
          </dl>
        </div>

        ${o.visa ? `<div class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🛂</span> Visa</h3>${conf('advisory')}</div>
          <div class="callout ${o.visa.required === 'yes' ? '' : 'danger'}" style="${o.visa.required === 'no' ? 'border-left-color:var(--vine);background:var(--vine-soft)' : ''}">
            <h4>${o.visa.required === 'yes' ? '⚠️ A visa is required' : o.visa.required === 'no' ? '✓ No visa required' : '❓ Depends on your circumstances'}</h4>
            <p>${esc(o.visa.note)}</p>
            ${o.visa.official_source ? `<p><a href="${safeUrl(o.visa.official_source)}" target="_blank" rel="noopener noreferrer">Official source ↗</a></p>` : ''}
          </div>
          <p class="tiny muted" style="margin:.7rem 0 0">Advisory only, and it may be out of date. Confirm with the official source before acting.</p>
        </div>` : ''}

        <div class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🔍</span> How much to trust this</h3></div>
          <dl class="kv">
            <dt>Deadlines</dt><dd>${conf(o.confidence.dates)}</dd>
            <dt>Fees</dt><dd>${conf(o.confidence.fees)}</dd>
            <dt>Cost estimate</dt><dd>${conf(o.confidence.cost)}</dd>
            <dt>Visa</dt><dd>${conf(o.confidence.visa)}</dd>
          </dl>
          <p class="tiny muted" style="margin:.8rem 0 0">✓ means the fact was quoted from the source page and re-checked. Click “source” next to any of them to see the exact words.</p>
        </div>
      </aside>
    </div>
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
        <dt>Career stage</dt><dd>${p.career_stage === 'phd' ? 'PhD candidate' : p.career_stage}${p.year ? `, year ${p.year}` : ''}</dd>
        <dt>Based in</dt><dd>${esc(p.geography.city ? p.geography.city + ', ' : '')}${esc(p.geography.country)}</dd>
        <dt>Passport</dt><dd>${esc(p.geography.passport)}</dd>
        <dt>Currency</dt><dd>${esc(p.currency)}</dd>
        <dt>Cost ceiling</dt><dd>${money(p.constraints.max_cost)}</dd>
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
      const was = p.constraints.max_cost;
      p.constraints.max_cost = Math.round(was * 0.85);
      state.weightAdjust.feasibility = +((state.weightAdjust.feasibility ?? 0) + 0.05).toFixed(2);
      effect = `Cost ceiling ${money(was)} → ${money(p.constraints.max_cost)}, and affordability now counts for more.`;
      break;
    }
    case 'not_prestigious':
      state.weightAdjust.standing = +((state.weightAdjust.standing ?? 0) + 0.05).toFixed(2);
      effect = 'Venue standing now counts for more in your ranking.';
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
  '/feed': renderFeed,
  '/tracker': renderTracker,
  '/profile': renderProfile,
};

function render() {
  const hash = location.hash.replace(/^#/, '');
  const app = $('#app');

  let html;
  const brief = hash.match(/^\/brief\/(.+)$/);
  if (brief) html = renderBrief(brief[1]);
  else html = (routes[hash] ?? renderWelcome)();

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

applyTheme();
render();
