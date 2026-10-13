import { LanguageSwitcher } from '@repo/i18n';
import { Header } from './header';
import { ProfileDropdown } from '../profile-dropdown';
import { Search } from '../search';
import { ThemeSwitch } from '../theme-switch';

/** The header cluster every authenticated route renders. */
export function AppHeader() {
  return (
    <Header>
      <Search />
      <div className="hidden lg:block">
        <LanguageSwitcher />
      </div>
      <ThemeSwitch />
      <ProfileDropdown />
    </Header>
  );
}
