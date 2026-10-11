#!/usr/bin/env node
// Builds a hand-grading sheet from an eval run, so a person can score briefs on the same rubric
// as the LLM judge. Scores go into evals/human/labels.json; the next `npm run eval:brief`
// reports how often the judge agrees with the person.
// Usage: node evals/human/make-sheet.mjs <results-dir> [count=10]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadProfile, loadOpportunity } from '../lib.mjs';

const [dir, n = 10] = process.argv.slice(2);
if (!dir) { console.error('Usage: node evals/human/make-sheet.mjs <results-dir> [count]'); process.exit(1); }
const report = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
const cases = (report.suites.brief?.cases ?? []).filter((c) => c.output?.brief).slice(0, Number(n));

let md = `# Hand-grading sheet\n\nScore each brief 1 (bad) to 5 (excellent) on the five questions in [evals/judge/brief-rubric.md](../judge/brief-rubric.md), without looking at the judge's scores. Put your scores in [labels.json](labels.json) under the case id.\n\n- **specific**: are the points about this person and this event?\n- **grounded**: is anything stated that the inputs don't support?\n- **consistent**: do the reasons match the numbers?\n- **eligibility_visa**: are eligibility and visa right for this passport?\n- **plain**: could a non-academic follow it?\n`;
for (const c of cases) {
  const golden = readFileSync(join(ROOT, 'evals', 'golden', 'brief.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((g) => g.id === c.id);
  const p = loadProfile(golden.profile), o = loadOpportunity(golden.opportunity), b = c.output.brief;
  md += `\n---\n\n## ${c.id}\n\n**Person:** ${p.name}, ${p.career_stage}, ${p.geography.city} (${p.geography.passport} passport), budget ${p.constraints.max_cost} ${p.currency}. ${p.research_summary}\n\n**Opportunity:** ${o.title}, ${o.location.city}, ${o.location.country} (${o.location.format}). ${o.source_url}\n\n**Brief:** priority **${b.priority.score}** · eligible ${b.eligible} · visa ${b.visa?.required ?? '—'} · cost ${b.cost_estimate?.low}–${b.cost_estimate?.high} ${b.cost_estimate?.currency}${b.cost_estimate?.over_budget ? ' (over budget)' : ''}\n\n> ${b.tagline}\n\nWhy go:\n${(b.why_go ?? []).map((x) => `- ${x}`).join('\n')}\n\nWatch out:\n${(b.watch_out ?? []).map((x) => `- ${x}`).join('\n')}\n\nSub-scores: ${Object.entries(b.priority.sub_scores).filter(([, s]) => s).map(([k, s]) => `${k} ${s.score} (${s.reason})`).join('; ')}\n\nVisa: ${b.visa?.note ?? '—'}\n\nFunding: ${(b.funding ?? []).map((f) => `${f.name} [${f.eligible}]`).join('; ') || 'none'}\n`;
}
writeFileSync(join(ROOT, 'evals', 'human', 'sheet.md'), md);
console.log(`Wrote evals/human/sheet.md with ${cases.length} briefs.`);
