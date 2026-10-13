import { FileSearch } from 'lucide-react';
import { type SidebarData } from '../types';

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'nav.groups.general',
      items: [{ title: 'nav.newAnalysis', url: '/', icon: FileSearch }],
    },
  ],
};
