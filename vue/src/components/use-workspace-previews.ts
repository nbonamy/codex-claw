import type {
  Agent,
  AgentFileActivity,
  AgentFilePreviewResult,
  AppSnapshot,
  ConversationFileLink,
  SidePanelMarkdownRequest,
  SidePanelRequest,
} from '@codex-claw/core/contracts';
import { languageForFilePath } from '@codex-app-sdk/vue';
import { translate } from '../i18n';
import { localizedText } from '../i18n/errors';
import type { SidePanelGitDiffState } from './side-panel';
import {
  rightWorkspaceDiffTab,
  rightWorkspaceFileTab,
  rightWorkspaceImageTab,
  rightWorkspaceMarkdownTab,
  type RightWorkspaceFilePanel,
  type RightWorkspaceTab,
} from './right-workspace';
import type { AgentRightWorkspaceState } from './use-right-workspace-state';

export type WorkspacePreviewOptions = {
  closeTab: (agentId: string, tab: RightWorkspaceTab) => void;
  currentAgent: () => Agent | null;
  getSnapshot: () => AppSnapshot;
  openAgentGitDiff: (agentId: string) => Promise<void>;
  openTab: (tab: RightWorkspaceTab, agentId?: string) => void;
  previewAgentFile: (agentId: string, filePath: string) => Promise<AgentFilePreviewResult>;
  workspaceFor: (agentId: string) => AgentRightWorkspaceState;
};

