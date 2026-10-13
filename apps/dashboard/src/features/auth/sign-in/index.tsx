import { useTranslation } from '@repo/i18n';
import { AuthLayout } from '../auth-layout';
import { UserAuthForm } from './components/user-auth-form';

export function SignIn({ redirectTo }: { redirectTo?: string }) {
  const { t } = useTranslation('dashboard');

  return (
    <AuthLayout title={t('signIn.title')} description={t('signIn.description')}>
      <UserAuthForm redirectTo={redirectTo} />
    </AuthLayout>
  );
}
