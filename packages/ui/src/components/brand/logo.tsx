import { cn } from '@repo/ui/lib/utils';
import { Pangolin } from './pangolin';

/** Mark and wordmark. Size it with the font size of `className`. */
export function Logo({
  layout = 'horizontal',
  className,
}: {
  layout?: 'horizontal' | 'stacked';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center',
        layout === 'stacked' ? 'flex-col gap-1' : 'gap-[0.4em]',
        className,
      )}
    >
      <Pangolin className="h-[1.5em] w-auto shrink-0" />
      <span className="font-serif leading-none tracking-tight">safely.ink</span>
    </span>
  );
}
