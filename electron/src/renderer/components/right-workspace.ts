import type { SidePanelGitDiffState, SidePanelMarkdownState, SidePanelSourceState } from './side-panel';

export type RightWorkspaceFileTab = `file:${string}`;
export type RightWorkspaceDiffTab = `diff:${string}`;
export type RightWorkspaceTab = 'review' | 'browser' | RightWorkspaceFileTab | RightWorkspaceDiffTab;
export type RightWorkspaceFilePanel = SidePanelMarkdownState | SidePanelSourceState;
export type RightWorkspaceDiffPanel = SidePanelGitDiffState;

export function rightWorkspaceFileTab(filePath: string): RightWorkspaceFileTab {
  return `file:${encodeURIComponent(filePath)}`;
}

export function rightWorkspaceMarkdownTab(identifier: string): RightWorkspaceFileTab {
  return `file:markdown:${encodeURIComponent(identifier)}`;
}

export function isRightWorkspaceFileTab(tab: RightWorkspaceTab): tab is RightWorkspaceFileTab {
  return tab.startsWith('file:');
}

export function rightWorkspaceDiffTab(turnId: string, filePath: string): RightWorkspaceDiffTab {
  return `diff:${encodeURIComponent(`${turnId}\u0000${filePath}`)}`;
}

export function isRightWorkspaceDiffTab(tab: RightWorkspaceTab): tab is RightWorkspaceDiffTab {
  return tab.startsWith('diff:');
}
