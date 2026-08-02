import type { SidePanelMarkdownState, SidePanelSourceState } from './side-panel';

export type RightWorkspaceFileTab = `file:${string}`;
export type RightWorkspaceTab = 'review' | 'browser' | RightWorkspaceFileTab;
export type RightWorkspaceFilePanel = SidePanelMarkdownState | SidePanelSourceState;

export function rightWorkspaceFileTab(filePath: string): RightWorkspaceFileTab {
  return `file:${encodeURIComponent(filePath)}`;
}

export function isRightWorkspaceFileTab(tab: RightWorkspaceTab): tab is RightWorkspaceFileTab {
  return tab.startsWith('file:');
}
