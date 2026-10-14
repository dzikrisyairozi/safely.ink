import { Hono } from 'hono';
import { FieldValue } from 'firebase-admin/firestore';
import {
  AnalysisId,
  ConfirmAnalysisRequest,
  CreateAnalysisRequest,
  isLawChecked,
  type AnalysisStatus,
  type UploadError,
} from '@repo/api-types';
import { config } from '../config';
import { failure } from '../failure';
import { db } from '../firebase';
import { readDocument } from '../agents/reader';
import { clearStage, isStage, runPipeline, saveAll } from '../pipeline';
import { checkReading } from '../pipeline/reader-check';
import { loadUploads } from '../uploads';
import { nextReset, releaseDailySlot, reserveDailySlot } from '../usage';

const { limits } = config;
const megabytes = limits.uploadMaxBytes / (1024 * 1024);

const UPLOAD_MESSAGES: Record<UploadError, string> = {
  file_missing: 'One of the files was not uploaded. Please upload it again.',
  unsupported_type:
    'Upload one PDF, or 1 to 30 images (JPEG, PNG, WebP or HEIC).',
  mixed_input: 'Upload either one PDF or images, not both.',
  too_large: `The upload is over ${megabytes} MB. Upload the main document only.`,
  too_many_pages: `The document has more than ${limits.uploadMaxPages} pages. Upload the main document only.`,
};

const dailyLimit = (now: Date) =>
  failure(
    'daily_limit',
    `You can start ${limits.analysesPerUserPerDay} analyses a day.`,
    nextReset(now).toISOString(),
  );

const ALREADY_EXISTS = 6; // gRPC status of a create() on an existing document

export const analyses = new Hono<{ Variables: { uid: string } }>();

// Reads the uploaded document and stops at awaiting_confirmation or rejected.
analyses.post('/', async (c) => {
  const body = CreateAnalysisRequest.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!body.success) {
    return c.json(
      failure(
        'invalid_request',
        'Send an analysis ID, 1 to 30 file names, the document type and the country.',
      ),
      400,
    );
  }
  const uid = c.get('uid');
  const { analysisId, files, docType, jurisdiction } = body.data;

  // The path is built from the caller's uid, so only their files can match.
  const uploads = await loadUploads(uid, analysisId, files);
  if (!uploads.ok) {
    return c.json(failure(uploads.code, UPLOAD_MESSAGES[uploads.code]), 400);
  }

  const now = new Date();
  if (!(await reserveDailySlot(uid, now))) {
    return c.json(dailyLimit(now), 429);
  }

  const analysis = db.doc(`analyses/${analysisId}`);
  const updatedAt = FieldValue.serverTimestamp();
  try {
    await analysis.create({
      ownerUid: uid,
      status: 'reading',
      meta: null,
      // The day the slot counts against; a later stage gives that day back.
      reservedAt: now,
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
      { docType, jurisdiction },
    );
    if (reading.status === 'awaiting_confirmation') {
      await saveAll(analysis, 'clauses', reading.clauses);
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
    try {
      // Clauses may have been saved before the write of the details failed.
      await db.recursiveDelete(analysis.collection('clauses'));
      await analysis.update({
        status,
        ...(status === 'failed' && { stage: 'reading' }),
        updatedAt,
      });
    } catch (err) {
      console.error(err);
    }
    // Rejected or failed: it does not count against the day (F-READ-4,
    // F-LIVE-4), also when the status itself could not be stored.
    await releaseDailySlot(uid, now);
  }

  return c.json({ analysisId, status }, 201);
});

// Stores what the user confirmed, then runs the remaining stages. The
// request stays open for the run; the screen follows Firestore meanwhile.
analyses.post('/:id/confirm', async (c) => {
  const id = AnalysisId.safeParse(c.req.param('id'));
  if (!id.success)
    return c.json(failure('not_found', 'No such analysis.'), 404);
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
  const { docType, jurisdiction, userRole } = body.data;

  const outcome = await db.runTransaction(async (tx) => {
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
      'meta.lawChecked': isLawChecked(jurisdiction),
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
      // A stage that fails is a status of the analysis, not an HTTP error.
      return c.json({
        analysisId: id.data,
        status: await runPipeline(id.data),
      });
  }
});

// Resumes a failed run from the stage it stopped in (F-LIVE-4, FSD 6). The
// stage starts clean; what earlier stages stored is used as it is. Like
// confirm, the request stays open for the run.
analyses.post('/:id/retry', async (c) => {
  const id = AnalysisId.safeParse(c.req.param('id'));
  if (!id.success)
    return c.json(failure('not_found', 'No such analysis.'), 404);
  const uid = c.get('uid');
  const analysis = db.doc(`analyses/${id.data}`);

  const data = (await analysis.get()).data();
  // Someone else's analysis looks the same as one that does not exist.
  if (data?.ownerUid !== uid)
    return c.json(failure('not_found', 'No such analysis.'), 404);
  const conflict = () =>
    c.json(
      failure('conflict', 'This analysis has no failed stage to retry.'),
      409,
    );
  // A failed reading has nothing stored to resume from; it is uploaded again.
  if (data.status !== 'failed' || !isStage(data.stage)) return conflict();
  const stage: AnalysisStatus = data.stage;

  // The failure gave its slot back, so the run takes one again.
  const now = new Date();
  if (!(await reserveDailySlot(uid, now))) {
    return c.json(dailyLimit(now), 429);
  }

  // Of two retries at once, only one picks the analysis up.
  const picked = await db.runTransaction(async (tx) => {
    const current = (await tx.get(analysis)).data();
    if (current?.status !== 'failed' || current.stage !== stage) return false;
    tx.update(analysis, {
      status: stage,
      stage: FieldValue.delete(),
      reservedAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!picked) {
    await releaseDailySlot(uid, now);
    return conflict();
  }

  try {
    await clearStage(analysis, stage);
  } catch (err) {
    console.error(err);
    await analysis
      .update({
        status: 'failed',
        stage,
        updatedAt: FieldValue.serverTimestamp(),
      })
      .catch(console.error);
    // Given back also when the status itself could not be stored.
    await releaseDailySlot(uid, now);
    return c.json({ analysisId: id.data, status: 'failed' });
  }
  return c.json({ analysisId: id.data, status: await runPipeline(id.data) });
});
