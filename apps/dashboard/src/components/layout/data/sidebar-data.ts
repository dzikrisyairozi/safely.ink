import { FileSearch } from 'lucide-react';
import { type SidebarData } from '../types';

export const sidebarData: SidebarData = {
  user: {
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    avatar: '',
  },
  navGroups: [
    {
      title: 'nav.groups.general',
      items: [{ title: 'nav.newAnalysis', url: '/', icon: FileSearch }],
    },
  ],
};
