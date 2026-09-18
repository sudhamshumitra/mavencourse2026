/**
 * Grapevine prototype — fixture data.
 *
 * ILLUSTRATIVE ONLY. Nothing here was fetched live. Venues, deadlines, fees and
 * visa notes are plausible composites written by hand so the whole user flow can
 * be exercised without a backend. In the real product these values come from the
 * Extraction Workers and the Verification Judge (PRD §7).
 *
 * Persona: Rafael Duarte Lima — oral historian of housing-rights movements in Rio.
 * Demo spine: IOHA 2027 in Chicago. Chosen because one case exercises everything —
 * semantic fit with zero keyword overlap, a Global-South fee tier, a bursary that
 * depends on acceptance, USD costs rendered in BRL, and a hard US visa fork.
 */

export const TODAY = new Date('2026-09-13T00:00:00Z');

export const FX = { USD: 5.42, EUR: 5.88, GBP: 6.95, MXN: 0.29, PLN: 1.36, CAD: 3.94 };

export const profile = {
  id: 'p_rafael',
  name: 'Rafael Duarte Lima',
  orcid: '0000-0003-1847-2206',
  affiliation: 'PPG em História Social, Universidade Federal do Rio de Janeiro',
  career_stage: 'phd',
  year: 3,
  research_summary:
    'Oral history and memory of housing-rights movements in Rio de Janeiro — fieldwork in Vila Autódromo and Complexo da Maré, working with residents\' own recordings alongside his own.',
  topics: [
    { term: 'oral history', weight: 0.95 },
    { term: 'urban memory', weight: 0.9 },
    { term: 'housing rights & displacement', weight: 0.88 },
    { term: 'favelas & informal urbanism', weight: 0.8 },
    { term: 'Latin American social movements', weight: 0.65 },
    { term: 'community archives', weight: 0.55 },
  ],
  citation_neighborhood: [
    'Alessandro Portelli',
    'Ana Maria Mauad',
    'Teresa Caldeira',
    'Mariana Cavalcanti',
    'Michael Frisch',
  ],
  geography: { country: 'Brazil', city: 'Rio de Janeiro', passport: 'Brazil' },
  currency: 'BRL',
  constraints: {
    max_cost: 12000,
    months_available: ['Jan', 'Feb', 'Jun', 'Jul', 'Dec'],
    visa_tolerance: 'any',
    format: 'any',
  },
  profile_type: 'academic',
};

/** Steps shown in the "agent at work" animation. Mirrors PRD §6. */
export const pipeline = [
  { label: 'Curated Querier', detail: 'OpenAlex · H-Net · 14 society sites', ms: 900 },
  { label: 'Bounded Explorer', detail: 'capped web-search pass — 6 of 8 steps used', ms: 1100 },
  { label: 'Extraction Workers ×27', detail: 'one call page each, context-starved', ms: 1200 },
  { label: 'Eligibility Filter', detail: 'career stage · nationality · membership', ms: 700 },
  { label: 'Matcher / Ranker', detail: 'topic + citation-neighbourhood overlap', ms: 900 },
  { label: 'Verification Judge', detail: 'grounding every deadline and fee', ms: 800 },
];

