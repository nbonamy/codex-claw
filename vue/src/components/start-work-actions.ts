import { IconFolder as FolderIcon, IconLink as LinkIcon } from '@tabler/icons-vue';
import { GitHubIcon } from '../shared/icons/app-icons';
import type { AppMenuItem } from '../shared/menu/app-menu';

export type StartWorkAction = 'github' | 'local' | 'url';

export function startWorkMenuItems(t: (key: string) => string): AppMenuItem[] {
  return [
    { id: 'local', type: 'action', label: t('startWork.localFolder'), icon: FolderIcon },
    { id: 'github', type: 'action', label: t('startWork.githubRepository'), icon: GitHubIcon },
    { id: 'url', type: 'action', label: t('startWork.repositoryUrl'), icon: LinkIcon },
  ];
}

export function isStartWorkAction(action: string): action is StartWorkAction {
  return action === 'local' || action === 'github' || action === 'url';
}
