import { type ComponentProps } from 'react';
import { cn } from '@repo/ui/lib/utils';

export function Main({
  fixed,
  className,
  children,
  ...props
}: ComponentProps<'main'> & { fixed?: boolean }) {
  return (
    <main
      id="content"
      className={cn(
        'relative flex-1',
        fixed
          ? 'flex min-h-0 flex-col overflow-hidden'
          : 'overflow-y-auto overflow-x-hidden p-3 pb-20 sm:p-6 lg:p-8',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'relative z-10',
          fixed
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500',
        )}
      >
        {children}
      </div>
    </main>
  );
}
