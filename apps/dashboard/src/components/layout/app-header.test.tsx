import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarProvider } from '@repo/ui/components/ui/sidebar';
import { AppHeader } from './app-header';
import { SearchProvider } from '../../context/search-provider';

function Providers({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <SearchProvider>{children}</SearchProvider>
    </SidebarProvider>
  );
}

describe('AppHeader', () => {
  it('renders the shared Search/ThemeSwitch/ProfileDropdown cluster', () => {
    render(
      <Providers>
        <AppHeader />
      </Providers>,
    );

    expect(screen.getByText('Type a command or search...')).toBeTruthy();
  });

  it('offers a language switcher', () => {
    render(
      <Providers>
        <AppHeader />
      </Providers>,
    );

    expect(screen.getByLabelText('Switch language')).toBeTruthy();
  });
});
