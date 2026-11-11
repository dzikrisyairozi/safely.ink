import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { FieldValue } from 'firebase-admin/firestore';
import {
  AnalysisId,
  ConfirmAnalysisRequest,
  CreateAnalysisRequest,
  isDeletable,
  isLawChecked,
  type AnalysisStatus,
  type UploadError,
} from '@repo/api-types';
import { config } from '../config';
import { isPaused } from '../budget';
import { failure } from '../failure';
import { bucket, db } from '../firebase';
import { readDocument } from '../agents/reader';
import { addUsage, isStage, stalledRun, saveAll } from '../pipeline';
import { checkReading } from '../pipeline/reader-check';
import { loadUploads } from '../uploads';
import {
  nextReset,
  releaseDailySlot,
  reserveDailySlot,
  slotIn,
} from '../usage';
import { startRun } from '../tasks';
import { inStage } from '../telemetry';
import { versions } from '../versions';

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
const paused = failure(
  'paused',
  'New analyses are paused for now. Please try again later.',
);

export const analyses = new Hono<{ Variables: { uid: string } }>();

// Reads the uploaded document and stops at awaiting_confirmation or rejected.
analyses.post('/', async (c) => {
  if (await isPaused()) return c.json(paused, 503);
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
    const read = await inStage(
      {
        analysisId,
        stage: 'reading',
        save: (model, used) => addUsage(analysis, model, used),
      },
      () => readDocument(uploads.files, uploads.pageCount),
    );
    const reading = checkReading(read, uploads.pageCount, {
      docType,
      jurisdiction,
    });
    if (reading.status === 'awaiting_confirmation') {
      await saveAll(analysis, 'clauses', reading.clauses);
      await analysis.update({
        status: reading.status,
        meta: reading.meta,
        counts: { clauses: reading.clauses.length },
        'versions.reading': versions,
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

// Stores what the user confirmed, then starts the remaining stages: as tasks
// on the worker where a queue is set up, or in this request where none is.
// The screen follows Firestore meanwhile.
analyses.post('/:id/confirm', async (c) => {
  if (await isPaused()) return c.json(paused, 503);
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

  const runId = randomUUID();
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
      runId,
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
        status: await startRun(id.data, runId, 'extracting_rules'),
      });
  }
});

// Resumes a failed run from the stage it stopped in (F-LIVE-4, FSD 6), or
// checks the law again for a finished one whose lookup was unavailable. The
// stage starts without its old result; what earlier stages stored is used
// as it is. It starts the run like confirm does.
analyses.post('/:id/retry', async (c) => {
  if (await isPaused()) return c.json(paused, 503);
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
      failure(
        'conflict',
        'This analysis has no failed stage or law lookup to retry.',
      ),
      409,
    );
  // A finished analysis whose law lookup was unavailable compares again,
  // which keeps the expectations and looks up only what is missing (FSD 7).
  const lawMissing = async () =>
    !(
      await analysis
        .collection('findings')
        .where('error', '==', 'lookup_unavailable')
        .limit(1)
        .get()
    ).empty;
  // A failed reading has nothing stored to resume from; it is uploaded again.
  // A run that stopped responding resumes at the stage it is in.
  const from = data.status;
  const stalled = stalledRun(data);
  const stage = stalled
    ? from
    : from === 'done' && (await lawMissing())
      ? 'comparing'
      : data.stage;
  if ((!stalled && from !== 'failed' && from !== 'done') || !isStage(stage)) {
    return conflict();
  }

  // A failure gave its slot back, so the run takes one again. A run that
  // stopped responding never gave its slot back and keeps it.
  const now = new Date();
  const slotDay: Date = stalled
    ? (data.reservedAt ?? data.createdAt).toDate()
    : now;
  if (!stalled && !(await reserveDailySlot(uid, now))) {
    return c.json(dailyLimit(now), 429);
  }

  // Of two retries at once, only one picks the analysis up. The new run ID
  // makes every task of an earlier run of this analysis do nothing.
  const runId = randomUUID();
  const picked = await db.runTransaction(async (tx) => {
    const current = (await tx.get(analysis)).data();
    if (!current || current.status !== from) return false;
    if (
      stalled
        ? !stalledRun(current)
        : from === 'failed' && current.stage !== stage
    ) {
      return false;
    }
    tx.update(analysis, {
      status: stage,
      runId,
      clearFirst: true,
      stage: FieldValue.delete(),
      error: FieldValue.delete(),
      cancelRequested: FieldValue.delete(),
      lease: FieldValue.delete(),
      reservedAt: slotDay,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!picked) {
    if (!stalled) await releaseDailySlot(uid, now);
    return conflict();
  }

  return c.json({
    analysisId: id.data,
    status: await startRun(id.data, runId, stage),
  });
});

// Asks a running analysis to stop (F-LIVE-5). The stage that is running
// finishes, and the run ends as failed with error 'cancelled' at the next
// one, which the user can retry like any failed stage. `updatedAt` is left
// alone, so asking does not put off when the analysis may be deleted. A run
// that stopped responding ends at once.
analyses.post('/:id/cancel', async (c) => {
  const id = AnalysisId.safeParse(c.req.param('id'));
  if (!id.success)
    return c.json(failure('not_found', 'No such analysis.'), 404);
  const uid = c.get('uid');
  const analysis = db.doc(`analyses/${id.data}`);

  const outcome = await db.runTransaction(async (tx) => {
    const data = (await tx.get(analysis)).data();
    // Someone else's analysis looks the same as one that does not exist.
    if (data?.ownerUid !== uid) return { kind: 'not_found' as const };
    if (!isStage(data.status)) return { kind: 'conflict' as const };
    // A run that stopped responding has no task left to see the request,
    // so it ends here.
    if (stalledRun(data)) {
      const slot = await slotIn(
        tx,
        uid,
        (data.reservedAt ?? data.createdAt).toDate(),
      );
      tx.update(analysis, {
        status: 'failed',
        stage: data.status,
        error: 'cancelled',
        lease: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      slot.release();
      return { kind: 'requested' as const, status: 'failed' as const };
    }
    tx.update(analysis, { cancelRequested: true });
    return { kind: 'requested' as const, status: data.status };
  });

  switch (outcome.kind) {
    case 'not_found':
      return c.json(failure('not_found', 'No such analysis.'), 404);
    case 'conflict':
      return c.json(failure('conflict', 'This analysis is not running.'), 409);
    case 'requested':
      return c.json({ analysisId: id.data, status: outcome.status }, 202);
  }
});

// Deletes the analysis, everything under it and its uploaded files
// (F-HIST-2). The day's slot stays used, or deleting would reset the limit.
analyses.delete('/:id', async (c) => {
  const id = AnalysisId.safeParse(c.req.param('id'));
  if (!id.success)
    return c.json(failure('not_found', 'No such analysis.'), 404);
  const uid = c.get('uid');
  const analysis = db.doc(`analyses/${id.data}`);

  const outcome = await db.runTransaction(async (tx) => {
    const data = (await tx.get(analysis)).data();
    // Someone else's analysis looks the same as one that does not exist.
    if (data?.ownerUid !== uid) return 'not_found';
    const { status, updatedAt } = data;
    if (!isDeletable({ status, updatedAt }, Date.now())) return 'conflict';
    // Gone before anything else, so a confirm or retry racing this one
    // finds nothing and no run starts on a half-deleted analysis.
    tx.delete(analysis);
    return 'deleted';
  });

  switch (outcome) {
    case 'not_found':
      return c.json(failure('not_found', 'No such analysis.'), 404);
    case 'conflict':
      return c.json(
        failure(
          'conflict',
          'This analysis is still running. You can delete it when the run ends.',
        ),
        409,
      );
    case 'deleted':
      // ponytail: if this fails, the leftovers are unreachable by clients and
      // a second delete finds nothing; a cleanup by path would catch them.
      await db.recursiveDelete(analysis);
      // The prefix is built from the caller's uid, like loadUploads().
      await bucket().deleteFiles({ prefix: `uploads/${uid}/${id.data}/` });
      return c.json({ analysisId: id.data });
  }
});
