import { describe, expect, it, vi } from 'vitest';
import { AppController, requiresSingleInstanceLock, shouldBlockDisplaySleep } from '../app-controller';
import { createInitialSnapshot, snapshotMetadata } from '@codex-claw/core/snapshot';
import type { AddSshConnectionInput, AgentFilePreviewResult, AgentFileSearchItem, AppSnapshot, BackendConversationRef, BrowserState, ClientRequestResponse, CloneSourceRepositoryInput, CodexAuthentication, CodexChatGptLogin, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingSession, DevicePairingStatus, DuplicateAgentOptions, Automation, AutomationLocation, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, RendererMessage, RendererSendPromptOptions, RendererSnapshotState, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, SetCodexResourceSharingInput, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, SystemPermissionsStatus, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind } from '@codex-claw/core/contracts';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ipcChannels } from '@codex-claw/core/ipc';
import type { OpenInProvider } from '../open-in';
import { currentSnapshot, createBackendClient } from './app-controller-test-harness';

describe('AppController', () => {

  it('routes agent restart through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    const backendSnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0]!, backendSession: undefined }],
      messages: snapshot.messages.filter((message) => message.agentId !== 'agent-dina'),
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(restartAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/restart', { agentId: 'agent-dina' });
  });

  it('routes lazy agent history hydration through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      messages: [
        {
          id: 'assistant-history',
          agentId: 'agent-dina',
          role: 'assistant' as const,
          status: 'complete' as const,
          createdAt: '2026-06-13T00:00:00.000Z',
          parts: [{ type: 'text' as const, text: 'Restored.' }],
        },
      ],
    };
    const backendMetadata = snapshotMetadata(backendSnapshot);
    const request = vi.fn().mockResolvedValue(backendMetadata);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await expect(hydrateAgentHistory(controller, 'agent-dina')).resolves.toBe(backendMetadata);

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('agent/history/hydrate', { agentId: 'agent-dina' });
    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });

  it('routes agent goal mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const goalSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
        goal: {
          threadId: 'thread-dina',
          objective: 'Ship the goal shelf',
          status: 'active' as const,
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      }],
    };
    const clearedSnapshot = {
      ...goalSnapshot,
      agents: [{ ...goalSnapshot.agents[0]!, goal: undefined }],
    };
    const request = vi.fn()
      .mockResolvedValueOnce(goalSnapshot)
      .mockResolvedValueOnce(clearedSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(setAgentGoal(controller, 'agent-dina', ' Ship the goal shelf ')).resolves.toBe(goalSnapshot);
    await expect(clearAgentGoal(controller, 'agent-dina')).resolves.toBe(clearedSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/goal/update', { agentId: 'agent-dina', objective: ' Ship the goal shelf ' });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/goal/clear', { agentId: 'agent-dina' });
  });

  it('routes approval preset updates through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
        backendDefaults: {
          kind: 'codex' as const,
          approvalPreset: 'approve-for-me' as const,
          approvalPolicy: 'on-request' as const,
          approvalsReviewer: 'auto_review' as const,
          sandboxMode: 'workspace-write' as const,
        },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(setAgentApprovalPreset(controller, 'agent-dina', 'approve-for-me')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/approvalPreset/update', { agentId: 'agent-dina', preset: 'approve-for-me' });
  });

  it('routes permission mode updates through their separate clawd method', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0] = {
      ...snapshot.agents[0]!,
      backend: 'claude',
      backendDefaults: { kind: 'claude', permissionMode: 'acceptEdits' },
    };
    const request = vi.fn().mockResolvedValue(snapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(setAgentPermissionMode(controller, 'agent-dina', 'acceptEdits')).resolves.toBe(snapshot);
    expect(request).toHaveBeenCalledWith('agent/permissionMode/update', { agentId: 'agent-dina', mode: 'acceptEdits' });
  });

  it('routes active-turn steering through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    const attachment = registerNativeAttachment(controller, {
      type: 'file',
      path: '/tmp/notes.txt',
      name: 'notes.txt',
      mimeType: 'text/plain',
      size: 12,
    });

    await expect(steerPrompt(controller, 'agent-dina', ' try smaller ')).resolves.toBe(backendSnapshot);
    await expect(steerPrompt(controller, 'agent-dina', ' inspect this ', {
      attachments: [{ type: 'file', reference: attachment.reference }],
    })).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/prompt/steer', { agentId: 'agent-dina', prompt: ' try smaller ' });
    expect(request).toHaveBeenCalledWith('agent/prompt/steer', {
      agentId: 'agent-dina',
      prompt: ' inspect this ',
      options: {
        attachments: [{ type: 'file', path: '/tmp/notes.txt', name: 'notes.txt', mimeType: 'text/plain' }],
      },
    });

    await expect(steerPrompt(controller, 'agent-dina', ' invalid attachment ', {
      attachments: [{ type: 'file', reference: 'electron-attachment:missing' }],
    })).rejects.toThrow('Attachment reference is invalid or expired');
  });

  it('routes queued prompt mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const request = vi.fn().mockResolvedValue(snapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    await controller.initialize();

    await expect(updateQueuedPrompt(controller, 'agent-dina', 'prompt-1', 'edited queue')).resolves.toBe(snapshot);
    await expect(steerQueuedPrompt(controller, 'agent-dina', 'prompt-1', 'edited steer')).resolves.toBe(snapshot);
    await expect(deleteQueuedPrompt(controller, 'agent-dina', 'prompt-2')).resolves.toBe(snapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/queuedPrompt/update', {
      agentId: 'agent-dina', promptId: 'prompt-1', prompt: 'edited queue',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/queuedPrompt/steer', {
      agentId: 'agent-dina', promptId: 'prompt-1', prompt: 'edited steer',
    });
    expect(request).toHaveBeenNthCalledWith(3, 'agent/queuedPrompt/delete', { agentId: 'agent-dina', promptId: 'prompt-2' });
  });

  it('routes interruption through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(interruptAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/interrupt', { agentId: 'agent-dina' });
  });

  it('routes prompts through clawd by agent id', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backend = 'claude';
    snapshot.agents[0].backendDefaults = { kind: 'claude' };
    const backendSnapshot = {
      ...snapshot,
      messages: [
        ...snapshot.messages,
        userMessage('user-turn-1', 'turn-1', 'hello claude'),
      ],
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'claude' as const, sessionId: 'claude-session-1', transport: 'stdio' as const },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await expect(sendPrompt(controller, 'agent-dina', 'hello claude')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/prompt/send', {
      agentId: 'agent-dina',
      prompt: 'hello claude',
      options: undefined,
    });
  });

  it('reads historical conversation messages through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const generatedImageUrl = 'file:///Users/nbonamy/.codex-claw/codex-home/generated_images/thread/history.png';
    const messages: RendererMessage[] = [
      {
        id: 'user-thread-dina-user-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        createdAt: '2026-06-09T10:00:00.000Z',
        parts: [{ type: 'text', text: 'hello' }],
      },
      {
        id: 'assistant-thread-dina-image-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-09T10:00:01.000Z',
        parts: [{
          type: 'media',
          media: { url: generatedImageUrl, mimeType: 'image/png' },
        }],
      },
    ];
    const request = vi.fn().mockResolvedValue(messages);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    const loaded = await readConversationMessages(controller, { backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
    expect(loaded[0]).toStrictEqual(messages[0]);
    const media = loaded[1]?.parts.find((part) => part.type === 'media');
    expect(media?.type === 'media' ? media.media.url : null).toMatch(/^codex-claw-media:\/\/generated\//);
    expect(media?.type === 'media' ? media.media.url : null).not.toBe(generatedImageUrl);
    expect(request).toHaveBeenCalledWith('agent/conversation/messages/get', {
      ref: { backend: 'codex', threadId: 'thread-dina' },
      agentId: 'agent-dina',
    });
  });

  it('lists agent conversations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const conversations: ConversationSummary[] = [{
      id: 'thread-dina',
      title: 'Read docs',
      updatedAt: '2026-06-09T10:00:00.000Z',
      messageCount: 3,
      ref: { backend: 'codex', threadId: 'thread-dina' },
    }];
    const request = vi.fn().mockResolvedValue(conversations);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listAgentConversations(controller, 'agent-dina')).resolves.toStrictEqual(conversations);
    expect(request).toHaveBeenCalledWith('agent/conversations/list', { agentId: 'agent-dina' });
  });

  it('routes agent conversation resume through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    const backendSnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0]!, backendSession: { kind: 'codex' as const, threadId: 'thread-dina' } }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const ref = { backend: 'codex' as const, threadId: 'thread-dina' };

    await controller.initialize();

    await expect(resumeAgentConversation(controller, 'agent-dina', ref)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/conversation/resume', { agentId: 'agent-dina', ref });
  });

  it('lets clawd validate busy agent conversation resume', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const request = vi.fn().mockRejectedValue(new Error('Agent must be idle before resuming a conversation.'));
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const ref = { backend: 'codex' as const, threadId: 'thread-dina' };

    await controller.initialize();

    await expect(resumeAgentConversation(controller, 'agent-dina', ref)).rejects.toThrow('Agent must be idle before resuming a conversation.');
    expect(request).toHaveBeenCalledWith('agent/conversation/resume', { agentId: 'agent-dina', ref });
  });

  it('lets clawd reject unrecorded historical conversation refs', async () => {
    const snapshot = createInitialSnapshot();
    const request = vi.fn().mockRejectedValue(new Error('Conversation reference is not available.'));
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(readConversationMessages(controller, { backend: 'codex', threadId: 'thread-dina' }, 'agent-dina')).rejects.toThrow('Conversation reference is not available.');
    expect(request).toHaveBeenCalledWith('agent/conversation/messages/get', {
      ref: { backend: 'codex', threadId: 'thread-dina' },
      agentId: 'agent-dina',
    });
  });

  it('lets clawd reject invalid historical conversation refs', async () => {
    const snapshot = createInitialSnapshot();
    const request = vi.fn().mockRejectedValue(new Error('Invalid conversation reference.'));
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(readConversationMessages(controller, { backend: 'codex' }, 'agent-dina')).rejects.toThrow('Invalid conversation reference.');
    expect(request).toHaveBeenCalledWith('agent/conversation/messages/get', {
      ref: { backend: 'codex' },
      agentId: 'agent-dina',
    });
  });

  it('routes agent file listing and previews through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].folder = '/Users/nbonamy/src/codex-claw';
    const files: AgentFileSearchItem[] = [{ name: 'README.md', path: 'README.md' }];
    const readResult: AgentFilePreviewResult = { path: 'README.md', size: 10, kind: 'text', content: '# Read me\n' };
    const request = vi.fn()
      .mockResolvedValueOnce(files)
      .mockResolvedValueOnce(readResult);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listAgentFiles(controller, 'agent-dina')).resolves.toStrictEqual(files);
    await expect(previewAgentFile(controller, 'agent-dina', 'README.md')).resolves.toStrictEqual(readResult);
    expect(request).toHaveBeenNthCalledWith(1, 'agent/files/list', {
      agentId: 'agent-dina',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/file/preview', {
      agentId: 'agent-dina',
      filePath: 'README.md',
    });
  });

  it('deletes a message by rolling back from its Codex turn and replacing history', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
      userMessage('user-turn-2', 'turn-2', 'second prompt'),
      assistantMessage('assistant-turn-2', 'turn-2', 'second answer'),
    ];
    const rollbackSnapshot = {
      ...snapshot,
      messages: snapshot.messages.slice(0, 2),
    };
    const request = vi.fn().mockResolvedValue(rollbackSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(deleteMessage(controller, 'agent-dina', 'user-turn-2')).resolves.toBe(rollbackSnapshot);

    expect(request).toHaveBeenCalledWith('agent/message/delete', { agentId: 'agent-dina', messageId: 'user-turn-2' });
  });

  it('retries an assistant message by rolling back and resending the matching user prompt', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
    ];
    const rollbackSnapshot = {
      ...snapshot,
      messages: [],
    };
    const request = vi.fn().mockResolvedValue(rollbackSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await retryMessage(controller, 'agent-dina', 'assistant-turn-1');

    expect(request).toHaveBeenCalledWith('agent/message/retry', { agentId: 'agent-dina', messageId: 'assistant-turn-1' });
  });

  it('edits a user message by rolling back and resending the edited prompt', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
    ];
    const rollbackSnapshot = {
      ...snapshot,
      messages: [],
    };
    const request = vi.fn().mockResolvedValue(rollbackSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await editMessage(controller, 'agent-dina', 'user-turn-1', ' edited prompt ');

    expect(request).toHaveBeenCalledWith('agent/message/update', { agentId: 'agent-dina', messageId: 'user-turn-1', prompt: ' edited prompt ' });
  });
});

