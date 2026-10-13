import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';

// Run through `pnpm test`, which starts the emulators; hosts come from the
// environment that `firebase emulators:exec` sets.
let env: RulesTestEnvironment;

// Denied requests are the point of this file; the SDK would log each one.
setLogLevel('silent');

const pdf = { contentType: 'application/pdf' };
const bytes = new Uint8Array([1, 2, 3]);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-safely-ink',
    firestore: { rules: readFileSync('../../firestore.rules', 'utf8') },
    storage: { rules: readFileSync('../../storage.rules', 'utf8') },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await setDoc(doc(db, 'analyses/a1'), { ownerUid: 'alice' });
    await setDoc(doc(db, 'analyses/a1/clauses/c1'), { text: 'clause' });
    await setDoc(doc(db, 'lawPages/p1'), { url: 'https://example.com' });
    await setDoc(doc(db, 'users/alice/usage/2026-10-13'), { started: 1 });
    await uploadBytes(
      ref(admin.storage(), 'uploads/alice/a1/0-lease.pdf'),
      bytes,
      pdf,
    );
  });
});

const alice = () => env.authenticatedContext('alice');
const bob = () => env.authenticatedContext('bob');
const anonymous = () => env.unauthenticatedContext();

describe('firestore: analyses', () => {
  test('owner reads their analysis and its sub-collections', async () => {
    const db = alice().firestore();

    await assertSucceeds(getDoc(doc(db, 'analyses/a1')));
    await assertSucceeds(getDoc(doc(db, 'analyses/a1/clauses/c1')));
    await assertSucceeds(getDocs(collection(db, 'analyses/a1/clauses')));
  });

  test('owner lists only their own analyses', async () => {
    const analyses = collection(alice().firestore(), 'analyses');

    const own = await assertSucceeds(
      getDocs(query(analyses, where('ownerUid', '==', 'alice'))),
    );
    expect(own.size).toBe(1);
    await assertFails(getDocs(analyses));
  });

  test('another user cannot read the analysis or its sub-collections', async () => {
    const db = bob().firestore();

    await assertFails(getDoc(doc(db, 'analyses/a1')));
    await assertFails(getDoc(doc(db, 'analyses/a1/clauses/c1')));
    await assertFails(getDocs(collection(db, 'analyses/a1/clauses')));
  });

  test('a signed-out client cannot read anything', async () => {
    const db = anonymous().firestore();

    await assertFails(getDoc(doc(db, 'analyses/a1')));
    await assertFails(getDoc(doc(db, 'analyses/a1/clauses/c1')));
  });

  test('no client can write, not even the owner', async () => {
    const db = alice().firestore();

    await assertFails(setDoc(doc(db, 'analyses/a2'), { ownerUid: 'alice' }));
    await assertFails(updateDoc(doc(db, 'analyses/a1'), { status: 'done' }));
    await assertFails(deleteDoc(doc(db, 'analyses/a1')));
    await assertFails(setDoc(doc(db, 'analyses/a1/clauses/c2'), { text: 'x' }));
  });
});

describe('firestore: server-only collections', () => {
  test('lawPages and users are closed to clients', async () => {
    const db = alice().firestore();
    const usage = doc(db, 'users/alice/usage/2026-10-13');

    await assertFails(getDoc(doc(db, 'lawPages/p1')));
    await assertFails(getDoc(usage));
    await assertFails(setDoc(usage, { started: 0 }));
  });
});

describe('storage: uploads', () => {
  test('owner uploads a PDF or an image to their folder and reads it back', async () => {
    const storage = alice().storage();

    await assertSucceeds(
      uploadBytes(ref(storage, 'uploads/alice/a2/0-nda.pdf'), bytes, pdf),
    );
    await assertSucceeds(
      uploadBytes(ref(storage, 'uploads/alice/a2/1-scan.png'), bytes, {
        contentType: 'image/png',
      }),
    );
    await assertSucceeds(
      getBytes(ref(storage, 'uploads/alice/a1/0-lease.pdf')),
    );
  });

  test('another user cannot read or write the folder', async () => {
    const storage = bob().storage();

    await assertFails(getBytes(ref(storage, 'uploads/alice/a1/0-lease.pdf')));
    await assertFails(
      uploadBytes(ref(storage, 'uploads/alice/a1/1-evil.pdf'), bytes, pdf),
    );
  });

  test('a signed-out client cannot read or write', async () => {
    const storage = anonymous().storage();

    await assertFails(getBytes(ref(storage, 'uploads/alice/a1/0-lease.pdf')));
    await assertFails(
      uploadBytes(ref(storage, 'uploads/alice/a1/1-x.pdf'), bytes, pdf),
    );
  });

  test.each(['image/jpeg', 'image/webp', 'image/heic'])(
    '%s is accepted',
    async (type) => {
      const file = ref(alice().storage(), `uploads/alice/a2/${type}`);

      await assertSucceeds(uploadBytes(file, bytes, { contentType: type }));
    },
  );

  test.each(['application/x-msdownload', 'image/svg+xml', 'image/gif'])(
    '%s is rejected',
    async (type) => {
      const file = ref(alice().storage(), `uploads/alice/a2/${type}`);

      await assertFails(uploadBytes(file, bytes, { contentType: type }));
    },
  );

  test('files over 30 MB are rejected', async () => {
    const file = ref(alice().storage(), 'uploads/alice/a2/0-big.pdf');

    await assertFails(
      uploadBytes(file, new Uint8Array(30 * 1024 * 1024 + 1), pdf),
    );
  });

  test('an existing file cannot be overwritten', async () => {
    const file = ref(alice().storage(), 'uploads/alice/a1/0-lease.pdf');

    await assertFails(uploadBytes(file, bytes, pdf));
  });
});
