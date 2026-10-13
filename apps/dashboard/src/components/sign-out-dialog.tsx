import { useNavigate } from '@tanstack/react-router';
import { signOut } from 'firebase/auth';
import { useTranslation } from '@repo/i18n';
import { ConfirmDialog } from './confirm-dialog';
import { auth } from '../lib/firebase';

export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('signOutDialog.title')}
      description={t('signOutDialog.description')}
      confirmText={t('signOutDialog.confirm')}
      onConfirm={async () => {
        await signOut(auth);
        onOpenChange(false);
        navigate({ to: '/sign-in' });
      }}
    />
  );
}
