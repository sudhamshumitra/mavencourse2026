import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runGrounding } from '../../api/_lib/check/grounding.js';
import { normQuote, quoteOnPage } from '../../api/_lib/check/shared.js';
import { htmlToText } from '../../api/_lib/fetchPage.js';

const page = (text) => async () => ({ finalUrl: 'https://example.org', title: '', text });
const opp = (items) => ({ source_url: 'https://example.org', deadlines: items, fees: [], funding: [] });
const d = (date, quote) => ({ label: 'abstract', date, grounded: true, source_quote: quote });

test('quote matcher ignores only spacing, curly quotes, dashes and case', () => {
  assert.equal(normQuote('Abstracts due  “15 March” – 2027'), normQuote('abstracts due "15 march" - 2027'));
  assert.notEqual(normQuote('closes 15 March'), normQuote('open until 15 March'));
});

test('quote matcher survives page-text formatting (eval finding: correct facts would have been wrongly downgraded)', () => {
  assert.ok(quoteOnPage('The abstract submission deadline is August 31st, 2026', 'The abstract submission deadline is August 31 st , 2026')); // <sup>st</sup>
  assert.ok(quoteOnPage('Student, Majority World: $40/$55', 'Ticket Type\nStudent, Majority World\n$40\n$55')); // table cells
  assert.ok(quoteOnPage('Submission Deadline ... Final day to submit papers', 'NOV 15 Submission Deadline\n\nFinal day to submit papers, symposia'));
});

test('quote matcher still rejects paraphrases, changed numbers and pieces out of order', () => {
  assert.equal(quoteOnPage('Submissions close on 15 March 2027', 'The call is open until 15 March 2027.'), false);
  assert.equal(quoteOnPage('Student: $45', 'Student $40'), false);
  assert.equal(quoteOnPage('Student: $4', 'Student $40'), false);
  assert.equal(quoteOnPage('Final day ... Submission Deadline', 'Submission Deadline. Final day to submit'), false);
});

test('known fault: paraphrased quote is not found and gets downgraded (no model call needed)', async () => {
  const r = await runGrounding(opp([d('2027-03-15', 'Submissions close on 15 March 2027')]), { fetch: page('The call is open until 15 March 2027.') });
  assert.equal(r.grounding.fail_missing, 1);
  assert.equal(r.opportunity.deadlines[0].grounded, false);
  assert.equal(r.opportunity.deadlines[0].previous_quote, 'Submissions close on 15 March 2027');
});

test('unreachable page: nothing is downgraded', async () => {
  const r = await runGrounding(opp([d('2027-03-15', 'x')]), { fetch: async () => { throw new Error('403'); } });
  assert.equal(r.grounding.unreachable, true);
  assert.equal(r.opportunity.deadlines[0].grounded, true);
});

test('value check unavailable: quotes found on the page are left as extracted', async () => {
  // The dead API URL from setup.mjs makes the model call fail — the documented safe path.
  const r = await runGrounding(opp([d('2027-03-15', 'Abstracts due 15 March 2027')]), { fetch: page('Call for papers. Abstracts due 15 March 2027. Fees TBA.') });
  assert.equal(r.grounding.passed, 1);
  assert.equal(r.opportunity.deadlines[0].grounded, true);
  assert.match(r.grounding.note, /did not finish/);
});

test('nothing marked verified: no fetch, nothing to do', async () => {
  const r = await runGrounding(opp([]), { fetch: async () => { throw new Error('should not fetch'); } });
  assert.equal(r.grounding.checked, 0);
});

test('page text: scripts, styles and tags removed, entities decoded', () => {
  const t = htmlToText('<html><style>x{}</style><script>alert(1)</script><p>Fee:&nbsp;&euro;290 &amp; more</p></html>');
  assert.doesNotMatch(t, /alert|x\{\}/);
  assert.match(t, /Fee: /);
  assert.match(t, /& more/);
});
