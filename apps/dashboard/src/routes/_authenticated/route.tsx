import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthenticatedLayout } from '../../components/layout/authenticated-layout';
import { auth } from '../../lib/firebase';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Wait for Firebase to restore the session, or a reload would bounce
    // a signed-in user through the sign-in page.
    await auth.authStateReady();
    if (!auth.currentUser) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});
