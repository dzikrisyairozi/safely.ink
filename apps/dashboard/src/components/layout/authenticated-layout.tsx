import { Outlet } from '@tanstack/react-router';
import { SidebarInset, SidebarProvider } from '@repo/ui/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { SkipToMain } from '../skip-to-main';
import { CommandMenu } from '../command-menu';

export function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <SkipToMain />
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <CommandMenu />
    </SidebarProvider>
  );
}
