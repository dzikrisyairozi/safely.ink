import type { ReactNode } from 'react';
import { cn } from '@repo/ui/lib/utils';

/** A numbered section, like a clause: `§ 2` above a serif heading. */
export function Section({
  id,
  number,
  heading,
  lead,
  className,
  children,
}: {
  id?: string;
  number: number;
  heading: string;
  lead?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = `section-${number}`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('border-t border-border/60 py-20 md:py-28', className)}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          § {number}
        </p>
        <h2
          id={headingId}
          className="mt-3 max-w-3xl text-balance font-serif text-4xl leading-[1.05] tracking-tight md:text-5xl"
        >
          {heading}
        </h2>
        {lead && (
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            {lead}
          </p>
        )}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}