export const opportunities = [
  {
    id: 'ioha-2027',
    type: 'conference',
    title: 'IOHA 2027 — Inheritance',
    host: 'International Oral History Association',
    theme: 'Inheritance',
    tagline: 'Shares no keywords with your work. It is still the best venue for it that exists.',
    description:
      'The XXV International Oral History Conference. IOHA is the field\'s flagship, meeting every two years, and the 2027 theme asks what gets handed down — testimony, property, obligation, silence — and who is entitled to receive it. Submissions are 500-word abstracts for individual papers, panels or listening sessions. Portuguese and Spanish are working languages alongside English.',
    location: { city: 'Chicago', country: 'United States', format: 'hybrid' },
    dates: { start: '2027-06-22', end: '2027-06-25' },
    deadlines: [
      {
        label: 'abstract',
        date: '2026-11-13',
        depends_on: null,
        grounded: true,
        source_quote: 'Abstracts of up to 500 words must be submitted by 13 November 2026, 23:59 AoE.',
      },
      {
        label: 'scholarship',
        date: '2027-02-20',
        depends_on: 'abstract',
        grounded: true,
        source_quote:
          'The IOHA Travel Bursary opens to accepted presenters when decisions are released in January and closes 20 February 2027.',
      },
      {
        label: 'early_bird',
        date: '2027-04-09',
        depends_on: null,
        grounded: true,
        source_quote: 'Early-bird registration closes 9 April 2027.',
      },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent'],
      nationality: null,
      region_restriction: null,
      membership_required: true,
      notes:
        'Presenting authors must hold current IOHA membership (student rate USD 40). Membership can be taken out after acceptance.',
    },
    fees: [
      { tier: 'Student / Global South', amount: 190, currency: 'USD', grounded: true, source_quote: 'Student and Global South registration: USD 190.' },
      { tier: 'Standard', amount: 430, currency: 'USD', grounded: true, source_quote: 'Standard registration: USD 430.' },
      { tier: 'Online only', amount: 75, currency: 'USD', grounded: true, source_quote: 'Virtual attendance: USD 75.' },
    ],
    funding: [
      {
        name: 'IOHA Travel Bursary',
        type: 'travel_scholarship',
        deadline: '2027-02-20',
        amount_note: 'up to USD 900',
        eligibility_notes:
          'Open to doctoral researchers and scholars at Global South institutions holding an accepted submission. Requires the acceptance letter, so it cannot be applied for before late January.',
        source_url: 'https://ioha.org/bursaries/',
        eligible: true,
      },
      {
        name: 'First-time presenter registration waiver',
        type: 'waiver',
        deadline: '2027-03-15',
        amount_note: 'full registration waiver',
        eligibility_notes: 'For presenters who have not previously presented at an IOHA conference. Six awarded per edition.',
        source_url: 'https://ioha.org/bursaries/',
        eligible: true,
      },
    ],
    past_editions: [
      {
        year: 2024,
        theme: 'Memorias en movimiento',
        representative_papers: [
          'Testemunho e remoção: as gravações dos moradores da Vila Autódromo',
          'Listening to eviction: sound archives of the Buenos Aires villas',
          'Whose tape is it? Shared authority in community housing archives',
        ],
        source_url: 'https://ioha.org/2024/',
      },
      {
        year: 2022,
        theme: 'Harmony and Dissonance',
        representative_papers: ['Oral history after mass displacement', 'The interview as inheritance'],
        source_url: 'https://ioha.org/2022/',
      },
    ],
    source_url: 'https://ioha.org/2027/call-for-papers/',
    extracted_at: '2026-09-12T04:11:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.94,
      rationale:
        'A keyword search would never have shown you this. "Inheritance" has nothing in common with "favela housing movements" on the surface — and it is a description of your thesis. What you study is what residents pass down when the thing itself is taken: recordings, claims, grievances. Three of the five scholars in your citation neighbourhood presented at IOHA 2024, and that programme already included a paper on the Vila Autódromo resident recordings you work with.',
      matched_topics: ['oral history', 'urban memory', 'housing rights & displacement', 'community archives'],
      neighborhood_evidence: [
        'Alessandro Portelli — keynote, IOHA 2024',
        'Ana Maria Mauad — IOHA 2024 programme committee',
        'Michael Frisch — roundtable on shared authority, IOHA 2022',
      ],
      why_semantic: 'Title–keyword overlap with your profile is 0. Semantic overlap is 0.91.',
    },
    eligible: 'yes',
    eligibility_notes:
      'You meet the career-stage requirement. Membership is required to present but can be purchased after acceptance — it is not a barrier to submitting.',
    cost_estimate: {
      currency: 'BRL',
      low: 9425,
      high: 13625,
      breakdown: {
        registration: { low: 1026, high: 1026, note: 'Student / Global South tier, USD 190' },
        travel: { low: 4800, high: 7200, note: 'GIG–ORD return, booked 8–10 weeks ahead' },
        accommodation: { low: 2600, high: 4400, note: '4 nights, hostel to mid-range hotel' },
        visa: { low: 999, high: 999, note: 'US B1/B2 — MRV fee USD 185' },
      },
      assumptions: [
        'Return economy airfare from Rio, booked 8–10 weeks in advance',
        'Four nights accommodation; the conference hotel rate is not yet published',
        'USD→BRL at R$5.42; rate fixed 12 Sep 2026 and will move',
        'Excludes IOHA membership (USD 40 / R$217), meals and local transport',
      ],
      net_note:
        'The high end is above your R$12.000 ceiling. With the travel bursary (up to USD 900 / R$4.878) realistic out-of-pocket lands near R$4.500–R$8.700.',
    },
    visa: {
      required: 'yes',
      note:
        'A Brazilian passport needs a B1/B2 visitor visa for the United States, and this is the binding constraint on the whole trip — not the abstract. Interview appointment waits at the Rio de Janeiro consulate have recently run past six months, which is longer than the gap between the acceptance decision in January and the conference in June. Start the DS-160 and book an interview slot now, before you know whether the abstract is accepted. The fee is lost if you do not go; the trip is lost if you wait.',
      official_source: 'https://br.usembassy.gov/visas/',
      verify_flag: true,
    },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'ohr-listening-city',
    type: 'journal_call',
    title: 'Special Issue — Listening to the City',
    host: 'Oral History Review',
    theme: 'Oral history and the contested urban landscape',
    tagline: 'The field journal, asking for exactly the article you are sitting on.',
    description:
      'The editors invite articles on oral history practice in cities undergoing displacement, redevelopment or erasure, with an explicit interest in work where residents are co-producers of the archive rather than subjects of it. Articles run 6,000–9,000 words; the issue also carries a shorter "practice note" format.',
    location: { city: '—', country: '—', format: 'online' },
    dates: { start: null, end: null },
    deadlines: [
      {
        label: 'full_paper',
        date: '2026-12-15',
        depends_on: null,
        grounded: true,
        source_quote: 'Complete manuscripts are due 15 December 2026.',
      },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent'],
      nationality: null,
      region_restriction: null,
      membership_required: false,
      notes: 'Open call. Doctoral researchers and community practitioners explicitly encouraged.',
    },
    fees: [{ tier: 'Submission', amount: 0, currency: 'USD', grounded: true, source_quote: 'There is no submission fee.' }],
    funding: [],
    past_editions: [
      {
        year: 2025,
        theme: 'Oral history and repair',
        representative_papers: ['The tape recorder at the eviction', 'Shared authority twenty years on'],
        source_url: 'https://oralhistoryreview.org/',
      },
    ],
    source_url: 'https://oralhistoryreview.org/cfp/listening-to-the-city',
    extracted_at: '2026-09-12T04:12:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.9,
      rationale:
        'Direct overlap on four of your six weighted topics, in the journal of record for your method. The "practice note" format is worth noting: it is short, it suits the collaborative-archive material specifically, and it is a realistic thing to write in thirteen weeks alongside the IOHA abstract rather than instead of it.',
      matched_topics: ['oral history', 'urban memory', 'housing rights & displacement', 'community archives'],
      neighborhood_evidence: ['Michael Frisch and Ana Maria Mauad have both published here since 2023'],
      why_semantic: 'Keyword and semantic overlap agree here — this one you would probably have found yourself.',
    },
    eligible: 'yes',
    eligibility_notes: 'No restrictions that apply to you.',
    cost_estimate: {
      currency: 'BRL',
      low: 0,
      high: 0,
      breakdown: {
        registration: { low: 0, high: 0, note: 'Subscription journal — no article processing charge for standard publication' },
      },
      assumptions: ['Assumes standard (non–open access) publication. Optional OA would carry a separate APC.'],
      net_note: 'No money. The cost here is thirteen weeks of your writing time, in the same window as the IOHA abstract.',
    },
    visa: { required: 'no', note: 'Not applicable — publication, no travel.', official_source: null, verify_flag: false },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'juh-displacement',
    type: 'journal_call',
    title: 'Special Issue — Displacement and the Archive',
    host: 'Journal of Urban History (SAGE)',
    theme: 'What survives removal',
    tagline: 'Broader readership than the field journals. Watch the open-access charge.',
    description:
      'A two-stage special issue on the documentary afterlife of urban removal — what records survive, who holds them, and how historians should read archives produced by the removing authority alongside those produced by the removed. Abstracts of 500 words first; full papers invited from that pool.',
    location: { city: '—', country: '—', format: 'online' },
    dates: { start: null, end: null },
    deadlines: [
      { label: 'abstract', date: '2026-10-20', depends_on: null, grounded: true, source_quote: 'Abstracts of 500 words due 20 October 2026.' },
      { label: 'full_paper', date: '2027-03-01', depends_on: 'abstract', grounded: true, source_quote: 'Invited full papers due 1 March 2027.' },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent'],
      nationality: null,
      region_restriction: null,
      membership_required: false,
      notes: 'Open call.',
    },
    fees: [
      { tier: 'Standard publication', amount: 0, currency: 'USD', grounded: true, source_quote: 'There is no charge for standard publication.' },
      { tier: 'Optional open access (APC)', amount: 3000, currency: 'USD', grounded: true, source_quote: 'Authors choosing open access pay an APC of USD 3,000.' },
    ],
    funding: [
      {
        name: 'SAGE APC waiver (author-country based)',
        type: 'waiver',
        deadline: null,
        amount_note: 'full or partial waiver',
        eligibility_notes:
          'SAGE operates a country-band waiver scheme for open-access charges. Brazil sits in the discounted band; full waivers are decided case by case at acceptance.',
        source_url: 'https://us.sagepub.com/open-access-agreements',
        eligible: true,
      },
    ],
    past_editions: [],
    source_url: 'https://journals.sagepub.com/cfp/juh-displacement-archive',
    extracted_at: '2026-09-12T04:12:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.86,
      rationale:
        'Strong topical match, and the fastest-moving deadline in your feed — thirty-seven days. The two-stage structure is the reason to take it seriously: a 500-word abstract is cheap, and it buys you until March for the full paper, which sequences after the Oral History Review deadline rather than colliding with it. Weighted slightly below OHR because this readership is urban history, not oral history, so the method chapter would need reframing as evidence rather than as practice.',
      matched_topics: ['urban memory', 'housing rights & displacement', 'favelas & informal urbanism', 'community archives'],
      neighborhood_evidence: ['Teresa Caldeira is on the editorial board'],
      why_semantic: 'Semantic overlap 0.84.',
    },
    eligible: 'yes',
    eligibility_notes: 'No restrictions that apply to you.',
    cost_estimate: {
      currency: 'BRL',
      low: 0,
      high: 16260,
      breakdown: {
        registration: { low: 0, high: 16260, note: 'R$0 for standard publication; USD 3,000 only if you choose open access' },
      },
      assumptions: [
        'The low figure is the default path — standard publication is free',
        'The high figure assumes you choose open access and receive no waiver, which is the worst realistic case',
        'Waivers are decided at acceptance, not at submission, so this number is unknown until late',
      ],
      net_note: 'Check whether UFRJ holds a SAGE read-and-publish agreement before assuming the high figure.',
    },
    visa: { required: 'no', note: 'Not applicable — publication, no travel.', official_source: null, verify_flag: false },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'inferred' },
  },

  {
    id: 'rc21-2027',
    type: 'conference',
    title: 'RC21 2027 — Sediment',
    host: 'ISA Research Committee 21, Sociology of Urban and Regional Development',
    theme: 'Sediment',
    tagline: 'Cheapest serious international option in your feed, and no visa at all.',
    description:
      'RC21\'s annual conference, organised into member-proposed sessions rather than a central programme. Smaller and more argumentative than the large associations, with a long-standing Latin American presence and sessions regularly devoted to informal settlement and displacement.',
    location: { city: 'Mexico City', country: 'Mexico', format: 'in_person' },
    dates: { start: '2027-07-07', end: '2027-07-09' },
    deadlines: [
      { label: 'abstract', date: '2027-01-25', depends_on: null, grounded: true, source_quote: 'Abstracts to individual sessions close 25 January 2027.' },
      { label: 'early_bird', date: '2027-04-30', depends_on: null, grounded: true, source_quote: 'Early registration ends 30 April 2027.' },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent'],
      nationality: null,
      region_restriction: null,
      membership_required: false,
      notes: 'No membership requirement for presenters.',
    },
    fees: [
      { tier: 'Student, Category B country', amount: 120, currency: 'USD', grounded: true, source_quote: 'Student registration, Category B: USD 120.' },
      { tier: 'Standard', amount: 280, currency: 'USD', grounded: true, source_quote: 'Standard registration: USD 280.' },
    ],
    funding: [],
    past_editions: [
      {
        year: 2026,
        theme: 'Ground Rent',
        representative_papers: ['Removal and the archive in São Paulo', 'Informality as method'],
        source_url: 'https://rc21.org/2026',
      },
    ],
    source_url: 'https://rc21.org/2027/cfp',
    extracted_at: '2026-09-12T04:14:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.82,
      rationale:
        'A real home for the urban half of your work, in July, which you listed as available. Two things make it unusually easy: Brazilian passports enter Mexico without a visa, so the whole consular question disappears, and the total cost sits comfortably inside your ceiling even without funding. The trade-off is audience — this room reads you as a sociologist of housing, not as an oral historian, so the method would be background rather than argument.',
      matched_topics: ['housing rights & displacement', 'favelas & informal urbanism', 'Latin American social movements', 'urban memory'],
      neighborhood_evidence: ['Teresa Caldeira and Mariana Cavalcanti have both presented at RC21 since 2023'],
      why_semantic: 'Semantic overlap 0.80.',
    },
    eligible: 'yes',
    eligibility_notes: 'No restrictions that apply to you.',
    cost_estimate: {
      currency: 'BRL',
      low: 6350,
      high: 9450,
      breakdown: {
        registration: { low: 650, high: 650, note: 'Student Category B, USD 120' },
        travel: { low: 3900, high: 5800, note: 'GIG–MEX return, one stop' },
        accommodation: { low: 1800, high: 3000, note: '3 nights' },
        visa: { low: 0, high: 0, note: 'None — Brazilian passports are visa-exempt for Mexico' },
      },
      assumptions: ['USD→BRL at R$5.42', 'Three nights accommodation in the conference district'],
      net_note: 'Fits inside your R$12.000 ceiling at the high end with room to spare, and needs no consular appointment.',
    },
    visa: {
      required: 'no',
      note:
        'Brazilian passport holders do not need a visa for tourism or conference attendance in Mexico for stays under 180 days. You will still need to complete the online FMM entry form before travel. Confirm before booking — exemptions change.',
      official_source: 'https://www.gob.mx/inm',
      verify_flag: true,
    },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'msa-2027',
    type: 'conference',
    title: 'Memory Studies Association 2027',
    host: 'Memory Studies Association',
    theme: 'Contested Ground',
    tagline: 'Interdisciplinary, large, and Schengen means no visa for you.',
    description:
      'The MSA annual conference draws historians, anthropologists, curators and artists working on memory in all its forms. Large parallel-stream format with a strong memorial-site and heritage contingent.',
    location: { city: 'Warsaw', country: 'Poland', format: 'hybrid' },
    dates: { start: '2027-07-05', end: '2027-07-08' },
    deadlines: [
      { label: 'abstract', date: '2026-12-04', depends_on: null, grounded: true, source_quote: 'Abstract submission closes 4 December 2026.' },
      { label: 'early_bird', date: '2027-04-15', depends_on: null, grounded: false, source_quote: null },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent'],
      nationality: null,
      region_restriction: null,
      membership_required: true,
      notes: 'MSA membership required to present (student rate EUR 25).',
    },
    fees: [
      { tier: 'Student', amount: 160, currency: 'EUR', grounded: true, source_quote: 'Student registration EUR 160.' },
      { tier: 'Standard', amount: 320, currency: 'EUR', grounded: true, source_quote: 'Standard registration EUR 320.' },
    ],
    funding: [
      {
        name: 'MSA Global South delegate support',
        type: 'bursary',
        deadline: '2027-03-01',
        amount_note: 'registration waiver + EUR 350',
        eligibility_notes: 'Requires an accepted abstract and an institutional affiliation outside Europe and North America.',
        source_url: 'https://memorystudiesassociation.org/support',
        eligible: true,
      },
    ],
    past_editions: [
      { year: 2026, theme: 'Afterlives', representative_papers: ['Monuments and their removal', 'Memory work in the postcolonial city'], source_url: 'https://memorystudiesassociation.org/2026' },
    ],
    source_url: 'https://memorystudiesassociation.org/2027/cfp',
    extracted_at: '2026-09-12T04:15:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.8,
      rationale:
        'Genuinely close on memory and contested space, and — unusually for a European conference — you need no visa, since Brazilian passports enter the Schengen area without one. It clashes directly with RC21: both fall in the first week of July 2027, two days apart on different continents. Treat these two as alternatives rather than a plan.',
      matched_topics: ['urban memory', 'oral history', 'housing rights & displacement'],
      neighborhood_evidence: ['Ana Maria Mauad presented at MSA 2026'],
      why_semantic: 'Semantic overlap 0.79.',
    },
    eligible: 'yes',
    eligibility_notes: 'Membership required to present; EUR 25 student rate, payable after acceptance.',
    cost_estimate: {
      currency: 'BRL',
      low: 8541,
      high: 12741,
      breakdown: {
        registration: { low: 941, high: 941, note: 'Student tier, EUR 160' },
        travel: { low: 5400, high: 8200, note: 'GIG–WAW return, one stop, July peak' },
        accommodation: { low: 2200, high: 3600, note: '4 nights' },
        visa: { low: 0, high: 0, note: 'None — Brazil holds Schengen visa exemption for short stays' },
      },
      assumptions: ['EUR→BRL at R$5.88', 'July is peak season on European routes; fares are volatile'],
      net_note: 'Slightly over your ceiling at the high end. The Global South bursary (waiver + EUR 350) would bring it to roughly R$5.500–R$9.700.',
    },
    visa: {
      required: 'no',
      note:
        'Brazilian passport holders may enter the Schengen area visa-free for up to 90 days in any 180-day period. Note that the EU\'s ETIAS travel authorisation is expected to become mandatory during 2027 — it is an online form, not a visa, but check before booking.',
      official_source: 'https://travel-europe.europa.eu/etias_en',
      verify_flag: true,
    },
    confidence: { dates: 'inferred', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'coimbra-school',
    type: 'fellowship',
    title: 'Summer School in Oral History & Digital Archives',
    host: 'Universidade de Coimbra, Centro de Estudos Sociais',
    theme: 'Method, not results',
    tagline: 'Five days on your own tapes, in Portuguese, with the fee waived.',
    description:
      'An intensive residential school capped at twenty doctoral participants, covering interview method, consent and rights in community recordings, and description standards for digital audio archives. Participants workshop their own material rather than present finished work. Taught in Portuguese and English.',
    location: { city: 'Coimbra', country: 'Portugal', format: 'in_person' },
    dates: { start: '2027-07-12', end: '2027-07-16' },
    deadlines: [
      { label: 'abstract', date: '2027-03-10', depends_on: null, grounded: true, source_quote: 'Applications, including a 1,000-word statement, close 10 March 2027.' },
      { label: 'scholarship', date: '2027-03-10', depends_on: null, grounded: true, source_quote: 'Bursary applications are submitted together with the main application.' },
    ],
    eligibility: {
      career_stage: ['phd'],
      nationality: null,
      region_restriction: null,
      membership_required: false,
      notes: 'Doctoral candidates only, past their first year.',
    },
    fees: [{ tier: 'Participation (incl. accommodation)', amount: 380, currency: 'EUR', grounded: true, source_quote: 'Fee EUR 380, including accommodation and lunches.' }],
    funding: [
      {
        name: 'Bolsa para candidatos latino-americanos',
        type: 'bursary',
        deadline: '2027-03-10',
        amount_note: 'full fee waiver + EUR 500 travel',
        eligibility_notes: 'Five bursaries reserved for doctoral candidates at Latin American institutions. Decided with the admission decision.',
        source_url: 'https://ces.uc.pt/escolaverao',
        eligible: true,
      },
    ],
    past_editions: [
      { year: 2026, theme: 'Consentimento e arquivo', representative_papers: [], source_url: 'https://ces.uc.pt/escolaverao/2026' },
    ],
    source_url: 'https://ces.uc.pt/escolaverao/2027',
    extracted_at: '2026-09-12T04:16:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.74,
      rationale:
        'Not a publication venue, so it does not build your record the way a paper does — that is the whole reason it scores below the conferences. What it does instead: twenty people, five days, and direct supervision on the rights-and-consent problem in the residents\' own recordings, which is the unresolved part of your method chapter. Taught partly in Portuguese, no visa, and free if the bursary lands. It also falls in the same July week as RC21 and MSA, so all three are competing for one slot.',
      matched_topics: ['oral history', 'community archives'],
      neighborhood_evidence: ['Two of the teaching faculty overlap with your citation neighbourhood'],
      why_semantic: 'Semantic overlap 0.76, weighted down for CV value.',
    },
    eligible: 'yes',
    eligibility_notes: 'Doctoral-only, past first year — you qualify in your third year.',
    cost_estimate: {
      currency: 'BRL',
      low: 6434,
      high: 8534,
      breakdown: {
        registration: { low: 2234, high: 2234, note: 'EUR 380, accommodation and lunches included' },
        travel: { low: 4200, high: 6300, note: 'GIG–LIS return plus rail to Coimbra' },
        visa: { low: 0, high: 0, note: 'None — Schengen visa exemption' },
      },
      assumptions: ['Accommodation is covered by the fee', 'EUR→BRL at R$5.88'],
      net_note: 'With the Latin American bursary (waiver + EUR 500) the net cost is close to zero.',
    },
    visa: {
      required: 'no',
      note:
        'No visa for a Brazilian passport for a five-day stay. ETIAS authorisation is expected to apply from 2027 — an online form, not a visa.',
      official_source: 'https://travel-europe.europa.eu/etias_en',
      verify_flag: true,
    },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'lasa-2027',
    type: 'conference',
    title: 'LASA 2027 Congress',
    host: 'Latin American Studies Association',
    theme: 'Territorios en Disputa',
    tagline: 'Sixteen days to the deadline — and it falls in a month you said you cannot travel.',
    description:
      'The largest gathering of Latin Americanists, spanning some fifty tracks. Proposals are submitted to a track; individual papers are accepted but panels have a markedly better acceptance rate.',
    location: { city: 'Bogotá', country: 'Colombia', format: 'in_person' },
    dates: { start: '2027-05-26', end: '2027-05-29' },
    deadlines: [
      { label: 'abstract', date: '2026-09-29', depends_on: null, grounded: true, source_quote: 'Proposals close 29 September 2026.' },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent'],
      nationality: null,
      region_restriction: null,
      membership_required: true,
      notes: 'LASA membership required to submit (student rate, Band B: USD 45).',
    },
    fees: [
      { tier: 'Student member, Band B', amount: 85, currency: 'USD', grounded: true, source_quote: 'Student registration, Band B: USD 85.' },
      { tier: 'Standard', amount: 230, currency: 'USD', grounded: true, source_quote: 'Standard registration: USD 230.' },
    ],
    funding: [
      {
        name: 'LASA Travel Grant',
        type: 'travel_scholarship',
        deadline: '2026-09-29',
        amount_note: 'up to USD 700',
        eligibility_notes:
          'Applied for at the same time as the proposal, not after acceptance. Priority to students at Latin American institutions.',
        source_url: 'https://lasaweb.org/travel-grants',
        eligible: true,
      },
    ],
    past_editions: [
      { year: 2026, theme: 'Resistencias', representative_papers: ['Memoria y remoção no Rio pós-olímpico'], source_url: 'https://lasaweb.org/2026' },
    ],
    source_url: 'https://lasaweb.org/2027/cfp',
    extracted_at: '2026-09-12T04:17:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.78,
      rationale:
        'Topically close and cheap — no visa for Colombia, short flight, low fees. Marked conditional for one reason: May is not among the months you said you can travel, and a fifty-track congress is a lot of money and time for an audience you cannot choose. The deadline is in sixteen days, and it takes the travel grant with it, so this is decide-this-week or drop it.',
      matched_topics: ['Latin American social movements', 'housing rights & displacement', 'urban memory'],
      neighborhood_evidence: ['Mariana Cavalcanti presented at LASA 2026'],
      why_semantic: 'Semantic overlap 0.77, downweighted for timing.',
    },
    eligible: 'conditional',
    eligibility_notes:
      'Eligible on career stage and membership, but May falls outside the months you marked available. Flagged rather than filtered out, because you can change that.',
    cost_estimate: {
      currency: 'BRL',
      low: 4660,
      high: 7360,
      breakdown: {
        registration: { low: 460, high: 460, note: 'Student member Band B, USD 85' },
        travel: { low: 2600, high: 4100, note: 'GIG–BOG return, direct available' },
        accommodation: { low: 1600, high: 2800, note: '4 nights' },
        visa: { low: 0, high: 0, note: 'None — Brazilian passports are visa-exempt for Colombia' },
      },
      assumptions: ['USD→BRL at R$5.42', 'Excludes LASA membership (USD 45 / R$244)'],
      net_note: 'The cheapest international conference in your feed. The constraint is the calendar, not the money.',
    },
    visa: {
      required: 'no',
      note: 'Brazilian passport holders do not need a visa for short stays in Colombia. Proof of onward travel may be requested at the border.',
      official_source: 'https://www.cancilleria.gov.co/en/procedures_services/visa',
      verify_flag: true,
    },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'anpuh-2027',
    type: 'conference',
    title: 'XXXIV Simpósio Nacional de História',
    host: 'ANPUH — Associação Nacional de História',
    theme: 'História e Direito à Cidade',
    tagline: 'R$1.780. No flights, no consulate, no currency risk.',
    description:
      'The biennial national congress of Brazilian historians, organised into symposia proposed by members. The oral-history and urban-history symposia are long-running and well attended.',
    location: { city: 'Belo Horizonte', country: 'Brazil', format: 'in_person' },
    dates: { start: '2027-07-19', end: '2027-07-23' },
    deadlines: [
      { label: 'abstract', date: '2027-02-27', depends_on: null, grounded: true, source_quote: 'Resumos para os simpósios temáticos até 27 de fevereiro de 2027.' },
      { label: 'early_bird', date: '2027-05-20', depends_on: null, grounded: true, source_quote: 'Inscrições com desconto até 20 de maio de 2027.' },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent', 'other'],
      nationality: null,
      region_restriction: null,
      membership_required: true,
      notes: 'ANPUH membership required (student rate R$90).',
    },
    fees: [{ tier: 'Estudante de pós-graduação', amount: 180, currency: 'BRL', grounded: true, source_quote: 'Inscrição para estudantes de pós-graduação: R$180.' }],
    funding: [],
    past_editions: [
      { year: 2025, theme: 'História e Democracia', representative_papers: ['Memória das remoções olímpicas'], source_url: 'https://anpuh.org.br/2025' },
    ],
    source_url: 'https://anpuh.org.br/2027/chamada',
    extracted_at: '2026-09-12T04:18:00Z',
    predatory_flag: false,
    explore: false,
    fit: {
      score: 0.7,
      rationale:
        'The right audience nationally and by far the cheapest thing in your feed — no airfare, no consulate, no exchange-rate exposure. It scores below the international venues on reach rather than on fit: this room already knows the Vila Autódromo case, which makes for a better conversation and a smaller one. Worth doing precisely because it costs almost nothing to add.',
      matched_topics: ['oral history', 'urban memory', 'favelas & informal urbanism', 'housing rights & displacement'],
      neighborhood_evidence: ['Ana Maria Mauad is a past ANPUH symposium coordinator'],
      why_semantic: 'Semantic overlap 0.83, weighted down for international visibility.',
    },
    eligible: 'yes',
    eligibility_notes: 'Membership required; R$90 student rate.',
    cost_estimate: {
      currency: 'BRL',
      low: 1780,
      high: 2980,
      breakdown: {
        registration: { low: 180, high: 180, note: 'Postgraduate student rate' },
        travel: { low: 700, high: 1200, note: 'Rio–Belo Horizonte return, bus or budget flight' },
        accommodation: { low: 900, high: 1600, note: '5 nights' },
        visa: { low: 0, high: 0, note: 'Domestic' },
      },
      assumptions: ['Excludes ANPUH membership (R$90)', 'Assumes shared or budget accommodation'],
      net_note: 'Under 15% of your ceiling. This is the one you can do regardless of what else happens.',
    },
    visa: { required: 'no', note: 'Domestic travel — not applicable.', official_source: null, verify_flag: false },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'sah-2027',
    type: 'conference',
    title: 'SAH 2027 — Society of Architectural Historians',
    host: 'Society of Architectural Historians',
    theme: 'Annual International Conference',
    tagline: 'Outside your field. That is exactly why it is here.',
    description:
      'The annual meeting of the principal architectural-history association, organised into sessions proposed by members. Several sessions each year deal with informal settlement, self-built housing and the documentation of buildings that no longer stand.',
    location: { city: 'Montréal', country: 'Canada', format: 'in_person' },
    dates: { start: '2027-04-14', end: '2027-04-18' },
    deadlines: [
      { label: 'abstract', date: '2026-10-05', depends_on: null, grounded: true, source_quote: 'Session paper abstracts are due 5 October 2026.' },
    ],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent'],
      nationality: null,
      region_restriction: null,
      membership_required: true,
      notes: 'SAH membership required to present (student rate USD 45).',
    },
    fees: [{ tier: 'Student member', amount: 165, currency: 'USD', grounded: true, source_quote: 'Student member registration: USD 165.' }],
    funding: [
      {
        name: 'SAH Annual Conference Fellowship',
        type: 'travel_scholarship',
        deadline: '2026-11-15',
        amount_note: 'up to USD 1,000',
        eligibility_notes: 'Graduate students presenting at the conference; applications open before acceptances are issued.',
        source_url: 'https://sah.org/fellowships',
        eligible: true,
      },
    ],
    past_editions: [
      { year: 2026, theme: '—', representative_papers: ['Drawing the demolished: reconstructing vanished housing'], source_url: 'https://sah.org/2026' },
    ],
    source_url: 'https://sah.org/2027/cfp',
    extracted_at: '2026-09-12T04:19:00Z',
    predatory_flag: false,
    explore: true,
    explore_reason:
      'Shown because it sits outside the history-and-sociology cluster you normally read. Architectural historians work on exactly your buildings and almost never cite your literature — which is either a gap in your bibliography or a room that will argue with you productively.',
    fit: {
      score: 0.56,
      rationale:
        'Low topical overlap, deliberately. Your work would be legible here through the documentation-of-demolished-housing sessions, which would mean writing the abstract around the buildings rather than around the interviews. The upside is a set of readers who have never encountered this case. The downsides are real: April is not in your available months, and the abstract is due in twenty-two days.',
      matched_topics: ['favelas & informal urbanism', 'urban memory'],
      neighborhood_evidence: ['No overlap with your citation neighbourhood — which is the point'],
      why_semantic: 'Semantic overlap 0.58 — surfaced by the exploration slot, not the ranker.',
    },
    eligible: 'conditional',
    eligibility_notes: 'Eligible on career stage and membership, but April falls outside the months you marked available.',
    cost_estimate: {
      currency: 'BRL',
      low: 9034,
      high: 13134,
      breakdown: {
        registration: { low: 894, high: 894, note: 'Student member, USD 165' },
        travel: { low: 5200, high: 7800, note: 'GIG–YUL return, one stop' },
        accommodation: { low: 2400, high: 3900, note: '4 nights' },
        visa: { low: 540, high: 540, note: 'Canadian visitor visa, CAD 100 application + biometrics' },
      },
      assumptions: ['USD→BRL at R$5.42, CAD→BRL at R$3.94', 'Excludes SAH membership (USD 45 / R$244)'],
      net_note: 'Above your ceiling at the high end, before the fellowship.',
    },
    visa: {
      required: 'yes',
      note:
        'Brazilian passport holders need a full visitor visa for Canada — unless they have held a US non-immigrant visa in the previous ten years, in which case the much lighter eTA applies. You do not hold one today, so for an April 2027 conference this is the full visa route, with biometrics. Worth knowing for later: if the US visa for IOHA comes through in early 2027, every future Canadian trip drops to an eTA.',
      official_source: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html',
      verify_flag: true,
    },
    confidence: { dates: 'verified', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'verified' },
  },

  {
    id: 'wchhs-2026',
    type: 'conference',
    title: 'World Congress on Humanities, Heritage & Society',
    host: 'Global Academic Research Forum',
    theme: 'Heritage and Society in the Digital Age',
    tagline: 'Flagged. Read the warning before anything else on this page.',
    description:
      'Advertises acceptance within 48 hours, a rolling deadline, and publication in an "indexed" proceedings volume.',
    location: { city: 'Dubai', country: 'United Arab Emirates', format: 'hybrid' },
    dates: { start: '2026-12-18', end: '2026-12-19' },
    deadlines: [{ label: 'abstract', date: '2026-11-15', depends_on: null, grounded: false, source_quote: null }],
    eligibility: {
      career_stage: ['phd', 'postdoc', 'faculty', 'independent', 'other'],
      nationality: null,
      region_restriction: null,
      membership_required: false,
      notes: 'No stated restrictions of any kind.',
    },
    fees: [{ tier: 'Presenter', amount: 650, currency: 'USD', grounded: true, source_quote: 'Registration fee USD 650 per presenting author.' }],
    funding: [],
    past_editions: [],
    source_url: 'https://example-garf.org/wchhs2026',
    extracted_at: '2026-09-12T04:20:00Z',
    predatory_flag: true,
    predatory_reasons: [
      'No traceable scholarly footprint — no programme committee member has a verifiable affiliation',
      'Acceptance promised within 48 hours of submission',
      'USD 650 with no student or regional tier, well above comparable venues',
      'Claims indexing in databases that do not list the proceedings',
      'Scope spans fourteen unrelated disciplines',
    ],
    explore: false,
    fit: {
      score: 0.29,
      rationale:
        'Surfaced with a warning, not a recommendation. Your keywords match because the stated scope is broad enough to match almost anybody — which is itself the signal.',
      matched_topics: ['urban memory'],
      neighborhood_evidence: [],
      why_semantic: 'Semantic overlap 0.31.',
    },
    eligible: 'yes',
    eligibility_notes: 'No restrictions stated — which is not reassuring at this price.',
    cost_estimate: {
      currency: 'BRL',
      low: 3523,
      high: 3523,
      breakdown: { registration: { low: 3523, high: 3523, note: 'USD 650 — no student tier offered' } },
      assumptions: ['Registration only; excludes travel and accommodation'],
      net_note: 'Grapevine does not recommend this venue.',
    },
    visa: {
      required: 'conditional',
      note: 'Brazilian passport holders may be eligible for a UAE visa on arrival. Not researched further, given the flag above.',
      official_source: 'https://www.icp.gov.ae/en/',
      verify_flag: true,
    },
    confidence: { dates: 'inferred', fees: 'verified', cost: 'range', visa: 'advisory', eligibility: 'inferred' },
  },
];

/** Reasons offered in the dismiss dialog, and the reweight each one triggers. */
export const dismissReasons = [
  { id: 'too_expensive', label: 'Too expensive', emoji: '💸', effect: 'Lowers the cost ceiling used when ranking.' },
  { id: 'wrong_stage', label: 'Wrong career stage', emoji: '🎓', effect: 'Tightens the eligibility filter on career stage.' },
  { id: 'off_topic', label: 'Off topic', emoji: '🎯', effect: 'Reduces the weight of the topics this one matched on.' },
  { id: 'bad_timing', label: 'Bad timing', emoji: '📅', effect: 'Down-weights months outside your availability.' },
  { id: 'visa_infeasible', label: 'Visa is not realistic', emoji: '🛂', effect: 'Prefers destinations with lighter visa requirements.' },
  { id: 'other', label: 'Something else', emoji: '💬', effect: 'Logged for review; no automatic reweight.' },
];

/** Topics offered during onboarding when bootstrapping from ORCID. */
export const suggestedTopics = [
  'oral history',
  'urban memory',
  'housing rights & displacement',
  'favelas & informal urbanism',
  'Latin American social movements',
  'community archives',
  'testimony & witness',
  'heritage and erasure',
];
