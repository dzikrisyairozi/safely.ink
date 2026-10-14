import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '@repo/i18n';
import { isDeletable, type Analysis } from '@repo/api-types';
import { Button } from '@repo/ui/components/ui/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { api, ApiError } from '../../lib/api';

/**
 * Deletes an analysis for good after the user confirms (F-HIST-2). The
 * screens that list it follow Firestore, so it drops out on its own.
 */
export function DeleteAnalysis({
  id,
  analysis,
  onDeleted,
}: {
  id: string;
  analysis: Pick<Analysis, 'status' | 'updatedAt'>;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once: a run that goes stale while the screen is open stays locked
  // until it is opened again.
  const [now] = useState(Date.now);
  // The same rule the API applies, so the button never offers a 409.
  const running = !isDeletable(analysis, now);

  const remove = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await api(`/v1/analyses/${id}`, { method: 'DELETE' });
      onDeleted?.();
    } catch (err) {
      setIsDeleting(false);
      // The run may have started between the screen and the click.
      setError(
        err instanceof ApiError && err.code === 'conflict'
          ? t('history.delete.running')
          : t('history.delete.failed'),
      );
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('history.delete.action')}
        title={running ? t('history.delete.running') : undefined}
        disabled={running || isDeleting}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('history.delete.title')}
        description={t('history.delete.description')}
        confirmText={t('history.delete.confirm')}
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
