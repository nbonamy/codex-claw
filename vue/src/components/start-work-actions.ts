import { IconFolder as FolderIcon, IconLink as LinkIcon } from '@tabler/icons-vue';
import { GitHubIcon } from '../shared/icons/app-icons';
import type { AppMenuItem } from '../shared/menu/app-menu';

export type StartWorkAction = 'github' | 'local' | 'url';

export const startWorkMenuItems: AppMenuItem[] = [
  { id: 'local', type: 'action', label: 'Local folder or repository…', icon: FolderIcon },
  { id: 'github', type: 'action', label: 'GitHub repository…', icon: GitHubIcon },
  { id: 'url', type: 'action', label: 'Repository URL…', icon: LinkIcon },
];

export function isStartWorkAction(action: string): action is StartWorkAction {
  return action === 'local' || action === 'github' || action === 'url';
}
