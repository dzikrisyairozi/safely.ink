import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import { Pangolin } from '@repo/ui/components/brand/pangolin';
import { cn } from '@repo/ui/lib/utils';

export function AppTitle({ className }: { className?: string }) {
  const { t } = useTranslation('dashboard');

  return (
    <Link
      to="/"
      className={cn('flex items-center gap-2.5 font-semibold', className)}
    >
      <Pangolin className="h-7 w-auto shrink-0" />
      <span className="truncate font-serif text-xl tracking-tight">
        {t('app.name')}
      </span>
    </Link>
  );
}
