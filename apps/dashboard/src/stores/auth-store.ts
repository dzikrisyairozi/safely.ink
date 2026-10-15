import { create } from 'zustand';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

export type AuthUser = {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
};

type AuthState = {
  user: AuthUser | null;
};

// A reactive mirror of Firebase Auth for components. Firebase keeps the
// session and the tokens; nothing is persisted here.
export const useAuthStore = create<AuthState>(() => ({ user: null }));

onAuthStateChanged(auth, (user) => {
  useAuthStore.setState({
    user: user && {
      uid: user.uid,
      name: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
    },
  });
});
