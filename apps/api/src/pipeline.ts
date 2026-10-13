import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { AnalysisMeta, Clause, type AnalysisStatus } from '@repo/api-types';
import {
  proposeFacts,
  proposeRules,
  repairRules,
} from './agents/rule-extractor';
import { db } from './firebase';
import { packFor } from './packs';
import {
  checkFacts,
  checkRules,
  demote,
  numbered,
} from './pipeline/rule-check';
import { releaseDailySlot } from './usage';

const BATCH = 500; // Firestore's limit of writes in one batch

/** Stores each item in a sub-collection of the analysis, under its ID. */
export async function saveAll(
  analysis: DocumentReference,
  name: string,
  items: { id: string }[],
) {
  for (let from = 0; from < items.length; from += BATCH) {
    const batch = db.batch();
    for (const item of items.slice(from, from + BATCH)) {
      batch.set(analysis.collection(name).doc(item.id), item);
    }
    await batch.commit();
  }
}

const updatedAt = () => FieldValue.serverTimestamp();

// The model proposes facts and rules; rule-check.ts decides what is stored.
async function extractRules(analysis: DocumentReference, meta: AnalysisMeta) {
  const clauses = (await analysis.collection('clauses').get()).docs.map((doc) =>
    Clause.parse(doc.data()),
  );

  const factSchema = checkFacts(
    await proposeFacts(clauses, packFor(meta.docType), meta),
  );
  await analysis.update({ factSchema, updatedAt: updatedAt() });

  const drafts = numbered(await proposeRules(clauses, factSchema, meta));
  const first = checkRules(drafts, clauses, factSchema);
  const rules = first.valid;

  if (first.invalid.length > 0) {
    // One repair. A rule it does not answer for is checked again as it was.
    const answers = await repairRules(
      first.invalid,
      clauses,
      factSchema,
      meta,
    ).catch((err) => {
      console.error(err);
      return [];
    });
    const again = first.invalid.map(({ id, draft }) => ({
      id,
      draft: answers.find((answer) => answer.id === id)?.draft ?? draft,
    }));
    const repaired = checkRules(again, clauses, factSchema).valid;
    rules.push(...repaired);

    // What the repair did not fix is kept as unmodeled. The answer can be
    // worse than the rule it was meant to correct, so the rule as it was
    // first written is the fallback.
    for (const [n, original] of first.invalid.entries()) {
      if (repaired.some((rule) => rule.id === original.id)) continue;
      const kept =
        demote(again[n]!, clauses, factSchema) ??
        demote(original, clauses, factSchema);
      if (kept) rules.push(kept);
    }
    rules.sort((a, b) => a.id.localeCompare(b.id));
  }
  if (rules.length === 0) throw new Error('The clauses gave no rule.');

  await saveAll(analysis, 'rules', rules);
  await analysis.update({
    'counts.rules': rules.length,
    updatedAt: updatedAt(),
  });
}

type Stage = {
  status: AnalysisStatus;
  run: (analysis: DocumentReference, meta: AnalysisMeta) => Promise<void>;
};

// In the order they run. A later milestone adds its stage to the end.
const STAGES: Stage[] = [{ status: 'extracting_rules', run: extractRules }];
// Where an analysis waits when every stage built so far is done.
const AFTER_STAGES: AnalysisStatus = 'fuzzing';

/**
 * Runs the stages from the current status of the analysis on, and writes
 * the status after each. Returns where the analysis ended.
 */
export async function runPipeline(analysisId: string): Promise<AnalysisStatus> {
  const analysis = db.doc(`analyses/${analysisId}`);
  const data = (await analysis.get()).data()!;
  let status: AnalysisStatus = data.status;

  for (const [n, stage] of STAGES.entries()) {
    if (stage.status !== status) continue;
    try {
      await stage.run(analysis, AnalysisMeta.parse(data.meta));
      status = STAGES[n + 1]?.status ?? AFTER_STAGES;
      await analysis.update({ status, updatedAt: updatedAt() });
    } catch (err) {
      console.error(err);
      await analysis
        .update({
          status: 'failed',
          stage: stage.status,
          updatedAt: updatedAt(),
        })
        .catch(console.error);
      // A failed run does not count against the day its slot was taken on
      // (F-LIVE-4), also when the status itself could not be stored. An
      // analysis from before reservedAt existed has only createdAt.
      const reserved = data.reservedAt ?? data.createdAt;
      await releaseDailySlot(data.ownerUid, reserved.toDate());
      return 'failed';
    }
  }
  return status;
}
