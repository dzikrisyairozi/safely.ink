import { beforeEach, expect, test, vi } from 'vitest';
import { DocumentReference } from 'firebase-admin/firestore';
import {
  ErrorEnvelope,
  ReaderOutput,
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

test('a retry that cannot clear its stage still gives its slot back', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  await create('alice', 'analysis-1');
  ruleWriter.mockRejectedValueOnce(new Error('model unavailable'));
  await confirm('alice', 'analysis-1');
  const cleared = vi
    .spyOn(db, 'recursiveDelete')
    .mockRejectedValueOnce(new Error('delete refused'));
  const update = vi
    .spyOn(DocumentReference.prototype, 'update')
    .mockRejectedValueOnce(new Error('write refused'));

  const res = await retry('alice', 'analysis-1');

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'failed' });
  expect(await startedToday('alice')).toBe(0);
  cleared.mockRestore();
  update.mockRestore();
  logged.mockRestore();
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
