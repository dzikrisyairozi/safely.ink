'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

// Follows the system until the visitor picks; the icon swaps by CSS, so the
// server render needs no knowledge of the theme.
export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Sun className="size-4 scale-100 rotate-0 transition-transform duration-500 dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-4 scale-0 rotate-90 transition-transform duration-500 dark:scale-100 dark:rotate-0" />
    </button>
  );
}
