import { Hono } from 'hono';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import {
  AnalysisId,
  ConfirmAnalysisRequest,
  CreateAnalysisRequest,
  type AnalysisStatus,
  type Clause,
} from '@repo/api-types';
import { config } from '../config';
import { failure } from '../failure';
import { db } from '../firebase';
import { readDocument } from '../agents/reader';
import { checkReading } from '../pipeline/reader-check';
import { loadUploads, type UploadError } from '../uploads';
import { nextReset, releaseDailySlot, reserveDailySlot } from '../usage';

const { limits } = config;
const megabytes = limits.uploadMaxBytes / (1024 * 1024);
const lawJurisdictions = Object.keys(config.legalSources);

const UPLOAD_MESSAGES: Record<UploadError, string> = {
  file_missing: 'One of the files was not uploaded. Please upload it again.',
  unsupported_type:
    'Upload one PDF, or 1 to 30 images (JPEG, PNG, WebP or HEIC).',
  mixed_input: 'Upload either one PDF or images, not both.',
  too_large: `The upload is over ${megabytes} MB. Upload the main document only.`,
  too_many_pages: `The document has more than ${limits.uploadMaxPages} pages. Upload the main document only.`,
};

const ALREADY_EXISTS = 6; // gRPC status of a create() on an existing document
const BATCH = 500; // Firestore's limit of writes in one batch

async function saveClauses(analysis: DocumentReference, clauses: Clause[]) {
  for (let from = 0; from < clauses.length; from += BATCH) {
    const batch = db.batch();
    for (const clause of clauses.slice(from, from + BATCH)) {
      batch.set(analysis.collection('clauses').doc(clause.id), clause);
    }
    await batch.commit();
  }
}

export const analyses = new Hono<{ Variables: { uid: string } }>();

// Reads the uploaded document and stops at awaiting_confirmation or rejected.
analyses.post('/', async (c) => {
  const body = CreateAnalysisRequest.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!body.success) {
    return c.json(
      failure('invalid_request', 'Send an analysis ID and 1 to 30 file names.'),
      400,
    );
  }
  const uid = c.get('uid');
  const { analysisId, files } = body.data;

  // The path is built from the caller's uid, so only their files can match.
  const uploads = await loadUploads(uid, analysisId, files);
  if (!uploads.ok) {
    return c.json(failure(uploads.code, UPLOAD_MESSAGES[uploads.code]), 400);
  }

  const now = new Date();
  if (!(await reserveDailySlot(uid, now))) {
    return c.json(
      failure(
        'daily_limit',
        `You can start ${limits.analysesPerUserPerDay} analyses a day.`,
        nextReset(now).toISOString(),
      ),
      429,
    );
  }

  const analysis = db.doc(`analyses/${analysisId}`);
  const updatedAt = FieldValue.serverTimestamp();
  try {
    await analysis.create({
      ownerUid: uid,
      status: 'reading',
      meta: null,
      createdAt: updatedAt,
      updatedAt,
    });
  } catch (err) {
    await releaseDailySlot(uid, now);
    if ((err as { code?: number }).code !== ALREADY_EXISTS) throw err;
    return c.json(failure('conflict', 'This analysis already exists.'), 409);
  }

  let status: AnalysisStatus = 'failed';
  try {
    const reading = checkReading(
      await readDocument(uploads.files, uploads.pageCount),
      uploads.pageCount,
      lawJurisdictions,
    );
    if (reading.status === 'awaiting_confirmation') {
      await saveClauses(analysis, reading.clauses);
      await analysis.update({
        status: reading.status,
        meta: reading.meta,
        counts: { clauses: reading.clauses.length },
        updatedAt,
      });
    }
    status = reading.status;
  } catch (err) {
    console.error(err);
  }

  if (status !== 'awaiting_confirmation') {
    await analysis.update({
      status,
      ...(status === 'failed' && { stage: 'reading' }),
      updatedAt,
    });
  }
  // Not a policy or contract: it does not count against the day (F-READ-4).
  if (status === 'rejected') await releaseDailySlot(uid, now);

  return c.json({ analysisId, status }, 201);
});

// Stores what the user confirmed. The remaining stages attach here in M4.
analyses.post('/:id/confirm', async (c) => {
  const id = AnalysisId.safeParse(c.req.param('id'));
  const body = ConfirmAnalysisRequest.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!body.success) {
    return c.json(
      failure(
        'invalid_request',
        'Send the document type, the jurisdiction and your role.',
      ),
      400,
    );
  }
  const uid = c.get('uid');
  const { docType, userRole } = body.data;
  const jurisdiction = body.data.jurisdiction.trim().toUpperCase();

  const outcome = await db.runTransaction(async (tx) => {
    if (!id.success) return 'not_found';
    const analysis = db.doc(`analyses/${id.data}`);
    const data = (await tx.get(analysis)).data();
    // Someone else's analysis looks the same as one that does not exist.
    if (data?.ownerUid !== uid) return 'not_found';
    if (data.status !== 'awaiting_confirmation') return 'conflict';

    const roles: string[] = data.meta.parties.map(
      (party: { role: string }) => party.role,
    );
    if (roles.length > 0 && !roles.includes(userRole)) return 'invalid_role';

    tx.update(analysis, {
      status: 'extracting_rules',
      'meta.docType': docType,
      'meta.jurisdiction': jurisdiction,
      'meta.lawChecked': lawJurisdictions.includes(jurisdiction),
      'meta.userRole': userRole,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'confirmed';
  });

  switch (outcome) {
    case 'not_found':
      return c.json(failure('not_found', 'No such analysis.'), 404);
    case 'conflict':
      return c.json(
        failure('conflict', 'This analysis is not waiting for confirmation.'),
        409,
      );
    case 'invalid_role':
      return c.json(
        failure('invalid_request', 'Pick one of the parties in the document.'),
        400,
      );
    case 'confirmed':
      return c.json({ analysisId: id.data, status: 'extracting_rules' });
  }
});
