import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { toast } from 'sonner';
import { useTranslation } from '@repo/i18n';
import { Button } from '@repo/ui/components/ui/button';
import { auth } from '../../../../lib/firebase';

// The user backing out of the popup is not a failure worth a message.
const DISMISSED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

export function UserAuthForm({ redirectTo }: { redirectTo?: string }) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate({ to: redirectTo || '/' });
    } catch (error) {
      setIsSigningIn(false);
      const code = (error as { code?: string }).code ?? '';
      if (!DISMISSED.includes(code)) toast.error(t('signIn.failed'));
    }
  };

  return (
    <Button className="w-full" disabled={isSigningIn} onClick={signIn}>
      {t('signIn.google')}
    </Button>
  );
}
