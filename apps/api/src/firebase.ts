import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from './config';

// Application Default Credentials on Cloud Run. Locally the project ID alone
// is enough to verify ID tokens, so no key file is needed.
const firebase = initializeApp({
  projectId: config.GOOGLE_CLOUD_PROJECT,
  storageBucket: config.STORAGE_BUCKET,
});

export const auth = getAuth(firebase);
export const db = getFirestore(firebase);

// A function, because asking for the bucket throws when STORAGE_BUCKET is
// unset and the API should still start without it.
export const bucket = () => getStorage(firebase).bucket();
