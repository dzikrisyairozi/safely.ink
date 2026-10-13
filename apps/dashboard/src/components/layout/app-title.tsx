import { Link } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from '@repo/i18n';
import { cn } from '@repo/ui/lib/utils';

export function AppTitle({ className }: { className?: string }) {
  const { t } = useTranslation('dashboard');

  return (
    <Link
      to="/"
      className={cn('flex items-center gap-2.5 font-semibold', className)}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary">
        <ShieldCheck className="size-5 text-primary-foreground" />
      </div>
      <span className="truncate font-serif text-xl tracking-tight">
        {t('app.name')}
      </span>
    </Link>
  );
}