async function sendPrompt(controller: AppController, agentId: string, prompt: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    sendPrompt(agentId: string, prompt: string): Promise<AppSnapshot>;
  }).sendPrompt(agentId, prompt);
}

async function restartAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    restartAgent(agentId: string): Promise<AppSnapshot>;
  }).restartAgent(agentId);
}

async function hydrateAgentHistory(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    hydrateAgentHistory(agentId: string): Promise<AppSnapshot>;
  }).hydrateAgentHistory(agentId);
}

async function readConversationMessages(
  controller: AppController,
  ref: unknown,
  agentId: string,
  location?: AutomationLocation,
): Promise<RendererMessage[]> {
  return (controller as unknown as {
    readConversationMessages(ref: unknown, agentId: string, location?: AutomationLocation): Promise<RendererMessage[]>;
  }).readConversationMessages(ref, agentId, location);
}

async function listAgentConversations(
  controller: AppController,
  agentId: string,
): Promise<ConversationSummary[]> {
  return (controller as unknown as {
    listAgentConversations(agentId: string): Promise<ConversationSummary[]>;
  }).listAgentConversations(agentId);
}

async function resumeAgentConversation(
  controller: AppController,
  agentId: string,
  ref: BackendConversationRef,
): Promise<AppSnapshot> {
  return (controller as unknown as {
    resumeAgentConversation(agentId: string, ref: unknown): Promise<AppSnapshot>;
  }).resumeAgentConversation(agentId, ref);
}

