import { useState } from 'react';
import { useTranslation } from '@repo/i18n';
import { ApiError } from '../../lib/api';

/**
 * Starts a retry and keeps what a button needs: whether it is starting, and
 * why it did not go through.
 */
export function useRetry(onRetry: () => Promise<void>) {
  const { t } = useTranslation('dashboard');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = async () => {
    setError(null);
    setIsStarting(true);
    try {
      // The request stays open for the whole run. Once it has started, the
      // status changes and the screen that asked is gone.
      await onRetry();
    } catch (err) {
      setIsStarting(false);
      if (err instanceof ApiError && err.code === 'daily_limit') {
        const resetAt = new Date(err.resetAt ?? '').toLocaleTimeString(
          undefined,
          { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
        );
        setError(t('upload.errors.daily_limit', { resetAt }));
      } else {
        setError(t('analysis.retry.failed'));
      }
    }
  };

  return { retry, isStarting, error };
}