/** Owns preview request races and projection into per-agent workspace tabs. */
export function useWorkspacePreviews(options: WorkspacePreviewOptions) {
  let filePreviewRequestId = 0;
  let markdownPreviewId = 0;

  async function openConversationFile(link: ConversationFileLink): Promise<void> {
    const agent = options.currentAgent();
    if (!agent) return;
    const filePath = link.filepath ?? link.path;
    if (link.action === 'edit') {
      if (link.turnId && openTurnDiff(agent.id, link.turnId, filePath)) return;
      await openAgentGitDiff(agent.id);
      return;
    }
    await openFile(agent.id, filePath);
  }

  function openTurnDiff(agentId: string, turnId: string, filePath: string): boolean {
    const agent = agentForId(agentId);
    const relativePath = normalizePreviewFilePath(filePath, agent?.folder);
    const turnDiff = options.getSnapshot().turnGitDiffs[turnId]?.diff;
    if (!agent || !relativePath || !turnDiff) return false;

    const diff = diffForPath(turnDiff, relativePath);
    if (!diff) return false;

    const workspace = options.workspaceFor(agentId);
    const tab = rightWorkspaceDiffTab(turnId, relativePath);
    workspace.diffPanels = {
      ...workspace.diffPanels,
      [tab]: {
        kind: 'gitDiff',
        title: fileBasename(relativePath),
        subtitle: relativePath,
        diff,
        state: 'idle',
        error: null,
      },
    };
    options.openTab(tab, agentId);
    return true;
  }

  function handleFileActivity(activity: AgentFileActivity): void {
    const agent = agentForId(activity.agentId);
    const filePath = normalizePreviewFilePath(activity.path, agent?.folder);
    if (!agent || !filePath) return;

    const workspace = options.workspaceFor(agent.id);
    const tab = rightWorkspaceFileTab(filePath);
    if (activity.action === 'read' || activity.status !== 'completed' || !workspace.filePanels[tab]) return;
    void openFile(agent.id, filePath, false);
  }

  async function openFile(agentId: string, filePath: string, reveal = true): Promise<void> {
    const agent = agentForId(agentId);
    const trimmedPath = normalizePreviewFilePath(filePath, agent?.folder);
    if (!agent || !trimmedPath) return;

    const workspace = options.workspaceFor(agent.id);
    const tab = rightWorkspaceFileTab(trimmedPath);
    const requestId = ++filePreviewRequestId;
    workspace.filePreviewRequestIds = { ...workspace.filePreviewRequestIds, [tab]: requestId };
    const existingContent = workspace.filePanels[tab]?.content ?? '';
    workspace.filePanels = {
      ...workspace.filePanels,
      [tab]: filePreviewPanel(trimmedPath, existingContent, 'loading', null),
    };
    if (reveal && workspace.activeTab === 'files' && workspace.tabs.includes('files')) {
      workspace.tabs = workspace.tabs
        .map((candidate) => candidate === 'files' ? tab : candidate)
        .filter((candidate, index, tabs) => tabs.indexOf(candidate) === index);
      workspace.activeTab = tab;
      workspace.open = true;
    } else if (reveal) {
      options.openTab(tab, agent.id);
    }

    try {
      const result = await options.previewAgentFile(agent.id, trimmedPath);
      if (workspace.filePreviewRequestIds[tab] !== requestId) return;
      if (result.kind === 'image' && result.dataUrl) {
        const imageTab = rightWorkspaceImageTab(`workspace:${result.path}`);
        workspace.imagePanels = {
          ...workspace.imagePanels,
          [imageTab]: {
            kind: 'image', title: fileBasename(result.path), subtitle: result.path,
            alt: result.path, path: result.path, src: result.dataUrl, mimeType: result.mimeType,
            state: 'idle', error: null,
          },
        };
        options.closeTab(agent.id, tab);
        options.openTab(imageTab, agent.id);
        return;
      }
      if (result.kind === 'text' && /\.(?:diff|patch)$/iu.test(result.path)) {
        const diffTab = rightWorkspaceDiffTab('workspace', result.path);
        workspace.diffPanels = {
          ...workspace.diffPanels,
          [diffTab]: {
            kind: 'gitDiff', title: fileBasename(result.path), subtitle: result.path,
            diff: result.content ?? '', state: 'idle', error: null,
          },
        };
        options.closeTab(agent.id, tab);
        options.openTab(diffTab, agent.id);
        return;
      }
      const unavailable = result.kind === 'tooLarge'
        ? `Preview unavailable: this file is ${formatFileSize(result.size)} and exceeds the preview limit.`
        : result.kind === 'binary'
          ? translate('surface.appShell.previewUnavailableThisIsABinaryOrUnsupportedFile')
          : result.content ?? '';
      workspace.filePanels = {
        ...workspace.filePanels,
        [tab]: filePreviewPanel(result.path, unavailable, 'idle', null),
      };
    } catch (error) {
      if (workspace.filePreviewRequestIds[tab] !== requestId) return;
      workspace.filePanels = {
        ...workspace.filePanels,
        [tab]: filePreviewPanel(
          trimmedPath,
          existingContent,
          'error',
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  }

  async function openAgentGitDiff(agentId: string): Promise<void> {
    const agent = agentForId(agentId);
    if (!agent?.folder) return;

    const workspace = options.workspaceFor(agent.id);
    workspace.gitReviewPanel = gitReviewPanel(agent.folder, 'loading', null);
    options.openTab('review', agent.id);
    try {
      await options.openAgentGitDiff(agent.id);
    } catch (error) {
      workspace.gitReviewPanel = gitReviewPanel(
        agent.folder,
        'error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function openSidePanel(request: SidePanelRequest): void {
    if (request.kind === 'markdown') {
      openMarkdown(request);
      return;
    }
    openGitDiff(request);
  }

  function openMarkdown(request: SidePanelMarkdownRequest): void {
    const agent = options.currentAgent();
    if (!agent) return;
    const subtitle = request.path;
    const workspace = options.workspaceFor(agent.id);
    const title = localizedText(request.title, translate)
      ?? (subtitle ? fileBasename(subtitle) : translate('surface.appShell.markdown'));
    if (request.purpose !== 'plan') {
      const identifier = request.path ?? `inline-${++markdownPreviewId}`;
      const tab = request.path ? rightWorkspaceFileTab(request.path) : rightWorkspaceMarkdownTab(identifier);
      workspace.filePanels = {
        ...workspace.filePanels,
        [tab]: {
          kind: 'markdown',
          title,
          ...(subtitle ? { subtitle } : {}),
          content: request.content,
          state: 'idle',
          error: null,
        },
      };
      options.openTab(tab, agent.id);
      return;
    }

    workspace.planPanel = {
      kind: 'markdown',
      purpose: 'plan',
      title,
      ...(subtitle ? { subtitle } : {}),
      content: request.content,
      state: 'idle',
      error: null,
    };
    options.openTab('plan', agent.id);
  }

  function openGitDiff(request: Extract<SidePanelRequest, { kind: 'gitDiff' }>): void {
    if (request.scope === 'turn') return;
    const agentId = options.currentAgent()?.id;
    if (!agentId) return;
    const subtitle = localizedText(request.subtitle, translate);
    options.workspaceFor(agentId).gitReviewPanel = {
      kind: 'gitDiff',
      title: localizedText(request.title, translate) ?? translate('surface.appShell.review'),
      ...(subtitle ? { subtitle } : {}),
      diff: request.diff,
      ...(request.sections ? { sections: request.sections } : {}),
      state: request.state ?? 'idle',
      error: request.error ?? null,
    };
    options.openTab('review', agentId);
  }

  function agentForId(agentId: string): Agent | undefined {
    return options.getSnapshot().agents.find((candidate) => candidate.id === agentId);
  }

  return {
    handleFileActivity,
    openAgentGitDiff,
    openConversationFile,
    openFile,
    openMarkdown,
    openSidePanel,
  };
}

export function fileBasename(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}

function gitReviewPanel(
  folder: string,
  state: 'loading' | 'error',
  error: string | null,
): SidePanelGitDiffState {
  return {
    kind: 'gitDiff',
    title: translate('surface.appShell.review'),
    subtitle: folder,
    diff: '',
    state,
    error,
  };
}

function diffForPath(diff: string, filePath: string): string | null {
  const targetPath = normalizePathSeparators(filePath).replace(/^\.\//u, '');
  const sections = diff.split(/(?=^diff --git )/mu).filter((section) => section.startsWith('diff --git '));
  return sections.find((section) => {
    const header = section.split('\n', 1)[0] ?? '';
    const separator = header.indexOf(' b/');
    if (separator < 0) return false;
    const beforePath = header.slice('diff --git a/'.length, separator);
    const afterPath = header.slice(separator + ' b/'.length);
    return [beforePath, afterPath].some((candidate) => (
      normalizePathSeparators(candidate).replace(/^[ab]\//u, '') === targetPath
    ));
  }) ?? null;
}

function filePreviewPanel(
  filePath: string,
  content: string,
  state: 'idle' | 'loading' | 'error',
  error: string | null,
): RightWorkspaceFilePanel {
  const kind = isMarkdownPath(filePath) ? 'markdown' : 'source';
  return {
    kind,
    title: fileBasename(filePath),
    subtitle: filePath,
    content,
    ...(kind === 'source' ? { language: languageForFilePath(filePath) ?? null } : {}),
    state,
    error,
  } as RightWorkspaceFilePanel;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isMarkdownPath(filePath: string): boolean {
  const normalizedPath = filePath.split('#')[0]?.split('?')[0]?.toLowerCase() ?? '';
  return /\.(md|markdown|mdown|mkdn)$/u.test(normalizedPath);
}

function normalizePreviewFilePath(filePath: string, agentFolder?: string | null): string {
  const trimmedPath = filePath.trim();
  if (!trimmedPath.startsWith('file://')) {
    return toBackendPreviewPath(stripPreviewLineSuffix(trimmedPath), agentFolder);
  }
  try {
    return toBackendPreviewPath(stripPreviewLineSuffix(decodeURIComponent(new URL(trimmedPath).pathname)), agentFolder);
  } catch {
    return toBackendPreviewPath(stripPreviewLineSuffix(trimmedPath), agentFolder);
  }
}

function stripPreviewLineSuffix(filePath: string): string {
  return filePath.replace(/:(?:\d+)(?::\d+)?$/u, '');
}

function toBackendPreviewPath(filePath: string, agentFolder?: string | null): string {
  const normalizedPath = normalizePathSeparators(filePath);
  if (!isAbsolutePreviewPath(normalizedPath)) return normalizedPath;
  const normalizedFolder = normalizePathSeparators(agentFolder ?? '').replace(/\/+$/u, '');
  if (!normalizedFolder || !isAbsolutePreviewPath(normalizedFolder)) return normalizedPath;
  if (!normalizedPath.startsWith(`${normalizedFolder}/`)) return normalizedPath;
  return normalizedPath.slice(normalizedFolder.length + 1);
}

function normalizePathSeparators(filePath: string): string {
  return filePath.replace(/\\/gu, '/');
}

function isAbsolutePreviewPath(filePath: string): boolean {
  return filePath.startsWith('/') || /^[a-z]:\//iu.test(filePath);
}
