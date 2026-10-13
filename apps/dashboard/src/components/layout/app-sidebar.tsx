import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@repo/ui/components/ui/sidebar';
import { NavGroup } from './nav-group';
import { NavUser } from './nav-user';
import { AppTitle } from './app-title';
import { sidebarData } from './data/sidebar-data';
import { useCurrentUser } from '../../hooks/use-current-user';

export function AppSidebar() {
  const user = useCurrentUser();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <AppTitle className="p-2" />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
