/**
 * Grapevine prototype — application logic.
 *
 * Hash-routed, no build step, no backend. Everything the agent would compute is
 * read from data.js; everything the user changes is kept in localStorage so the
 * feedback loop is visible across a session.
 */

import { TODAY, profile as seedProfile, opportunities, pipeline, dismissReasons, suggestedTopics } from './data.js';

/* ============================================================
   State
   ============================================================ */

const KEY = 'grapevine.v1';

const defaultState = {
  onboarded: false,
  profile: structuredClone(seedProfile),
  saved: [],
  dismissed: [],
  pasted: [],
  feedback: [],
  changedTopics: [],
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

const money = (n, cur = state.profile.currency) => {
  const locale = cur === 'BRL' ? 'pt-BR' : cur === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
};

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
};
const DEADLINE_WHY = {
  abstract: 'The gate. Nothing downstream exists until this one is met.',
  full_paper: 'The finished article. Budget backwards from here, not forwards from today.',
  scholarship: 'Money, not access — but it opens late and closes fast.',
  early_bird: 'Saves money, not opportunity. Only act once acceptance has landed.',
  registration: 'Last point at which attending is still possible.',
  visa: 'Not printed on any call page. Grapevine works this one backwards from the travel date.',
};

/** Consular lead time by destination, used to synthesise the visa deadline. */
const VISA_LEAD_DAYS = { 'United States': 240, Canada: 120 };

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
  const list = opp.deadlines.map((d) => ({ ...d }));
  if (opp.visa?.required === 'yes' && opp.dates?.start) {
    const lead = VISA_LEAD_DAYS[opp.location.country] ?? 45;
    const date = new Date(new Date(opp.dates.start + 'T00:00:00Z') - lead * 86400000).toISOString().slice(0, 10);
    list.push({ label: 'visa', date, depends_on: null, grounded: false, synthetic: true, lead });
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

function ring(score, size = 66) {
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
    <div class="ring-cap">fit</div>
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

function oppCard(opp, i = 0) {
  const nd = nextDeadline(opp);
  const u = nd ? urgency(nd.date) : 'far';
  const saved = state.saved.includes(opp.id);
  const cls = ['opp', opp.explore ? 'is-explore' : '', opp.predatory_flag ? 'is-flagged' : ''].join(' ').trim();

  return `<article class="${cls}" data-opp="${opp.id}" style="animation-delay:${Math.min(i * 55, 400)}ms">
    <div class="ring-wrap">${ring(opp.fit.score)}</div>
    <div>
      ${opp.explore ? `<div class="banner-explore"><span aria-hidden="true">🧭</span><span><strong>Exploration slot.</strong> ${opp.explore_reason}</span></div>` : ''}
      ${opp.predatory_flag ? `<div class="banner-flag"><span aria-hidden="true">⚠️</span><span><strong>Flagged — no traceable scholarly footprint.</strong> Shown so you recognise it, not so you apply.</span></div>` : ''}
      ${opp.pasted ? `<div class="banner-explore"><span aria-hidden="true">🔗</span><span><strong>You added this.</strong> Extracted from the link you pasted.</span></div>` : ''}

      <h3 class="opp-title"><a href="#/brief/${opp.id}">${opp.title}</a></h3>
      <div class="opp-host">${opp.host}</div>
      <p class="opp-tag">${opp.tagline}</p>

      <div class="opp-chips">
        <span class="chip chip-grape">${TYPE_LABEL[opp.type]}</span>
        ${opp.location.city !== '—' ? `<span class="chip">📍 ${opp.location.city}, ${opp.location.country}</span>` : ''}
        ${opp.dates.start ? `<span class="chip">🗓 ${fmtDate(opp.dates.start)}</span>` : ''}
        ${nd ? `<span class="chip ${u === 'soon' ? 'chip-coral' : u === 'near' ? 'chip-amber' : 'chip-outline'}">
            ⏳ ${DEADLINE_LABEL[nd.label]} ${relative(nd.date)}</span>` : ''}
        <span class="chip ${opp.cost_estimate.high === 0 ? 'chip-vine' : opp.cost_estimate.high > state.profile.constraints.max_cost ? 'chip-amber' : 'chip-vine'}">
          💰 ${opp.cost_estimate.high === 0 ? 'No cost' : `${money(opp.cost_estimate.low, opp.cost_estimate.currency)}–${money(opp.cost_estimate.high, opp.cost_estimate.currency)}`}</span>
        ${opp.visa.required === 'yes' ? '<span class="chip chip-coral">🛂 Visa needed</span>'
          : opp.visa.required === 'no' && opp.location.country !== '—' && opp.location.country !== 'Brazil' ? '<span class="chip chip-vine">🛂 No visa</span>' : ''}
        ${opp.eligible === 'conditional' ? '<span class="chip chip-amber">Conditional</span>' : ''}
      </div>

      <div class="opp-actions">
        <a class="btn btn-primary btn-sm" href="#/brief/${opp.id}">Read the brief</a>
        <button class="btn btn-ghost btn-sm" data-act="save" data-id="${opp.id}">${saved ? '★ Saved' : '☆ Save'}</button>
        <button class="btn btn-quiet btn-sm" data-act="dismiss" data-id="${opp.id}">Not for me</button>
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
      <h1>The best way to hear about something<br/><em>shouldn't be knowing the right person.</em></h1>
      <p class="hero-sub">Grapevine finds the conferences, journal calls and fellowships your research deserves —
        and tells you, honestly, whether it's worth going.</p>

      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="#/onboarding">Set up my research profile</a>
        <a class="btn btn-ghost btn-lg" href="#/thinking">Skip — show me the feed</a>
      </div>

      <div class="hero-quotes">
        <div class="hero-quote"><span aria-hidden="true">📨</span><span>“My supervisor forwarded it. Three days before the deadline.”</span></div>
        <div class="hero-quote"><span aria-hidden="true">💬</span><span>“Someone posted a screenshot in the group chat.”</span></div>
        <div class="hero-quote"><span aria-hidden="true">🤷</span><span>“I found it. I still don't know if I can afford to go.”</span></div>
      </div>

      <p class="hero-note">Interactive prototype · all content is hand-written sample data · today is 13 September 2026</p>
    </div>
  </section>`;
}

/* ============================================================
   Screen — onboarding
   ============================================================ */

let onbStep = 0;
let draft = null;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STEPS = ['Who you are', 'What you work on', 'Where you are', 'What you can do'];

function renderOnboarding() {
  $('#topbar').hidden = true;
  draft ??= structuredClone(state.profile);
  if (!draft.__bootstrapped) draft.topics = draft.topics ?? [];

  const dots = STEPS.map((_, i) =>
    `<span class="onb-dot ${i < onbStep ? 'done' : i === onbStep ? 'active' : ''}"></span>`).join('');

  return `<div class="onb">
    <div class="onb-progress">
      <span class="onb-step">Step ${onbStep + 1} of 4</span>${dots}
    </div>
    <div class="onb-panel" id="onb-panel">${[stepWho, stepTopics, stepWhere, stepConstraints][onbStep]()}</div>
  </div>`;
}

function stepWho() {
  const done = draft.__bootstrapped;
  return `<div class="eyebrow">Profile bootstrapper</div>
    <h2 class="onb-q">Let's start with your work, not a form.</h2>
    <p class="onb-help">Paste an ORCID and Grapevine drafts your profile from your publication record.
      Everything it guesses stays editable — it is a draft, never a fact.</p>

    <div class="field">
      <label for="orcid">ORCID iD</label>
      <div class="input-row">
        <input type="text" id="orcid" value="${esc(draft.orcid ?? '')}" placeholder="0000-0003-1847-2206" autocomplete="off" />
        <button class="btn btn-primary" data-act="orcid">Look up</button>
      </div>
      <span class="hint">In this prototype the lookup is canned. The real thing queries OpenAlex.</span>
    </div>

    <div id="orcid-out">${done ? orcidResult() : ''}</div>

    <div class="onb-actions">
      <button class="btn btn-primary" data-act="next" ${done ? '' : 'disabled'}>Continue</button>
      <button class="btn btn-quiet" data-act="manual">I'll fill it in myself</button>
    </div>`;
}

function orcidResult() {
  return `<div class="orcid-result">
      <span aria-hidden="true">✨</span>
      <span><strong>Found 7 works, 2019–2026.</strong> Drafted a profile for
      <strong>${esc(draft.name)}</strong> — ${esc(draft.affiliation)}, doctoral candidate.
      Topics drafted on the next step.</span>
    </div>`;
}

function stepTopics() {
  const rows = draft.topics.map((t, i) => `
    <div class="topic-row" style="animation-delay:${i * 45}ms">
      <span class="t-name">${esc(t.term)}</span>
      <input type="range" min="0" max="100" value="${Math.round(t.weight * 100)}"
             data-act="weight" data-i="${i}" aria-label="Weight for ${esc(t.term)}" />
      <button class="t-del" data-act="deltopic" data-i="${i}" aria-label="Remove ${esc(t.term)}">×</button>
    </div>`).join('');

  const unused = suggestedTopics.filter((s) => !draft.topics.some((t) => t.term === s));

  return `<div class="eyebrow">Research profile</div>
    <h2 class="onb-q">Does this look like your work?</h2>
    <p class="onb-help">Drafted from your publication record. Drag a slider to say what matters more.
      These weights drive ranking — and the feedback loop edits them later.</p>

    <div class="topic-list">${rows || '<p class="muted">No topics yet — add one below.</p>'}</div>

    ${unused.length ? `<div class="row" style="margin-top:1rem">
      <span class="small muted">Suggested:</span>
      ${unused.map((s) => `<button class="chip chip-outline" data-act="addtopic" data-term="${esc(s)}">+ ${esc(s)}</button>`).join('')}
    </div>` : ''}

    <div class="field" style="margin-top:1.2rem">
      <label for="newtopic">Add your own</label>
      <div class="input-row">
        <input type="text" id="newtopic" placeholder="e.g. testimony and the law" />
        <button class="btn btn-ghost" data-act="addcustom">Add</button>
      </div>
    </div>

    <div class="onb-actions">
      <button class="btn btn-primary" data-act="next">Continue</button>
      <button class="btn btn-quiet" data-act="back">Back</button>
    </div>`;
}

function stepWhere() {
  const stages = [
    ['phd', 'PhD candidate', 'Doctoral researcher'],
    ['postdoc', 'Postdoc', 'Early career'],
    ['faculty', 'Faculty', 'Permanent post'],
    ['independent', 'Independent', 'Unaffiliated'],
  ];
  return `<div class="eyebrow">Geography and money</div>
    <h2 class="onb-q">Where do you travel from, and on what passport?</h2>
    <p class="onb-help">This decides which fee tier you qualify for, which currency costs are shown in,
      and whether a venue means a consulate appointment. Passport data is used for nothing else.</p>

    <div class="field">
      <label>Career stage</label>
      <div class="opt-grid">
        ${stages.map(([v, l, s]) => `<button class="opt" data-act="stage" data-v="${v}"
          aria-pressed="${draft.career_stage === v}"><span>${l}</span><span class="opt-sub">${s}</span></button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label for="country">Based in</label>
      <input type="text" id="country" value="${esc(draft.geography.country)}" data-act="country" />
    </div>

    <div class="field">
      <label for="passport">Passport</label>
      <input type="text" id="passport" value="${esc(draft.geography.passport)}" data-act="passport" />
      <span class="hint">Used only for visa requirements and regional fee tiers.</span>
    </div>

    <div class="field">
      <label for="currency">Show costs in</label>
      <select id="currency" data-act="currency">
        ${['BRL', 'INR', 'USD', 'EUR', 'GBP'].map((c) =>
          `<option value="${c}" ${draft.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <span class="hint">Costs are converted at a rate fixed on 12 Sep 2026 and shown as ranges, never exact figures.</span>
    </div>

    <div class="onb-actions">
      <button class="btn btn-primary" data-act="next">Continue</button>
      <button class="btn btn-quiet" data-act="back">Back</button>
    </div>`;
}

function stepConstraints() {
  const c = draft.constraints;
  return `<div class="eyebrow">Constraints</div>
    <h2 class="onb-q">What actually rules something out?</h2>
    <p class="onb-help">Grapevine will still show you things outside these limits — it just tells you plainly
      that they are outside them, rather than quietly hiding them.</p>

    <div class="field">
      <label for="budget">Realistic ceiling per opportunity — <strong id="budget-out">${money(c.max_cost, draft.currency)}</strong></label>
      <input type="range" id="budget" min="1000" max="40000" step="500" value="${c.max_cost}" data-act="budget" />
    </div>

    <div class="field">
      <label>Months you can travel</label>
      <div class="months">
        ${MONTHS.map((m) => `<button class="month" data-act="month" data-m="${m}"
          aria-pressed="${c.months_available.includes(m)}">${m}</button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label>Format</label>
      <div class="opt-grid">
        ${[['any', 'Either', 'In person or online'], ['in_person', 'In person', 'Travel is the point'], ['online', 'Online only', 'No travel']]
          .map(([v, l, s]) => `<button class="opt" data-act="format" data-v="${v}"
            aria-pressed="${c.format === v}"><span>${l}</span><span class="opt-sub">${s}</span></button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label>Visa appetite</label>
      <div class="opt-grid">
        ${[['any', 'Anywhere', 'Visas are fine'], ['prefer_none', 'Prefer easy', 'Rank visa-free higher'], ['none', 'Visa-free only', 'Hard filter']]
          .map(([v, l, s]) => `<button class="opt" data-act="visatol" data-v="${v}"
            aria-pressed="${c.visa_tolerance === v}"><span>${l}</span><span class="opt-sub">${s}</span></button>`).join('')}
      </div>
    </div>

    <div class="onb-actions">
      <button class="btn btn-primary btn-lg" data-act="finish">Find my opportunities →</button>
      <button class="btn btn-quiet" data-act="back">Back</button>
    </div>`;
}

function onboardingEvents(root) {
  const repaint = () => { $('#onb-panel', root).outerHTML = `<div class="onb-panel" id="onb-panel">${[stepWho, stepTopics, stepWhere, stepConstraints][onbStep]()}</div>`; };

  root.addEventListener('input', (e) => {
    const act = e.target.dataset.act;
    if (act === 'weight') { draft.topics[+e.target.dataset.i].weight = +e.target.value / 100; }
    if (act === 'budget') { draft.constraints.max_cost = +e.target.value; $('#budget-out').textContent = money(+e.target.value, draft.currency); }
    if (act === 'country') draft.geography.country = e.target.value;
    if (act === 'passport') draft.geography.passport = e.target.value;
    if (act === 'currency') draft.currency = e.target.value;
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
    const act = btn.dataset.act;

    switch (act) {
      case 'orcid': {
        btn.disabled = true; btn.textContent = 'Querying OpenAlex…';
        setTimeout(() => {
          draft = structuredClone(seedProfile);
          draft.__bootstrapped = true;
          repaint();
          toast({ emoji: '✨', title: 'Profile drafted from 7 publications', body: 'Every field is a draft. Nothing is asserted as fact until you confirm it.' });
        }, 1100);
        break;
      }
      case 'manual':
        draft.__bootstrapped = true;
        onbStep = 1; repaint(); break;
      case 'next': onbStep = Math.min(3, onbStep + 1); repaint(); scrollTo(0, 0); break;
      case 'back': onbStep = Math.max(0, onbStep - 1); repaint(); scrollTo(0, 0); break;
      case 'deltopic': draft.topics.splice(+btn.dataset.i, 1); repaint(); break;
      case 'addtopic': draft.topics.push({ term: btn.dataset.term, weight: 0.6 }); repaint(); break;
      case 'addcustom': {
        const v = $('#newtopic').value.trim();
        if (v) { draft.topics.push({ term: v, weight: 0.6 }); repaint(); }
        break;
      }
      case 'stage': draft.career_stage = btn.dataset.v; repaint(); break;
      case 'format': draft.constraints.format = btn.dataset.v; repaint(); break;
      case 'visatol': draft.constraints.visa_tolerance = btn.dataset.v; repaint(); break;
      case 'month': {
        const m = btn.dataset.m;
        const arr = draft.constraints.months_available;
        const i = arr.indexOf(m);
        i === -1 ? arr.push(m) : arr.splice(i, 1);
        repaint(); break;
      }
      case 'finish':
        delete draft.__bootstrapped;
        state.profile = draft;
        state.onboarded = true;
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
  if (feedFilter === 'saved') list = list.filter((o) => state.saved.includes(o.id));
  else if (feedFilter !== 'all') list = list.filter((o) => o.type === feedFilter);
  return list.sort((a, b) => {
    if (a.explore !== b.explore) return a.explore ? 1 : -1;
    if (a.predatory_flag !== b.predatory_flag) return a.predatory_flag ? 1 : -1;
    return b.fit.score - a.fit.score;
  });
}

function renderFeed() {
  $('#topbar').hidden = false;
  const list = visibleOpportunities();
  const main = list.filter((o) => !o.explore && !o.predatory_flag);
  const rest = list.filter((o) => o.explore || o.predatory_flag);
  const soon = allOpportunities()
    .filter((o) => !state.dismissed.includes(o.id))
    .map((o) => nextDeadline(o))
    .filter((d) => d && daysUntil(d.date) >= 0 && daysUntil(d.date) <= 30).length;

  const filters = [['all', 'Everything'], ['conference', 'Conferences'], ['journal_call', 'Journal calls'],
    ['fellowship', 'Fellowships'], ['saved', `Saved (${state.saved.length})`]];

  return `<div class="wrap">
    <header class="feed-head">
      <div class="eyebrow">Your feed · refreshed 12 Sep 2026</div>
      <h1>Morning, ${esc(state.profile.name.split(' ')[0])}.</h1>
      <p class="lede">${list.length} opportunit${list.length === 1 ? 'y' : 'ies'} ranked against your profile${
        soon ? `, and <strong>${soon}</strong> deadline${soon === 1 ? '' : 's'} inside thirty days` : ''}.
        Everything here was filtered for eligibility before it was ranked.</p>
    </header>

    <form class="paste-box" id="paste-form">
      <span class="paste-label">🔗 Heard about something Grapevine missed? Paste the link.</span>
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

    ${rest.length ? `<div class="section-rule">Outside the ranking</div>
      <div class="feed-list">${rest.map((o, i) => oppCard(o, i)).join('')}</div>` : ''}

    ${list.length ? `<p class="tiny muted" style="margin-top:2rem">
      Ranked by topic and citation-neighbourhood overlap against your profile, after eligibility filtering.
      One slot is reserved for something outside your usual reading, so the feed cannot close in on itself.</p>` : ''}
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
        <span><strong>Extracted.</strong> In this prototype the fetcher returns one canned page regardless of the URL —
        the real Extraction Worker parses whatever it is given into the Opportunity schema.</span></div>
        <div class="onb-actions"><button class="btn btn-primary" data-act="paste-ok">Add it to my feed</button>
        <button class="btn btn-quiet" data-act="paste-cancel">Cancel</button></div>`;
      out.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (a === 'paste-cancel') closeModal();
        if (a === 'paste-ok') {
          // `url` is user input: scheme-checked above, stripped of attribute-breaking
          // characters here, and escaped again wherever it is rendered.
          const clean = url.replace(/["'<>`\s]/g, '');
          if (!state.pasted.some((p) => p.id === PASTED.id)) state.pasted.push({ ...PASTED, source_url: clean });
          save(); closeModal(); render();
          toast({ emoji: '🔗', title: 'Added to your feed', body: 'It was ranked against your profile like everything else — and it found a catch in the eligibility rules.' });
        }
      });
    }, 220 + checks.length * 320 + 300);
  });
}

/** The one page the prototype's paste-a-link path returns. */
const PASTED = {
  id: 'abho-2027',
  type: 'conference',
  title: 'XVI Encontro Nacional de História Oral',
  host: 'ABHO — Associação Brasileira de História Oral',
  theme: 'Escuta e Território',
  tagline: 'Exactly your field, at home — with a membership rule that could stop you presenting.',
  description:
    'The biennial national meeting of Brazilian oral historians, organised into working groups. The urban-memory and community-archive groups have run at every edition since 2017.',
  location: { city: 'Recife', country: 'Brazil', format: 'in_person' },
  dates: { start: '2027-06-08', end: '2027-06-11' },
  deadlines: [
    { label: 'abstract', date: '2027-01-18', depends_on: null, grounded: true, source_quote: 'Propostas de comunicação até 18 de janeiro de 2027.' },
    { label: 'early_bird', date: '2027-04-05', depends_on: null, grounded: true, source_quote: 'Inscrições antecipadas até 5 de abril de 2027.' },
  ],
  eligibility: {
    career_stage: ['phd', 'postdoc', 'faculty', 'independent', 'other'],
    nationality: null, region_restriction: null, membership_required: true,
    notes: 'Presenters must have held ABHO membership continuously for the two years preceding the meeting (anuidade em dia desde 2025).',
  },
  fees: [{ tier: 'Estudante de pós-graduação', amount: 210, currency: 'BRL', grounded: true, source_quote: 'Inscrição para pós-graduandos: R$210.' }],
  funding: [],
  past_editions: [{ year: 2025, theme: 'Vozes e Arquivos', representative_papers: ['Arquivos comunitários e o direito à memória'], source_url: 'https://abho.org.br/2025' }],
  source_url: 'https://abho.org.br/2027',
  extracted_at: '2026-09-13T09:02:00Z',
  predatory_flag: false,
  explore: false,
  pasted: true,
  fit: {
    score: 0.87,
    rationale:
      'As close to your field as anything in the feed, and the cheapest international-standard venue you have — because it is domestic. It ranks just below the Oral History Review call only on reach.',
    matched_topics: ['oral history', 'urban memory', 'community archives', 'housing rights & displacement'],
    neighborhood_evidence: ['Ana Maria Mauad is a past ABHO president'],
    why_semantic: 'Semantic overlap 0.89.',
  },
  eligible: 'conditional',
  eligibility_notes:
    'Here is the catch the call page buries in a footnote: presenters need two continuous years of ABHO membership before the meeting. Your profile records membership from 2025, which clears the rule only if the 2026 anuidade is already paid. If it lapsed, you cannot present in June 2027 and no amount of paying now will fix it. Check this before you write the abstract, not after.',
  cost_estimate: {
    currency: 'BRL',
    low: 1910, high: 3310,
    breakdown: {
      registration: { low: 210, high: 210, note: 'Postgraduate rate' },
      travel: { low: 900, high: 1500, note: 'Rio–Recife return' },
      accommodation: { low: 800, high: 1600, note: '4 nights' },
      visa: { low: 0, high: 0, note: 'Domestic' },
    },
    assumptions: ['Excludes ABHO annual membership (R$120)'],
    net_note: 'Cheap enough to be a default, if the membership rule clears.',
  },
  visa: { required: 'no', note: 'Domestic travel — not applicable.', official_source: null, verify_flag: false },
  confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'inferred' },
};

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
  const segs = Object.entries(cost.breakdown);
  const totalHigh = segs.reduce((s, [, v]) => s + v.high, 0) || 1;

  const eligibleChip = { yes: '<span class="chip chip-vine">✓ Eligible</span>',
    conditional: '<span class="chip chip-amber">⚠ Conditional</span>',
    no: '<span class="chip chip-coral">✕ Not eligible</span>' }[o.eligible];

  return `<div class="wrap">
    <a class="back-link" href="#/feed">← Back to the feed</a>

    <header class="brief-top">
      ${o.predatory_flag ? `<div class="callout danger" style="margin-bottom:1.2rem">
        <h4><span aria-hidden="true">⚠️</span> Grapevine does not recommend this venue</h4>
        <p>Flagged automatically. The reasons, in the order they were found:</p>
        <ul class="small" style="margin:.2rem 0 0;padding-left:1.1rem">${o.predatory_reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
        <p class="tiny" style="margin-top:.4rem">Researchers early in their careers are actively targeted by venues like this. The brief below is shown so you can see why it fails, not so you can apply.</p>
      </div>` : ''}

      ${o.explore ? `<div class="banner-explore" style="margin-bottom:1rem"><span aria-hidden="true">🧭</span>
        <span><strong>This came from the exploration slot.</strong> ${o.explore_reason}</span></div>` : ''}

      <div class="eyebrow">${TYPE_LABEL[o.type]} · decision brief</div>
      <h1>${o.title}</h1>
      <p class="lede" style="margin-top:.4rem">${o.host}${o.location.city !== '—' ? ` · ${o.location.city}, ${o.location.country}` : ''}${
        o.dates.start ? ` · ${fmtDate(o.dates.start)}${o.dates.end && o.dates.end !== o.dates.start ? `–${fmtDate(o.dates.end)}` : ''}` : ''}</p>
      <div class="row" style="margin-top:.8rem">
        ${eligibleChip}
        <span class="chip chip-outline">${o.location.format.replace('_', '-')}</span>
        <a class="chip chip-sky" href="${esc(o.source_url)}" target="_blank" rel="noopener noreferrer">Source page ↗</a>
        <span class="chip chip-outline">extracted ${fmtDate(o.extracted_at.slice(0, 10))}</span>
      </div>
    </header>

    <div class="brief-grid">
      <div>
        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🎯</span> Why this is here</h3></div>
          <div class="fitline">${ring(o.fit.score, 78)}
            <div><p style="margin:0">${o.fit.rationale}</p></div></div>
          <div class="row">${o.fit.matched_topics.map((t) => `<span class="chip chip-grape">${t}</span>`).join('')}</div>
          <div class="evidence">
            <p class="tiny muted" style="margin:0">${o.fit.why_semantic}</p>
            ${o.fit.neighborhood_evidence.length ? `<ul>${o.fit.neighborhood_evidence.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
          </div>
        </section>

        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🗓</span> Deadlines, in the order they bind</h3></div>
          <div class="timeline">
            ${dl.map((d) => {
              const u = urgency(d.date);
              return `<div class="tl">
                <div class="tl-date"><div class="tl-d">${fmtDate(d.date).replace(' ' + new Date(d.date + 'T00:00:00Z').getUTCFullYear(), '')}</div>
                  <div class="tl-in">${relative(d.date)}</div></div>
                <div class="tl-rail"><span class="tl-line"></span>
                  <span class="tl-dot ${d.depends_on ? 'dep' : ''} ${u === 'soon' ? 'soon' : ''}"></span></div>
                <div class="tl-body">
                  <div class="tl-label">${DEADLINE_LABEL[d.label]} ${d.grounded ? conf('verified') : conf('inferred')}</div>
                  <div class="tl-why">${d.synthetic
                    ? `Not a published deadline. Grapevine counts back ${d.lead} days from the event, because that is what consular processing has recently taken on this route. Treat it as the date you should have started, not the date you must finish.`
                    : DEADLINE_WHY[d.label]}</div>
                  ${d.depends_on ? `<span class="tl-dep">⛓ unlocks only after ${DEADLINE_LABEL[d.depends_on].toLowerCase()} is accepted</span>` : ''}
                  ${d.source_quote ? `<div class="quote-src">“${d.source_quote}”</div>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </section>

        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">💰</span> What it costs you</h3>${conf('range')}</div>
          <div class="cost-total">${cost.high === 0 ? 'No cost' : `${money(cost.low, cost.currency)} – ${money(cost.high, cost.currency)}`}</div>
          <p class="tiny muted" style="margin:.2rem 0 0">Shown in ${cost.currency}. A range, because a single number here would be a lie.</p>

          ${cost.high > 0 ? `<div class="cost-bar">
            ${segs.map(([k, v]) => `<span class="cost-seg" style="width:${(v.high / totalHigh) * 100}%;background:${COST_COLORS[k] ?? 'var(--muted)'}" title="${COST_LABEL[k] ?? k}"></span>`).join('')}
          </div>` : ''}

          <div class="cost-key">
            ${segs.map(([k, v]) => `<div class="cost-k">
              <span class="cost-sw" style="background:${COST_COLORS[k] ?? 'var(--muted)'}"></span>
              <span>${COST_LABEL[k] ?? k}<br/><span class="cost-note">${v.note}</span></span>
              <span>${v.high === 0 ? '—' : v.low === v.high ? money(v.low, cost.currency) : `${money(v.low, cost.currency)}–${money(v.high, cost.currency)}`}</span>
            </div>`).join('')}
          </div>

          <div class="assumptions"><strong>Assumptions behind those numbers</strong>
            <ul>${cost.assumptions.map((a) => `<li>${a}</li>`).join('')}</ul></div>
          ${cost.net_note ? `<div class="net-note">${cost.net_note}</div>` : ''}
          ${cost.high > state.profile.constraints.max_cost ? `<div class="callout" style="margin-top:.9rem">
            <h4><span aria-hidden="true">📈</span> Above the ceiling you set</h4>
            <p>You told Grapevine ${money(state.profile.constraints.max_cost)} per opportunity. The high end here is ${money(cost.high, cost.currency)}. Shown rather than hidden — funding may close the gap.</p></div>` : ''}
        </section>

        ${o.funding.length ? `<section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🎁</span> Money you can apply for</h3></div>
          <div class="fund">${o.funding.map((f) => `<div class="fund-item">
            <div class="fund-name">${f.name}
              ${f.eligible ? '<span class="chip chip-vine">You qualify</span>' : '<span class="chip chip-outline">Not eligible</span>'}</div>
            <div class="fund-meta">${f.amount_note}${f.deadline ? ` · closes ${fmtDate(f.deadline)} (${relative(f.deadline)})` : ' · no fixed deadline'}</div>
            <div class="fund-note">${f.eligibility_notes}</div>
            <a class="tiny" href="${f.source_url}" target="_blank" rel="noopener noreferrer">Official page ↗</a>
          </div>`).join('')}</div>
        </section>` : ''}

        ${o.past_editions.length ? `<section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">📚</span> What it has actually been about</h3></div>
          <div class="past">${o.past_editions.map((p) => `<div class="past-ed">
            <div class="past-y">${p.year}</div>
            <div class="past-t">${p.theme}</div>
            ${p.representative_papers.length ? `<ul>${p.representative_papers.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="tiny muted" style="margin:0">Programme not archived.</p>'}
          </div>`).join('')}</div>
        </section>` : ''}

        <section class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">📄</span> The call, in brief</h3></div>
          <p>${o.description}</p>
        </section>
      </div>

      <aside class="side">
        <div class="panel">
          <div class="stack">
            <button class="btn ${saved ? 'btn-ghost' : 'btn-primary'}" data-act="save" data-id="${o.id}">
              ${saved ? '★ Saved — in your tracker' : '☆ Save & track the deadlines'}</button>
            <button class="btn btn-ghost btn-sm" data-act="ics" data-id="${o.id}">⬇ Download .ics</button>
            <button class="btn btn-quiet btn-sm" data-act="dismiss" data-id="${o.id}">Not for me</button>
          </div>
          <p class="tiny muted" style="margin:.9rem 0 0">Grapevine will never register, pay, submit or book on your behalf. Those are hard stops, not settings.</p>
        </div>

        <div class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">✅</span> Can you apply?</h3>${conf(o.confidence.eligibility)}</div>
          <p class="small" style="margin:0 0 .7rem">${o.eligibility_notes}</p>
          <dl class="kv">
            <dt>Career stage</dt><dd>${o.eligibility.career_stage.includes(state.profile.career_stage) ? 'Accepted' : 'Not listed'}</dd>
            <dt>Membership</dt><dd>${o.eligibility.membership_required ? 'Required' : 'Not required'}</dd>
            <dt>Nationality</dt><dd>${o.eligibility.nationality ?? 'No restriction'}</dd>
          </dl>
          ${o.eligibility.notes ? `<p class="tiny muted" style="margin:.7rem 0 0">${o.eligibility.notes}</p>` : ''}
        </div>

        <div class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🛂</span> Visa</h3>${conf('advisory')}</div>
          <div class="callout ${o.visa.required === 'yes' ? '' : 'danger'}" style="${o.visa.required === 'no' ? 'border-left-color:var(--vine);background:var(--vine-soft)' : ''}">
            <h4>${o.visa.required === 'yes' ? '⚠️ A visa is required' : o.visa.required === 'no' ? '✓ No visa required' : '❓ Depends on your circumstances'}</h4>
            <p>${o.visa.note}</p>
            ${o.visa.official_source ? `<p><a href="${o.visa.official_source}" target="_blank" rel="noopener noreferrer">Official source ↗</a></p>` : ''}
          </div>
          ${o.visa.verify_flag ? '<p class="tiny muted" style="margin:.7rem 0 0">This is advisory only and may be out of date. Grapevine does not give immigration advice — confirm everything against the official source before you act on it.</p>' : ''}
        </div>

        <div class="panel">
          <div class="panel-h"><h3><span class="ico" aria-hidden="true">🔍</span> How much to trust this</h3></div>
          <dl class="kv">
            <dt>Deadlines</dt><dd>${conf(o.confidence.dates)}</dd>
            <dt>Fees</dt><dd>${conf(o.confidence.fees)}</dd>
            <dt>Cost estimate</dt><dd>${conf(o.confidence.cost)}</dd>
            <dt>Visa</dt><dd>${conf(o.confidence.visa)}</dd>
          </dl>
          <p class="tiny muted" style="margin:.8rem 0 0">Every high-stakes field was re-checked against the source text by a second model. Anything it could not ground was downgraded to “inferred” rather than dropped.</p>
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
            <div class="track-what">${DEADLINE_LABEL[d.label]} ${d.grounded ? '' : conf('inferred')}</div>
            <div class="track-sub"><a href="#/brief/${d.opp.id}">${d.opp.title}</a></div>
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
      const hit = o.fit.matched_topics.filter((t) => p.topics.some((x) => x.term === t));
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
      effect = `Cost ceiling ${money(was)} → ${money(p.constraints.max_cost)}.`;
      break;
    }
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
      effect = 'Visa appetite set to “prefer visa-free”; destinations needing one now rank lower.';
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
    case 'skip': pipeTimers.forEach(clearTimeout); location.hash = '#/feed'; break;
    case 'reonboard': draft = structuredClone(state.profile); draft.__bootstrapped = true; onbStep = 1; break;
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