async function steerPrompt(
  controller: AppController,
  agentId: string,
  prompt: string,
  options?: RendererSendPromptOptions,
): Promise<AppSnapshot> {
  return (controller as unknown as {
    steerPrompt(agentId: string, prompt: string, options?: RendererSendPromptOptions): Promise<AppSnapshot>;
  }).steerPrompt(agentId, prompt, options);
}

function registerNativeAttachment(
  controller: AppController,
  input: { type: 'file' | 'image'; path: string; name: string; mimeType: string; size: number },
): { reference: string } {
  return (controller as unknown as {
    nativeAttachmentRegistry: { register(value: typeof input): { reference: string } };
  }).nativeAttachmentRegistry.register(input);
}

async function updateQueuedPrompt(controller: AppController, agentId: string, promptId: string, prompt: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateQueuedPrompt(agentId: string, promptId: string, prompt: string): Promise<AppSnapshot>;
  }).updateQueuedPrompt(agentId, promptId, prompt);
}

async function steerQueuedPrompt(controller: AppController, agentId: string, promptId: string, prompt?: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    steerQueuedPrompt(agentId: string, promptId: string, prompt?: string): Promise<AppSnapshot>;
  }).steerQueuedPrompt(agentId, promptId, prompt);
}

async function deleteQueuedPrompt(controller: AppController, agentId: string, promptId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot>;
  }).deleteQueuedPrompt(agentId, promptId);
}

