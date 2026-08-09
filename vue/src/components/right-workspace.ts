import type { SidePanelGitDiffState, SidePanelImageState, SidePanelMarkdownState, SidePanelSourceState } from './side-panel';

export type RightWorkspaceFileTab = `file:${string}`;
export type RightWorkspaceDiffTab = `diff:${string}`;
export type RightWorkspaceImageTab = `image:${string}`;
export type RightWorkspaceSubagentTab = `subagent:${string}`;
export type RightWorkspaceTab = 'review' | 'browser' | 'plan' | RightWorkspaceFileTab | RightWorkspaceDiffTab | RightWorkspaceImageTab | RightWorkspaceSubagentTab;
export type RightWorkspaceFilePanel = SidePanelMarkdownState | SidePanelSourceState;
export type RightWorkspaceDiffPanel = SidePanelGitDiffState;
export type RightWorkspaceImagePanel = SidePanelImageState;

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

export function rightWorkspaceImageTab(identifier: string): RightWorkspaceImageTab {
  let hash = 2_166_136_261;
  for (let index = 0; index < identifier.length; index += 1) {
    hash ^= identifier.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `image:${identifier.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function isRightWorkspaceImageTab(tab: RightWorkspaceTab): tab is RightWorkspaceImageTab {
  return tab.startsWith('image:');
}

export function rightWorkspaceSubagentTab(conversationId: string): RightWorkspaceSubagentTab {
  return `subagent:${encodeURIComponent(conversationId)}`;
}

export function isRightWorkspaceSubagentTab(tab: RightWorkspaceTab): tab is RightWorkspaceSubagentTab {
  return tab.startsWith('subagent:');
}

export function rightWorkspaceSubagentConversationId(tab: RightWorkspaceSubagentTab): string {
  return decodeURIComponent(tab.slice('subagent:'.length));
}
