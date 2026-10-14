import {
  isLawChecked,
  type AnalysisMeta,
  type LawJurisdiction,
  type LegalFinding,
  type Outcome,
  type Rule,
} from '@repo/api-types';
import { assessLaw, readLawPage } from '../agents/legal-researcher';
import { config } from '../config';
import { readPage } from './fetch';
import { findSources } from './search';
import { verify } from './verify';

const nothingFound: LegalFinding = {
  status: 'no_finding',
  reasoning: '',
  citations: [],
  error: null,
};
const unavailable: LegalFinding = {
  ...nothingFound,
  error: 'lookup_unavailable',
};

// Search, read the pages, assess, check the quotes (TSD 5.6). Throws when
// the law could not be looked up.
async function research(
  rule: Rule,
  meta: AnalysisMeta & { jurisdiction: LawJurisdiction },
): Promise<LegalFinding> {
  const urls = await findSources(rule, meta);
  if (urls.length === 0) return nothingFound;

  const read = await Promise.all(
    urls.map((url) =>
      readPage(url, meta.jurisdiction, { readWithModel: readLawPage }),
    ),
  );
  const pages = urls.flatMap((url, n) => {
    const page = read[n];
    return page ? [{ url, ...page }] : [];
  });
  if (pages.length === 0) throw new Error('No official page could be read.');

  const assessment = await assessLaw(
    rule,
    meta,
    pages.map(({ url, text }) => ({ url, text })),
  );
  // A page the model read for us is its own copy: it helps the assessment,
  // but a quote found in it proves nothing (F-CMP-4).
  return verify(
    assessment,
    pages.filter(({ via }) => via === 'fetch'),
    meta.jurisdiction,
  );
}

// Rejects once the deadline has passed. The work that lost goes on, but is
// no longer waited for.
function byDeadline<T>(work: Promise<T>, deadline: number) {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Not done by the deadline.')),
      deadline - Date.now(),
    );
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * What the law says about each rule that decides a bad or partly bad
 * outcome (F-CMP-2), by rule ID. A stored finding is kept unless its lookup
 * was unavailable. The rules deciding the most such outcomes go first, a
 * few at a time; a rule not done by `deadline` is unavailable. Each finding
 * is passed to `save` as soon as it exists.
 */
export async function lookUpLaw({
  rules,
  outcomes,
  stored,
  meta,
  deadline,
  save,
}: {
  rules: Rule[];
  outcomes: Outcome[];
  stored: Record<string, LegalFinding>;
  meta: AnalysisMeta;
  deadline: number; // in ms since the epoch
  save: (ruleId: string, finding: LegalFinding) => Promise<void>;
}): Promise<Record<string, LegalFinding>> {
  const { jurisdiction } = meta;
  if (!meta.lawChecked || !isLawChecked(jurisdiction)) return {};

  const deciding = new Map<string, number>();
  for (const { result, decidingRuleId } of outcomes) {
    if (decidingRuleId && (result === 'bad' || result === 'partly_bad')) {
      deciding.set(decidingRuleId, (deciding.get(decidingRuleId) ?? 0) + 1);
    }
  }
  const findings = Object.fromEntries(
    Object.entries(stored).filter(([, finding]) => finding.error === null),
  );
  const queue = rules
    .filter((rule) => deciding.has(rule.id) && !findings[rule.id])
    .sort((a, b) => deciding.get(b.id)! - deciding.get(a.id)!);

  const worker = async () => {
    for (let rule = queue.shift(); rule; rule = queue.shift()) {
      const finding =
        Date.now() < deadline
          ? await byDeadline(
              research(rule, { ...meta, jurisdiction }),
              deadline,
            ).catch((err) => {
              console.warn(
                `Law lookup for ${rule!.id} unavailable:`,
                String(err),
              );
              return unavailable;
            })
          : unavailable;
      findings[rule.id] = finding;
      await save(rule.id, finding);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(config.limits.law.atOnce, queue.length) },
      worker,
    ),
  );
  return findings;
}
