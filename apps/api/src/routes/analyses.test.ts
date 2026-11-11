import { beforeEach, expect, test, vi } from 'vitest';
import { DocumentReference, Query, Timestamp } from 'firebase-admin/firestore';
import {
  ErrorEnvelope,
  ReaderOutput,
  RUN_STALE_SECONDS,
  type Fact,
  type LegalFinding,
} from '@repo/api-types';
import policy from '../../test/fixtures/reader-policy.json';
import receipt from '../../test/fixtures/reader-receipt.json';
import proposedFacts from '../../test/fixtures/rules-facts.json';
import proposedRules from '../../test/fixtures/rules-rules.json';
import proposedScenarios from '../../test/fixtures/fuzz-scenarios.json';
import { app } from '../app';
import { bucket, db } from '../firebase';
import { readDocument } from '../agents/reader';
import { proposeFacts, proposeRules } from '../agents/rule-extractor';
import { judge } from '../agents/expectation-judge';
import { proposeScenarios, tellBoundaries } from '../agents/scenario-fuzzer';
import { lookUpLaw } from '../legal/research';
import { runStage } from '../pipeline';
import { versions } from '../versions';

// Run through `pnpm test`: Firestore and Storage are the emulators. Only the
// token check and the model are replaced.
vi.mock('../firebase', async (original) => ({
  ...(await original<typeof import('../firebase')>()),
  auth: { verifyIdToken: async (token: string) => ({ uid: token }) },
}));
vi.mock('../agents/reader');
vi.mock('../agents/rule-extractor');
vi.mock('../agents/scenario-fuzzer');
vi.mock('../agents/trap-writer', async (original) => ({
  ...(await original<typeof import('../agents/trap-writer')>()),
  writeTraps: vi.fn(async () => []),
}));
vi.mock('../agents/expectation-judge', async (original) => ({
  ...(await original<typeof import('../agents/expectation-judge')>()),
  judge: vi.fn(),
}));

// The law lookup has its own tests.
vi.mock('../legal/research');

const reader = vi.mocked(readDocument);
const law = vi.mocked(lookUpLaw);
const ruleWriter = vi.mocked(proposeRules);
// The tests upload a single page, so the fixture's clauses are put on it.
const onePagePolicy = ReaderOutput.parse({
  ...policy,
  clauses: policy.clauses.map((clause) => ({ ...clause, page: 1 })),
});
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const TODAY = new Date().toISOString().slice(0, 10);

const upload = (uid: string, analysisId: string, name: string) =>
  bucket().file(`uploads/${uid}/${analysisId}/${name}`).save(jpeg);

