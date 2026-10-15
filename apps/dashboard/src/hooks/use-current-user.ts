import { type NavUser } from '../components/layout/types';
import { useAuthStore } from '../stores/auth-store';

export function useCurrentUser(): NavUser {
  const user = useAuthStore((state) => state.user);
  return {
    name: user?.name ?? '',
    email: user?.email ?? '',
    avatar: user?.photoURL ?? '',
  };
}