async function interruptAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    interruptAgent(agentId: string): Promise<AppSnapshot>;
  }).interruptAgent(agentId);
}

async function deleteMessage(controller: AppController, agentId: string, messageId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  }).deleteMessage(agentId, messageId);
}

async function retryMessage(controller: AppController, agentId: string, messageId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    retryMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  }).retryMessage(agentId, messageId);
}

async function editMessage(controller: AppController, agentId: string, messageId: string, prompt: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot>;
  }).editMessage(agentId, messageId, prompt);
}

async function setAgentGoal(controller: AppController, agentId: string, objective: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot>;
  }).setAgentGoal(agentId, objective);
}

async function clearAgentGoal(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    clearAgentGoal(agentId: string): Promise<AppSnapshot>;
  }).clearAgentGoal(agentId);
}

async function setAgentApprovalPreset(controller: AppController, agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<AppSnapshot> {
  return (controller as unknown as {
    setAgentApprovalPreset(agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<AppSnapshot>;
  }).setAgentApprovalPreset(agentId, preset);
}

async function setAgentPermissionMode(controller: AppController, agentId: string, mode: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    setAgentPermissionMode(agentId: string, mode: string): Promise<AppSnapshot>;
  }).setAgentPermissionMode(agentId, mode);
}

async function previewAgentFile(controller: AppController, agentId: string, filePath: string): Promise<unknown> {
  return (controller as unknown as {
    previewAgentFile(agentId: string, filePath: string): Promise<unknown>;
  }).previewAgentFile(agentId, filePath);
}

async function listAgentFiles(controller: AppController, agentId: string): Promise<AgentFileSearchItem[]> {
  return (controller as unknown as {
    listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]>;
  }).listAgentFiles(agentId);
}

function userMessage(id: string, turnId: string, text: string) {
  return {
    id,
    agentId: 'agent-dina',
    role: 'user' as const,
    status: 'complete' as const,
    turnId,
    createdAt: '2026-06-05T00:00:00.000Z',
    parts: [{ type: 'text' as const, text }],
  };
}

function assistantMessage(id: string, turnId: string, text: string) {
  return {
    id,
    agentId: 'agent-dina',
    role: 'assistant' as const,
    status: 'complete' as const,
    turnId,
    createdAt: '2026-06-05T00:00:01.000Z',
    parts: [{ type: 'text' as const, text }],
  };
}
