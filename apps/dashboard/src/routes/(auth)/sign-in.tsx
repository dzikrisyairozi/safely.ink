import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignIn } from '../../features/auth/sign-in';
import { auth } from '../../lib/firebase';
import { redirectSearchSchema } from '../../lib/redirect-search-schema';

export const Route = createFileRoute('/(auth)/sign-in')({
  validateSearch: redirectSearchSchema,
  beforeLoad: async ({ search }) => {
    await auth.authStateReady();
    if (auth.currentUser) throw redirect({ to: search.redirect || '/' });
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { redirect } = Route.useSearch();
  return <SignIn redirectTo={redirect} />;
}
