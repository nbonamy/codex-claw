import type { Agent, AppCommand } from '@codex-claw/core/contracts';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { CodexConversationPaneController, CodexMessageImage, CodexMessageImageContext } from '@codex-app-sdk/vue';
import { shallowMount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import AgentWorkspace from '../AgentWorkspace.vue';
import type { AgentRightWorkspaceState } from '../use-right-workspace-state';
import type { RightWorkspaceTab } from '../right-workspace';

function createWorkspaceState(): AgentRightWorkspaceState {
  return {
    activeTab: null,
    backlogError: null,
    backlogItems: [],
    backlogStatus: 'notLoaded',
    browserId: 'primary',
    browserInitialUrl: '',
    browserOpenRequestId: 0,
    browserVisualization: null,
    diffPanels: {},
    filePanels: {},
    filePreviewRequestIds: {},
    filesPaneOpen: false,
    filesPaneWidth: 280,
    gitReviewPanel: null,
    imagePanels: {},
    open: false,
    planPanel: null,
    tabs: [],
    width: 420,
  };
}

function mountWorkspace(configureSnapshot?: (snapshot: ReturnType<typeof createInitialSnapshot>) => void) {
  const snapshot = createInitialSnapshot();
  configureSnapshot?.(snapshot);
  const currentAgent = snapshot.agents[0] as Agent;
  const workspace = createWorkspaceState();
  const closeRightWorkspaceTab = vi.fn();
  const discardCodeReview = vi.fn().mockResolvedValue(snapshot);
  const openRightWorkspaceTab = vi.fn((tab: RightWorkspaceTab) => {
    workspace.activeTab = tab;
    workspace.tabs = workspace.tabs.includes(tab) ? workspace.tabs : [...workspace.tabs, tab];
    workspace.open = true;
  });
  const updateAgent = vi.fn().mockResolvedValue(undefined);
  const wrapper = shallowMount(AgentWorkspace, {
    props: {
      activeAttachmentAnnotationCounts: {},
      addChatTextAnnotation: vi.fn(),
      agentFiles: [],
      agentSidebarCollapsed: false,
      chatTextAnnotations: [],
      closeRightWorkspaceTab,
      commitAgentGitChanges: vi.fn(),
      confirmPlan: vi.fn(),
      threadFlagBusy: false,
      conversationPaneController: {} as CodexConversationPaneController,
      conversationPlan: currentAgent.plan ?? null,
      respondToThreadFlag: vi.fn(),
      createAgentGitPullRequest: vi.fn(),
      currentAgent,
      currentAgentGitStatus: null,
      currentBackendRuntime: { backend: 'codex', status: 'running' },
      forwardPrompt: vi.fn(),
      generateAgentGitMessage: vi.fn(),
      generateDesignSuggestion: vi.fn(),
      getAgentGitWorkflow: vi.fn(),
      handleStartWorkAction: vi.fn(),
      isAgentEmpty: false,
      isConversationLoading: false,
      historyLoadFailed: false,
      isLoading: false,
      isModalDialogVisible: false,
      isRightWorkspaceVisible: () => true,
      hasRunningPlanTool: false,
      hasVisibleMessages: false,
      latestConversationTurnId: null,
      loadWorkItems: vi.fn(),
      mergeAgentGitBranch: vi.fn(),
      updateAgentGitBranchFromBase: vi.fn(),
      updateAgent,
      openAgentGitDiffPreview: vi.fn(),
      openAgentIn: vi.fn(),
      openAttachmentImageAnnotation: vi.fn(),
      removeChatTextAnnotation: vi.fn(),
      openFilePreview: vi.fn(),
      openFilePreviewForAgent: vi.fn(),
      openInApplications: { defaultApplication: 'finder', applications: [] },
      openRightWorkspaceTab,
      prefillWorkItemForAgent: vi.fn(),
      pushAgentGitBranch: vi.fn(),
      readConversationMessages: vi.fn(),
      readDesignDiagramAsset: vi.fn(),
      retryConversationHistory: vi.fn(),
      rightWorkspaceFor: () => workspace,
      rightWorkspaces: { [currentAgent.id]: workspace },
      rightWorkspaceVisible: false,
      selectAgentFromShell: vi.fn(),
      selectDesignDiagram: vi.fn(),
      selectRightWorkspaceTab: vi.fn(),
      snapshot,
      startRepositoryWork: vi.fn(),
      startRightWorkspaceResize: vi.fn(),
      toggleFileExplorer: vi.fn(),
      toggleRightWorkspace: vi.fn(),
      discardCodeReview,
    },
    global: { plugins: [i18n] },
  });
  return {
    closeRightWorkspaceTab,
    currentAgent,
    discardCodeReview,
    openRightWorkspaceTab,
    updateAgent,
    workspace,
    wrapper,
  };
}

describe('AgentWorkspace', () => {
  it('persists the selected Git diff target on the active agent', async () => {
    const { currentAgent, updateAgent, wrapper } = mountWorkspace();

    wrapper.getComponent({ name: 'AgentHeader' }).vm.$emit('select-git-diff-target', { type: 'staged' });
    await wrapper.vm.$nextTick();

    expect(updateAgent).toHaveBeenCalledWith({
      id: currentAgent.id,
      gitDiffTarget: { type: 'staged' },
    });
  });

  it('discards review state before closing its workspace tab', async () => {
    const { closeRightWorkspaceTab, currentAgent, discardCodeReview, wrapper } = mountWorkspace((snapshot) => {
      snapshot.agents[0]!.codeReview = {
        id: 'review-1', targetAgentId: snapshot.agents[0]!.id, reviewerAgentId: snapshot.agents[0]!.id,
        scope: { type: 'uncommitted' }, threadMode: 'current', status: 'failed', activeRoundId: 'round-1',
        rounds: [{ id: 'round-1', number: 1, status: 'failed', findings: [], startedAt: 'now' }],
        createdAt: 'now', updatedAt: 'now',
      };
    });

    wrapper.getComponent({ name: 'RightWorkspacePanel' }).vm.$emit('close-tab', 'codeReview');
    await wrapper.vm.$nextTick();

    expect(discardCodeReview).toHaveBeenCalledWith(currentAgent.id, 'review-1');
    await vi.waitFor(() => expect(closeRightWorkspaceTab).toHaveBeenCalledWith(currentAgent.id, 'codeReview'));
    expect(discardCodeReview.mock.invocationCallOrder[0]).toBeLessThan(
      closeRightWorkspaceTab.mock.invocationCallOrder[0]!,
    );
  });

  it('resolves the delegating agent name for Git workflow report-back', () => {
    const { wrapper } = mountWorkspace((snapshot) => {
      const worker = snapshot.agents[0] as Agent;
      worker.delegatedByAgentId = 'agent-main';
      snapshot.agents.push({
        ...worker,
        id: 'agent-main',
        name: 'Main agent',
        delegatedByAgentId: undefined,
      });
    });

    expect(wrapper.findComponent({ name: 'AgentHeader' }).props('reportBackAgentName')).toBe('Main agent');
  });

  it('lets the SDK handle fullscreen images and opens inline images in the agent workspace', () => {
    const { currentAgent, openRightWorkspaceTab, workspace, wrapper } = mountWorkspace();
    const image: CodexMessageImage = {
      alt: 'Architecture diagram',
      kind: 'attachment',
      mimeType: 'image/png',
      name: 'diagram.png',
      path: '/repo/diagram.png',
      src: 'data:image/png;base64,aW1hZ2U=',
    };
    const context: CodexMessageImageContext = {
      intent: 'fullscreen',
      index: 2,
      message: { id: 'message-with-image', role: 'assistant', content: '' },
    };

    expect(wrapper.vm.openConversationImage(image, context)).toBe(false);
    expect(openRightWorkspaceTab).not.toHaveBeenCalled();

    expect(wrapper.vm.openConversationImage(image, { ...context, intent: 'open' })).toBe(true);
    expect(openRightWorkspaceTab).toHaveBeenCalledWith(expect.stringMatching(/^image:/), currentAgent.id);
    expect(Object.values(workspace.imagePanels)[0]).toMatchObject({
      path: '/repo/diagram.png',
      title: 'diagram.png',
    });
  });

  it('routes browser commands to the requested agent workspace', () => {
    const { currentAgent, openRightWorkspaceTab, workspace, wrapper } = mountWorkspace();
    const command: Extract<AppCommand, { type: 'open-browser' }> = {
      type: 'open-browser',
      agentId: currentAgent.id,
      browserId: 'docs',
      url: 'https://example.com',
    };

    wrapper.vm.handleBrowserOpenCommand(command);

    expect(workspace.browserId).toBe('docs');
    expect(workspace.browserInitialUrl).toBe('https://example.com');
    expect(openRightWorkspaceTab).toHaveBeenCalledWith('browser', currentAgent.id);
  });
});