const post = (path: string, uid: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${uid}` },
    body: JSON.stringify(body),
  });

// What the user says the document is before uploading it.
const pick = { docType: 'insurance', jurisdiction: 'ID' };

const create = (
  uid: string,
  analysisId: string,
  files = ['0-page.jpg'],
  said = pick,
) => post('/v1/analyses', uid, { analysisId, files, ...said });

const stored = async (analysisId: string) =>
  (await db.doc(`analyses/${analysisId}`).get()).data();
const startedToday = async (uid: string) =>
  (await db.doc(`users/${uid}/usage/${TODAY}`).get()).data()?.started ?? 0;

beforeEach(async () => {
  await db.doc('system/budget').delete();
  await db.recursiveDelete(db.collection('analyses'));
  await db.recursiveDelete(db.collection('users'));
  await bucket().deleteFiles({ prefix: 'uploads/' });
  reader.mockReset();
  reader.mockResolvedValue(onePagePolicy);
  vi.mocked(proposeFacts).mockResolvedValue(proposedFacts.facts as Fact[]);
  ruleWriter.mockReset();
  ruleWriter.mockResolvedValue(proposedRules.rules);
  vi.mocked(proposeScenarios).mockResolvedValue(proposedScenarios.scenarios);
  vi.mocked(tellBoundaries).mockResolvedValue([]);
  law.mockReset();
  law.mockResolvedValue({});
  vi.mocked(judge).mockResolvedValue([
    { id: 's-002', result: 'fine', reason: 'An illness is covered.' },
  ]);
  await upload('alice', 'analysis-1', '0-page.jpg');
});

test('a policy is read into details and clauses and waits for confirmation', async () => {
  const res = await create('alice', 'analysis-1');

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    analysisId: 'analysis-1',
    status: 'awaiting_confirmation',
  });
  expect(await stored('analysis-1')).toMatchObject({
    ownerUid: 'alice',
    status: 'awaiting_confirmation',
    meta: { docType: 'insurance', jurisdiction: 'ID', pageCount: 1 },
    counts: { clauses: 3 },
    versions: { reading: versions },
  });
  const clauses = await db.collection('analyses/analysis-1/clauses').get();
  expect(clauses.docs.map((doc) => doc.id)).toEqual([
    'c-001',
    'c-002',
    'c-003',
  ]);
  expect(await startedToday('alice')).toBe(1);
});

test("the user's type and country are stored, and the reader's beside them", async () => {
  await create('alice', 'analysis-1', undefined, {
    docType: 'loan',
    jurisdiction: 'JP',
  });

  expect(await stored('analysis-1')).toMatchObject({
    meta: {
      docType: 'loan',
      jurisdiction: 'JP',
      lawChecked: false,
      detected: { docType: 'insurance', jurisdiction: 'ID' },
    },
  });
});

test.each([
  ['without a type', { jurisdiction: 'ID' }],
  ['without a country', { docType: 'insurance' }],
  [
    'from a country outside the list',
    { docType: 'insurance', jurisdiction: 'US' },
  ],
])('an upload %s is refused before anything is read', async (_, said) => {
  const res = await post('/v1/analyses', 'alice', {
    analysisId: 'analysis-1',
    files: ['0-page.jpg'],
    ...said,
  });

  expect(res.status).toBe(400);
  expect(reader).not.toHaveBeenCalled();
  expect(await startedToday('alice')).toBe(0);
});

test('the reader gets the pages in the order the user gave', async () => {
  await upload('alice', 'analysis-1', '1-second.jpg');

  await create('alice', 'analysis-1', ['1-second.jpg', '0-page.jpg']);

  const [files, pageCount] = reader.mock.calls[0]!;
  expect(files.map((file) => file.name)).toEqual([
    '1-second.jpg',
    '0-page.jpg',
  ]);
  expect(pageCount).toBe(2);
});

test('a receipt is rejected and does not count against the day', async () => {
  reader.mockResolvedValue(ReaderOutput.parse(receipt));

  const res = await create('alice', 'analysis-1');

  expect(await res.json()).toMatchObject({ status: 'rejected' });
  expect(await stored('analysis-1')).toMatchObject({
    status: 'rejected',
    meta: null,
  });
  expect(await startedToday('alice')).toBe(0);
});

test('a reader failure names the stage and does not count against the day', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  reader.mockRejectedValue(new Error('model unavailable'));

  const res = await create('alice', 'analysis-1');

  expect(await res.json()).toMatchObject({ status: 'failed' });
  expect(await stored('analysis-1')).toMatchObject({
    status: 'failed',
    stage: 'reading',
  });
  expect(await startedToday('alice')).toBe(0);
  logged.mockRestore();
});

test('more clauses than one batch holds are all stored', async () => {
  const clause = policy.clauses[0]!;
  reader.mockResolvedValue(
    ReaderOutput.parse({
      ...policy,
      clauses: Array.from({ length: 501 }, () => ({ ...clause, page: 1 })),
    }),
  );

  await create('alice', 'analysis-1');

  const clauses = await db
    .collection('analyses/analysis-1/clauses')
    .count()
    .get();
  expect(clauses.data().count).toBe(501);
  expect(await stored('analysis-1')).toMatchObject({
    counts: { clauses: 501 },
  });
});

test('clauses are not kept when the details could not be stored', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const update = vi
    .spyOn(DocumentReference.prototype, 'update')
    .mockRejectedValueOnce(new Error('write refused'));

  const res = await create('alice', 'analysis-1');

  expect(await res.json()).toMatchObject({ status: 'failed' });
  expect(await stored('analysis-1')).toMatchObject({ status: 'failed' });
  const clauses = await db
    .collection('analyses/analysis-1/clauses')
    .count()
    .get();
  expect(clauses.data().count).toBe(0);
  update.mockRestore();
  logged.mockRestore();
});

test('the request is answered even if the failure cannot be stored', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  reader.mockRejectedValue(new Error('model unavailable'));
  const update = vi
    .spyOn(DocumentReference.prototype, 'update')
    .mockRejectedValueOnce(new Error('write refused'));

  const res = await create('alice', 'analysis-1');

  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({ status: 'failed' });
  expect(await startedToday('alice')).toBe(0);
  update.mockRestore();
  logged.mockRestore();
});

test.each([
  ['no body', undefined],
  ['no files', { analysisId: 'analysis-1', files: [] }],
  [
    'a file name that leaves the folder',
    { analysisId: 'analysis-1', files: ['../../bob/analysis-9/0-page.jpg'] },
  ],
])('a request with %s is refused', async (_name, body) => {
  const res = await post('/v1/analyses', 'alice', body);

  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    error: { code: 'invalid_request' },
  });
  expect(reader).not.toHaveBeenCalled();
});

test('a file that was never uploaded is refused', async () => {
  const res = await create('alice', 'analysis-1', ['0-other.jpg']);

  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: { code: 'file_missing' } });
  expect(await stored('analysis-1')).toBeUndefined();
  expect(await startedToday('alice')).toBe(0);
});

test("one user cannot start an analysis from another user's files", async () => {
  const res = await create('bob', 'analysis-1');

  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: { code: 'file_missing' } });
});

test('a file that is not a document or image is refused', async () => {
  await bucket()
    .file('uploads/alice/analysis-1/0-notes.pdf')
    .save(Buffer.from('just text'));

  const res = await create('alice', 'analysis-1', ['0-notes.pdf']);

  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    error: { code: 'unsupported_type' },
  });
});

test('an analysis cannot be started twice', async () => {
  await create('alice', 'analysis-1');

  const res = await create('alice', 'analysis-1');

  expect(res.status).toBe(409);
  expect(await startedToday('alice')).toBe(1);
  expect(reader).toHaveBeenCalledTimes(1);
});

test('the eleventh analysis of the day is refused with the reset time', async () => {
  await db.doc(`users/alice/usage/${TODAY}`).set({ started: 10 });

  const res = await create('alice', 'analysis-1');

  expect(res.status).toBe(429);
  const { error } = ErrorEnvelope.parse(await res.json());
  expect(error.code).toBe('daily_limit');
  expect(new Date(error.resetAt ?? 0).getTime()).toBeGreaterThan(Date.now());
  expect(error.resetAt).toMatch(/T00:00:00\.000Z$/);
  expect(await stored('analysis-1')).toBeUndefined();
  expect(reader).not.toHaveBeenCalled();
});

const confirmation = {
  docType: 'loan',
  jurisdiction: 'SG',
  userRole: 'insured',
};
const confirm = (uid: string, analysisId: string, body = confirmation) =>
  post(`/v1/analyses/${analysisId}/confirm`, uid, body);

test('a new analysis records when its daily slot was taken', async () => {
  await create('alice', 'analysis-1');

  const { reservedAt } = (await stored('analysis-1'))!;

  expect(Date.now() - reservedAt.toDate().getTime()).toBeLessThan(60_000);
});

test('the owner confirms the details and the rules are derived', async () => {
  await create('alice', 'analysis-1');

  const res = await confirm('alice', 'analysis-1');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    analysisId: 'analysis-1',
    status: 'done',
  });
  expect(await stored('analysis-1')).toMatchObject({
    status: 'done',
    counts: { clauses: 3, rules: 3, scenarios: 3, fine: 1, bad: 1 },
    meta: {
      docType: 'loan',
      jurisdiction: 'SG',
      lawChecked: true,
      userRole: 'insured',
      title: policy.title,
    },
  });
});

test('a rules stage that fails is reported as a status, not as an error', async () => {
  await create('alice', 'analysis-1');
  ruleWriter.mockRejectedValue(new Error('model unavailable'));

  const res = await confirm('alice', 'analysis-1');

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'failed' });
  expect(await stored('analysis-1')).toMatchObject({
    status: 'failed',
    stage: 'extracting_rules',
  });
  expect(await startedToday('alice')).toBe(0);
});

test('a jurisdiction without a law check is stored as unchecked', async () => {
  await create('alice', 'analysis-1');

  await confirm('alice', 'analysis-1', { ...confirmation, jurisdiction: 'MY' });

  expect(await stored('analysis-1')).toMatchObject({
    meta: { jurisdiction: 'MY', lawChecked: false },
  });
});

test("another user's analysis looks like one that does not exist", async () => {
  await create('alice', 'analysis-1');

  const theirs = await confirm('bob', 'analysis-1');
  const missing = await confirm('bob', 'analysis-404');

  expect(theirs.status).toBe(404);
  expect(await theirs.json()).toEqual(await missing.json());
  expect(await stored('analysis-1')).toMatchObject({
    status: 'awaiting_confirmation',
    meta: { userRole: null },
  });
});

test('the role must be one of the parties in the document', async () => {
  await create('alice', 'analysis-1');

  const res = await confirm('alice', 'analysis-1', {
    ...confirmation,
    userRole: 'landlord',
  });

  expect(res.status).toBe(400);
  expect(await stored('analysis-1')).toMatchObject({
    status: 'awaiting_confirmation',
  });
});

test('an analysis is confirmed only once', async () => {
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');

  expect((await confirm('alice', 'analysis-1')).status).toBe(409);
});

test('a rejected analysis cannot be confirmed', async () => {
  reader.mockResolvedValue(ReaderOutput.parse(receipt));
  await create('alice', 'analysis-1');

  expect((await confirm('alice', 'analysis-1')).status).toBe(409);
});

const retry = (uid: string, analysisId: string) =>
  post(`/v1/analyses/${analysisId}/retry`, uid, {});
const ids = async (analysisId: string, name: string) =>
  (await db.collection(`analyses/${analysisId}/${name}`).get()).docs.map(
    (doc) => doc.id,
  );

test('a run that failed in a stage resumes there and finishes', async () => {
  await create('alice', 'analysis-1');
  ruleWriter.mockRejectedValueOnce(new Error('model unavailable'));
  await confirm('alice', 'analysis-1');
  expect(await startedToday('alice')).toBe(0);

  const res = await retry('alice', 'analysis-1');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    analysisId: 'analysis-1',
    status: 'done',
  });
  expect(await stored('analysis-1')).toMatchObject({
    status: 'done',
    counts: { rules: 3 },
  });
  expect((await stored('analysis-1'))!.stage).toBeUndefined();
  // A run that went on counts against the day again.
  expect(await startedToday('alice')).toBe(1);
});

test.each([
  ['extracting_rules', 'rules'],
  ['fuzzing', 'scenarios'],
  ['comparing', 'traps'],
] as const)(
  'a retry at %s leaves nothing of the failed attempt in %s',
  async (stage, name) => {
    await create('alice', 'analysis-1');
    await confirm('alice', 'analysis-1');
    await db.doc(`analyses/analysis-1/${name}/stale`).set({ id: 'stale' });
    await db.doc('analyses/analysis-1').update({ status: 'failed', stage });

    await retry('alice', 'analysis-1');

    expect(await stored('analysis-1')).toMatchObject({ status: 'done' });
    expect(await ids('analysis-1', name)).not.toContain('stale');
  },
);

test.each([
  ['a failed reading', { status: 'failed', stage: 'reading' }],
  ['a finished run', { status: 'done' }],
  ['a run that is going on', { status: 'fuzzing' }],
])('%s cannot be retried', async (_, state) => {
  await create('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update(state);

  const res = await retry('alice', 'analysis-1');

  expect(res.status).toBe(409);
  expect(await stored('analysis-1')).toMatchObject(state);
});

test("another user's analysis cannot be retried", async () => {
  await create('alice', 'analysis-1');
  await db
    .doc('analyses/analysis-1')
    .update({ status: 'failed', stage: 'fuzzing' });

  const res = await retry('bob', 'analysis-1');

  expect(res.status).toBe(404);
  expect(await stored('analysis-1')).toMatchObject({ status: 'failed' });
});

test('a retry needs a slot of the day like a new analysis', async () => {
  await create('alice', 'analysis-1');
  ruleWriter.mockRejectedValueOnce(new Error('model unavailable'));
  await confirm('alice', 'analysis-1');
  await db.doc(`users/alice/usage/${TODAY}`).set({ started: 10 });

  const res = await retry('alice', 'analysis-1');

  expect(res.status).toBe(429);
  expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('daily_limit');
  expect(await stored('analysis-1')).toMatchObject({
    status: 'failed',
    stage: 'extracting_rules',
  });
});

test('a retry that fails again gives its slot back', async () => {
  await create('alice', 'analysis-1');
  ruleWriter.mockRejectedValue(new Error('model unavailable'));
  await confirm('alice', 'analysis-1');

  const res = await retry('alice', 'analysis-1');

  expect(await res.json()).toMatchObject({ status: 'failed' });
  expect(await startedToday('alice')).toBe(0);
});

test('a retry whose cleanup fails ends at that stage and gives its slot back once', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  await create('alice', 'analysis-1');
  ruleWriter.mockRejectedValueOnce(new Error('model unavailable'));
  await confirm('alice', 'analysis-1');
  // Another run has a slot, so a second refund would be visible.
  await db.doc(`users/alice/usage/${TODAY}`).update({ started: 1 });
  const cleared = vi
    .spyOn(Query.prototype, 'get')
    .mockRejectedValueOnce(new Error('delete refused'));
  try {
    const res = await retry('alice', 'analysis-1');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'failed' });
    const data = (await stored('analysis-1'))!;
    expect(data).toMatchObject({ status: 'failed', stage: 'extracting_rules' });
    expect(data.clearFirst).toBeUndefined();
    expect(data.lease).toBeUndefined();
    expect(await startedToday('alice')).toBe(1);
    expect(await runStage('analysis-1', { runId: data.runId })).toEqual({
      status: 'failed',
    });
    expect(await startedToday('alice')).toBe(1);
  } finally {
    cleared.mockRestore();
    logged.mockRestore();
  }
});

test('a retry at comparing starts without the grade of the failed attempt', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(judge).mockRejectedValue(new Error('model unavailable'));
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update({
    grade: 'F',
    points: 0,
    confidence: 'low',
    'counts.judged': 9,
    'counts.traps': 9,
  });

  await retry('alice', 'analysis-1');

  const analysis = (await stored('analysis-1'))!;
  expect(analysis).toMatchObject({ status: 'failed', stage: 'comparing' });
  expect([analysis.grade, analysis.points, analysis.confidence]).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
  expect(analysis.counts.judged).toBeUndefined();
  expect(analysis.counts.traps).toBeUndefined();
  logged.mockRestore();
});

const cancel = (uid: string, analysisId: string) =>
  post(`/v1/analyses/${analysisId}/cancel`, uid, {});

test('a run that is going on can be asked to stop, without putting off a delete', async () => {
  await create('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update({ status: 'fuzzing' });
  const before = (await stored('analysis-1'))!.updatedAt;

  const res = await cancel('alice', 'analysis-1');

  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({
    analysisId: 'analysis-1',
    status: 'fuzzing',
  });
  expect(await stored('analysis-1')).toMatchObject({
    status: 'fuzzing',
    cancelRequested: true,
    updatedAt: before,
  });
});

test.each([
  ['awaiting confirmation', { status: 'awaiting_confirmation' }],
  ['failed', { status: 'failed', stage: 'fuzzing' }],
  ['done', { status: 'done' }],
])('a run that is %s cannot be asked to stop', async (_, state) => {
  await create('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update(state);

  expect((await cancel('alice', 'analysis-1')).status).toBe(409);
  expect((await stored('analysis-1'))!.cancelRequested).toBeUndefined();
});

test("another user's run cannot be stopped", async () => {
  await create('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update({ status: 'fuzzing' });

  expect((await cancel('bob', 'analysis-1')).status).toBe(404);
  expect((await stored('analysis-1'))!.cancelRequested).toBeUndefined();
});

test('a retry of a stopped run clears the stop and carries on', async () => {
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update({
    status: 'failed',
    stage: 'comparing',
    error: 'cancelled',
  });

  await retry('alice', 'analysis-1');

  const data = (await stored('analysis-1'))!;
  expect(data.status).toBe('done');
  expect(data.error).toBeUndefined();
});

const stalledFor = (seconds: number) => ({
  status: 'comparing',
  runId: 'run-that-died',
  updatedAt: Timestamp.fromMillis(Date.now() - seconds * 1000),
});

test('a run that stopped responding can be retried, on the slot it already has', async () => {
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update(stalledFor(901));
  const before = await startedToday('alice');

  const res = await retry('alice', 'analysis-1');

  expect(res.status).toBe(200);
  const data = (await stored('analysis-1'))!;
  expect(data.status).toBe('done');
  expect(data.runId).not.toBe('run-that-died');
  expect(await startedToday('alice')).toBe(before);
});

test('a run that is still being heard from cannot be retried', async () => {
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update(stalledFor(60));

  expect((await retry('alice', 'analysis-1')).status).toBe(409);
});

test('a run that stopped responding stops at once when asked, and gives its slot back', async () => {
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update(stalledFor(901));
  const before = await startedToday('alice');

  const res = await cancel('alice', 'analysis-1');

  expect(res.status).toBe(202);
  expect(await stored('analysis-1')).toMatchObject({
    status: 'failed',
    stage: 'comparing',
    error: 'cancelled',
  });
  expect(await startedToday('alice')).toBe(before - 1);
});

const unavailable: LegalFinding = {
  status: 'no_finding',
  reasoning: '',
  citations: [],
  error: 'lookup_unavailable',
};
const permitted: LegalFinding = {
  status: 'permitted',
  reasoning: 'The regulation allows a waiting period.',
  citations: [
    {
      instrument: 'POJK 22/2023',
      section: 'Pasal 18',
      quote: 'Pelaku usaha dilarang membuat atau mencantumkan klausula baku',
      url: 'https://peraturan.bpk.go.id/Download/1/pojk.pdf',
    },
  ],
  error: null,
};

test('a finished analysis whose law lookup was unavailable checks the law again', async () => {
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');
  await db
    .doc('analyses/analysis-1/findings/r-002')
    .set({ ruleId: 'r-002', ...unavailable });
  law.mockImplementation(async ({ stored, save }) => {
    if (stored['r-002']?.error) await save('r-002', permitted);
    return { 'r-002': permitted };
  });

  const res = await retry('alice', 'analysis-1');

  expect(await res.json()).toEqual({
    analysisId: 'analysis-1',
    status: 'done',
  });
  expect(law).toHaveBeenLastCalledWith(
    expect.objectContaining({ stored: { 'r-002': unavailable } }),
  );
  expect(
    (await db.doc('analyses/analysis-1/findings/r-002').get()).data(),
  ).toEqual({ ruleId: 'r-002', ...permitted });
  expect(await stored('analysis-1')).toMatchObject({ status: 'done' });
  // Checking again is a run like any other and takes a slot of the day.
  expect(await startedToday('alice')).toBe(2);
});

test('a finished analysis whose law was looked up cannot be retried', async () => {
  await create('alice', 'analysis-1');
  await confirm('alice', 'analysis-1');
  await db
    .doc('analyses/analysis-1/findings/r-002')
    .set({ ruleId: 'r-002', ...permitted });

  expect((await retry('alice', 'analysis-1')).status).toBe(409);
  expect(await startedToday('alice')).toBe(1);
});

const remove = (uid: string, analysisId: string) =>
  app.request(`/v1/analyses/${analysisId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${uid}` },
  });
const SUBCOLLECTIONS = ['clauses', 'rules', 'scenarios', 'findings', 'traps'];
const files = async (uid: string, analysisId: string) =>
  (await bucket().getFiles({ prefix: `uploads/${uid}/${analysisId}/` }))[0].map(
    (file) => file.name,
  );

// A stored analysis with a record in every sub-collection and two files, as
// a run leaves it. Written directly: delete does not care how it got there.
const seed = async (
  analysisId: string,
  state: Record<string, unknown> = { status: 'done' },
) => {
  await db.doc(`analyses/${analysisId}`).set({
    ownerUid: 'alice',
    meta: null,
    updatedAt: Timestamp.now(),
    ...state,
  });
  for (const name of SUBCOLLECTIONS) {
    await db.doc(`analyses/${analysisId}/${name}/x-1`).set({ id: 'x-1' });
  }
  await upload('alice', analysisId, '0-page.jpg');
  await upload('alice', analysisId, '1-page.jpg');
};
const left = async (analysisId: string) => ({
  analysis: (await db.doc(`analyses/${analysisId}`).get()).exists,
  records: (
    await Promise.all(SUBCOLLECTIONS.map((name) => ids(analysisId, name)))
  ).flat().length,
  files: (await files('alice', analysisId)).length,
});

test('the owner deletes an analysis with all its records and files', async () => {
  await seed('analysis-1');
  await seed('analysis-2');

  const res = await remove('alice', 'analysis-1');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ analysisId: 'analysis-1' });
  expect(await left('analysis-1')).toEqual({
    analysis: false,
    records: 0,
    files: 0,
  });
  // The user's other analysis is untouched.
  expect(await left('analysis-2')).toEqual({
    analysis: true,
    records: 5,
    files: 2,
  });
});

test("another user's analysis looks like one that does not exist to delete", async () => {
  await seed('analysis-1');

  const theirs = await remove('bob', 'analysis-1');
  const missing = await remove('bob', 'analysis-404');
  const invalid = await remove('alice', 'a/b');

  expect(theirs.status).toBe(404);
  expect(await theirs.json()).toEqual(await missing.json());
  expect(missing.status).toBe(404);
  expect(invalid.status).toBe(404);
  expect(await left('analysis-1')).toEqual({
    analysis: true,
    records: 5,
    files: 2,
  });
});

test('a run that is going on is not deleted', async () => {
  await seed('analysis-1', { status: 'fuzzing' });

  const res = await remove('alice', 'analysis-1');

  expect(res.status).toBe(409);
  expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('conflict');
  expect(await left('analysis-1')).toMatchObject({ analysis: true, files: 2 });
});

test('a run not heard from for longer than any stage takes is deleted', async () => {
  const stale = Timestamp.fromMillis(
    Date.now() - (RUN_STALE_SECONDS + 60) * 1000,
  );
  await seed('analysis-1', { status: 'running', updatedAt: stale });

  expect((await remove('alice', 'analysis-1')).status).toBe(200);
  expect((await left('analysis-1')).analysis).toBe(false);
});

test('a rejected analysis, which has no details, is deleted', async () => {
  await seed('analysis-1', { status: 'rejected' });

  expect((await remove('alice', 'analysis-1')).status).toBe(200);
  expect(await left('analysis-1')).toEqual({
    analysis: false,
    records: 0,
    files: 0,
  });
});

test('a deleted analysis cannot be confirmed or retried, and its slot stays used', async () => {
  await create('alice', 'analysis-1');
  await remove('alice', 'analysis-1');

  expect((await confirm('alice', 'analysis-1')).status).toBe(404);
  expect((await retry('alice', 'analysis-1')).status).toBe(404);
  // Otherwise deleting would reset the daily limit (F-UP-5).
  expect(await startedToday('alice')).toBe(1);
});

test('a paused upload takes no slot and does not read files or call a model', async () => {
  await db.doc('system/budget').set({ paused: true });

  // No such upload exists, so reading the files would return file_missing.
  const res = await create('alice', 'analysis-2');

  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({
    error: {
      code: 'paused',
      message: 'New analyses are paused for now. Please try again later.',
    },
  });
  expect(await stored('analysis-2')).toBeUndefined();
  expect(await startedToday('alice')).toBe(0);
  expect((await db.doc(`users/alice/usage/${TODAY}`).get()).exists).toBe(false);
  expect(reader).not.toHaveBeenCalled();
});

test.each(['confirm', 'retry'])(
  'a paused %s leaves the analysis and its slot unchanged',
  async (action) => {
    await create('alice', 'analysis-1');
    if (action === 'retry') {
      await db
        .doc('analyses/analysis-1')
        .update({ status: 'failed', stage: 'fuzzing' });
      await db
        .doc(`users/alice/usage/${TODAY}`)
        .set({ started: 0, attempts: 1 });
    }
    const before = await stored('analysis-1');
    const usage = (await db.doc(`users/alice/usage/${TODAY}`).get()).data();
    const fuzzCalls = vi.mocked(proposeScenarios).mock.calls.length;
    await db.doc('system/budget').set({ paused: true });

    const res =
      action === 'confirm'
        ? await confirm('alice', 'analysis-1')
        : await retry('alice', 'analysis-1');

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'paused' } });
    expect(await stored('analysis-1')).toEqual(before);
    expect((await db.doc(`users/alice/usage/${TODAY}`).get()).data()).toEqual(
      usage,
    );
    expect(ruleWriter).not.toHaveBeenCalled();
    expect(proposeScenarios).toHaveBeenCalledTimes(fuzzCalls);
  },
);

test.each([
  '/v1/analyses',
  '/v1/analyses/invalid!/confirm',
  '/v1/analyses/invalid!/retry',
])('a pause is checked before parsing a request to %s', async (path) => {
  await db.doc('system/budget').set({ paused: true });
  const res = await post(path, 'alice', null);
  expect(res.status).toBe(503);
  expect(await startedToday('alice')).toBe(0);
});

test('cancel and delete still work during a budget pause', async () => {
  await create('alice', 'analysis-1');
  await db.doc('analyses/analysis-1').update({ status: 'fuzzing' });
  await seed('analysis-2');
  await db.doc('system/budget').set({ paused: true });

  expect((await cancel('alice', 'analysis-1')).status).toBe(202);
  expect(await stored('analysis-1')).toMatchObject({ cancelRequested: true });
  expect((await remove('alice', 'analysis-2')).status).toBe(200);
  expect(await stored('analysis-2')).toBeUndefined();
});
