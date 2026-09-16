import type {
  Options as ClaudeQueryOptions,
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ClaudeAgentSdkTransport,
  type ClaudeQueryFactory,
  type ClaudeQueryRuntime,
} from '../agent-sdk-transport';
import type { ClaudePermissionRequest } from '../transport';
import type { ClaudeSdkMessage } from '../protocol';
import { ClaudeBackendDriver } from '../claude-driver';

vi.mock('@codex-claw/core/runtime-discovery', () => ({
  // Runtime discovery owns its shell integration tests; this suite tests the transport boundary.
  withDiscoveredRuntimePath: (env: NodeJS.ProcessEnv | undefined) => ({
    ...process.env,
    ...env,
  }),
}));

describe('ClaudeAgentSdkTransport', () => {
  it('routes identical SDK request IDs through the driver without resolving another agent session', async () => {
    const harnesses = [createQueryHarness(), createQueryHarness()];
    let index = 0;
    const transport = new ClaudeAgentSdkTransport({ createQuery: (input) => harnesses[index++]!.createQuery(input) });
    const driver = new ClaudeBackendDriver(transport);
    try {
      const sends = ['A', 'B'].map((id) => driver.sendPrompt({ id, name: id, folder: '/tmp/project', backend: 'claude', status: { type: 'idle' }, createdAt: '', updatedAt: '' }, 'edit'));
      await vi.waitFor(() => expect(harnesses.every((harness) => harness.inputs.length === 1)).toBe(true));
      harnesses.forEach((harness, i) => harness.emit({ type: 'system', subtype: 'init', session_id: `session-${i}` } as ClaudeSdkMessage));
      await Promise.all(sends);
      const resolved = [vi.fn(), vi.fn()];
      const permissions = harnesses.map((harness, i) => Promise.resolve(harness.options[0]!.canUseTool!('Edit', { file_path: `${i}.ts` }, {
        signal: new AbortController().signal, toolUseID: 'item', requestId: 'same',
      })).then(resolved[i]));
      await expect(transport.respondToPermissionRequest('same', { decision: 'allow' })).rejects.toThrow('Agent identity');
      await expect(transport.respondToPermissionRequest('same', { decision: 'allow' }, 'unknown')).rejects.toThrow('no longer pending');
      await expect(driver.respondToAgentRequest({ id: 'same', outcome: { kind: 'decision', decision: 'allow' } })).rejects.toThrow('Agent identity');
      await expect(driver.respondToAgentRequest({ agentId: 'unknown', id: 'same', outcome: { kind: 'decision', decision: 'allow' } })).rejects.toThrow('no longer pending');
      await driver.respondToAgentRequest({ agentId: 'A', id: 'same', outcome: { kind: 'decision', decision: 'allow' } });
      await permissions[0];
      expect(resolved[0]).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'allow', updatedInput: { file_path: '0.ts' } }));
      expect(resolved[1]).not.toHaveBeenCalled();
      await driver.respondToAgentRequest({ agentId: 'B', id: 'same', outcome: { kind: 'decision', decision: 'deny' } });
      await permissions[1];
      expect(resolved[1]).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'deny' }));
    } finally { await driver.close(); }
  });
  it('opts into the SDK safety gate for bypass-permissions sessions', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({ createQuery: harness.createQuery });

    const turn = transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'trusted task',
      permissionMode: 'bypassPermissions',
    }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));

    expect(harness.options[0]).toMatchObject({
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    });
    harness.emit({ type: 'result', subtype: 'success', session_id: 'bypass-session', is_error: false });
    await turn.done;
    await transport.close();
  });

  it('discovers the model catalog without persisting a Claude conversation', async () => {
    const harness = createQueryHarness([{
      value: 'claude-opus-4-6',
      displayName: 'Opus 4.6',
      description: 'Best for complex work',
      supportsEffort: true,
      supportedEffortLevels: ['medium', 'high'],
    }]);
    const transport = new ClaudeAgentSdkTransport({ createQuery: harness.createQuery });

    await expect(transport.discoverModels({ cwd: '/tmp/project' })).resolves.toEqual([expect.objectContaining({
      value: 'claude-opus-4-6',
      displayName: 'Opus 4.6',
    })]);
    expect(harness.options[0]).toMatchObject({ cwd: '/tmp/project', persistSession: false });
    expect(harness.runtimes[0]?.close).toHaveBeenCalledOnce();
  });

  it('keeps one Agent SDK query alive across turns in the same session', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      command: '/usr/local/bin/claude',
      env: { PATH: '/usr/local/bin', NODE_OPTIONS: '--inspect' },
      createQuery: harness.createQuery,
      createSessionId: () => '11111111-1111-4111-8111-111111111111',
    });
    const firstMessages: ClaudeSdkMessage[] = [];
    const first = transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'first prompt',
      model: 'sonnet',
      permissionMode: 'default',
      appendSystemPrompt: 'Claw instructions',
      mcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-1',
      hostedMcpServerUrls: {
        github: 'http://127.0.0.1:4321/mcp/providers/github?agentId=agent-1',
      },
      allowedTools: ['mcp__codex_claw__*'],
    }, (message) => firstMessages.push(message));

    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));
    expect(harness.createQuery).toHaveBeenCalledOnce();
    expect(harness.options[0]).toMatchObject({
      cwd: '/tmp/project',
      pathToClaudeCodeExecutable: '/usr/local/bin/claude',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Claw instructions' },
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['user', 'project', 'local'],
      includePartialMessages: true,
      model: 'sonnet',
      permissionMode: 'default',
      sessionId: '11111111-1111-4111-8111-111111111111',
      allowedTools: ['mcp__codex_claw__*'],
      mcpServers: {
        codex_claw: {
          type: 'http',
          url: 'http://127.0.0.1:4321/mcp?agentId=agent-1',
        },
        github: {
          type: 'http',
          url: 'http://127.0.0.1:4321/mcp/providers/github?agentId=agent-1',
        },
      },
      env: expect.objectContaining({
        PATH: expect.stringContaining('/usr/local/bin'),
        CLAUDE_AGENT_SDK_CLIENT_APP: 'codex-claw',
      }),
    });
    expect(harness.options[0]?.env).not.toHaveProperty('NODE_OPTIONS');
    expect(harness.inputs[0]).toMatchObject({
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'first prompt' }],
      },
    });

    harness.runtimes[0]?.supportedModels.mockResolvedValueOnce([{
      value: 'claude-sonnet-4-5',
      displayName: 'Sonnet 4.5',
      description: 'Balanced for coding',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'high'],
    }]);
    await expect(transport.listModels()).resolves.toEqual([{
      value: 'claude-sonnet-4-5',
      displayName: 'Sonnet 4.5',
      description: 'Balanced for coding',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'high'],
    }]);

    harness.emit({ type: 'system', subtype: 'init', session_id: '11111111-1111-4111-8111-111111111111' });
    harness.emit({ type: 'result', subtype: 'success', session_id: '11111111-1111-4111-8111-111111111111', is_error: false });
    await expect(first.done).resolves.toBeUndefined();
    expect(firstMessages.map((message) => message.type)).toStrictEqual(['system', 'result']);

    const secondMessages: ClaudeSdkMessage[] = [];
    const second = transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'second prompt',
      sessionId: '11111111-1111-4111-8111-111111111111',
      model: 'opus',
      effort: 'high',
      permissionMode: 'acceptEdits',
      appendSystemPrompt: 'Claw instructions',
      mcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-1',
      allowedTools: ['mcp__codex_claw__*'],
    }, (message) => secondMessages.push(message));
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(2));

    expect(harness.createQuery).toHaveBeenCalledOnce();
    expect(harness.runtimes[0]?.setModel).toHaveBeenCalledWith('opus');
    expect(harness.runtimes[0]?.setPermissionMode).toHaveBeenCalledWith('acceptEdits');
    expect(harness.runtimes[0]?.applyFlagSettings).toHaveBeenCalledWith({ effortLevel: 'high' });
    expect(harness.inputs[1]?.message.content).toStrictEqual([{ type: 'text', text: 'second prompt' }]);

    harness.emit({ type: 'result', subtype: 'success', session_id: '11111111-1111-4111-8111-111111111111', is_error: false });
    await expect(second.done).resolves.toBeUndefined();
    expect(secondMessages.map((message) => message.type)).toStrictEqual(['result']);

    const third = transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'third prompt',
      sessionId: '11111111-1111-4111-8111-111111111111',
      appendSystemPrompt: 'Claw instructions',
      mcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-1',
      allowedTools: ['mcp__codex_claw__*'],
    }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(3));
    expect(harness.runtimes[0]?.setModel).toHaveBeenLastCalledWith(undefined);
    expect(harness.runtimes[0]?.setPermissionMode).toHaveBeenLastCalledWith('default');
    harness.emit({ type: 'result', subtype: 'success', session_id: '11111111-1111-4111-8111-111111111111', is_error: false });
    await third.done;
    await transport.close();
  });

  it('reads exact context-window usage from a live Agent SDK query', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      createQuery: harness.createQuery,
      createSessionId: () => '19191919-1919-4191-8191-191919191919',
    });
    const messages: ClaudeSdkMessage[] = [];
    const turn = transport.startTurn({ cwd: '/tmp/project', prompt: 'measure context' }, (message) => messages.push(message));
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));
    harness.emit({ type: 'system', subtype: 'init', session_id: 'context-session' });
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    harness.runtimes[0]?.getContextUsage.mockResolvedValueOnce({
      categories: [],
      totalTokens: 51_200,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      percentage: 25.6,
      gridRows: [],
      model: 'claude-sonnet-5',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
    });

    await expect(transport.getContextUsage('context-session')).resolves.toStrictEqual({
      totalTokens: 51_200,
      maxTokens: 200_000,
      percentage: 25.6,
    });
    await expect(transport.getContextUsage('missing-session')).resolves.toBeNull();

    harness.emit({ type: 'result', subtype: 'success', session_id: 'context-session', is_error: false });
    await turn.done;
    await transport.close();
  });

  it('reads context usage from a persisted conversation without sending or saving a prompt', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      createQuery: harness.createQuery,
      createSessionId: () => '20202020-2020-4020-8020-202020202020',
    });

    const result = transport.readContextUsage({
      ownerId: 'agent-claude',
      cwd: '/tmp/project',
      sessionId: '21212121-2121-4121-8121-212121212121',
      model: 'haiku',
      appendSystemPrompt: 'Claw instructions',
      mcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-claude',
      allowedTools: ['mcp__codex_claw__*'],
    });
    expect(harness.runtimes).toHaveLength(1);
    harness.runtimes[0]?.getContextUsage.mockResolvedValueOnce({
      categories: [],
      totalTokens: 33_120,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      percentage: 16.56,
      gridRows: [],
      model: 'claude-haiku-4-5',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
    });

    await expect(result).resolves.toStrictEqual({
      totalTokens: 33_120,
      maxTokens: 200_000,
      percentage: 16.56,
    });
    expect(harness.options[0]).toMatchObject({
      cwd: '/tmp/project',
      resume: '21212121-2121-4121-8121-212121212121',
      model: 'haiku',
      persistSession: false,
    });
    expect(harness.options[0]).not.toHaveProperty('sessionId');
    expect(harness.inputs).toStrictEqual([]);
    expect(harness.runtimes[0]?.close).toHaveBeenCalledOnce();
  });

  it('sends image, text, and PDF attachments as native Agent SDK content blocks', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-claude-attachments-'));
    const imagePath = path.join(directory, 'reference.png');
    const textPath = path.join(directory, 'notes.md');
    const pdfPath = path.join(directory, 'report.pdf');
    await Promise.all([
      writeFile(imagePath, Buffer.from('png bytes')),
      writeFile(textPath, '# Notes\nUse the narrow layout.'),
      writeFile(pdfPath, Buffer.from('pdf bytes')),
    ]);
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({ createQuery: harness.createQuery });

    try {
      const turn = transport.startTurn({
        cwd: directory,
        prompt: 'Review the attachments.',
        attachments: [
          { type: 'image', path: imagePath, name: 'reference.png', mimeType: 'image/png' },
          { type: 'file', path: textPath, name: 'notes.md', mimeType: 'application/octet-stream' },
          { type: 'file', path: pdfPath, name: 'report.pdf', mimeType: 'application/octet-stream' },
          { type: 'file', path: '/tmp/archive.zip', name: 'archive.zip', mimeType: 'application/zip' },
        ],
      }, () => undefined);

      await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));
      expect(harness.inputs[0]?.message.content).toStrictEqual([
        { type: 'text', text: 'Review the attachments.' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: Buffer.from('png bytes').toString('base64') },
        },
        {
          type: 'document',
          source: { type: 'text', media_type: 'text/plain', data: '# Notes\nUse the narrow layout.' },
          title: 'notes.md',
        },
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('pdf bytes').toString('base64') },
          title: 'report.pdf',
        },
        { type: 'text', text: 'Attached file "archive.zip" is available at /tmp/archive.zip.' },
      ]);

      harness.emit({ type: 'result', subtype: 'success', session_id: 'attachment-session', is_error: false });
      await turn.done;

      const attachmentOnlyTurn = transport.startTurn({
        cwd: directory,
        prompt: '',
        sessionId: 'attachment-session',
        attachments: [{ type: 'file', path: textPath, name: 'notes.md' }],
      }, () => undefined);
      await vi.waitFor(() => expect(harness.inputs).toHaveLength(2));
      expect(harness.inputs[1]?.message.content).toStrictEqual([{
        type: 'document',
        source: { type: 'text', media_type: 'text/plain', data: '# Notes\nUse the narrow layout.' },
        title: 'notes.md',
      }]);
      harness.emit({ type: 'result', subtype: 'success', session_id: 'attachment-session', is_error: false });
      await attachmentOnlyTurn.done;
    } finally {
      await transport.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('resumes a persisted session when no live SDK query exists', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({ createQuery: harness.createQuery });

    const turn = transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'resume me',
      sessionId: '22222222-2222-4222-8222-222222222222',
    }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));

    expect(harness.options[0]).toMatchObject({
      resume: '22222222-2222-4222-8222-222222222222',
    });
    expect(harness.options[0]).not.toHaveProperty('sessionId');
    harness.emit({ type: 'result', subtype: 'success', session_id: '22222222-2222-4222-8222-222222222222', is_error: false });
    await turn.done;
    await transport.close();
  });

  it('bridges Agent SDK permission requests and conversation-scoped decisions', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      createQuery: harness.createQuery,
      createSessionId: () => '33333333-3333-4333-8333-333333333333',
    });
    const requests: ClaudePermissionRequest[] = [];
    transport.startTurn({ cwd: '/tmp/project', prompt: 'edit it' }, () => undefined, (request) => requests.push(request));
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));
    const canUseTool = harness.options[0]?.canUseTool;
    expect(canUseTool).toBeTypeOf('function');
    const abortController = new AbortController();
    const permission = canUseTool?.('Edit', { file_path: '/tmp/project/a.ts' }, {
      signal: abortController.signal,
      toolUseID: 'tool-edit-1',
      requestId: 'request-edit-1',
      title: 'Claude wants to edit a.ts',
      displayName: 'Edit file',
      description: 'Claude will modify a.ts.',
      suggestions: [{
        type: 'addRules',
        rules: [{ toolName: 'Edit' }],
        behavior: 'allow',
        destination: 'localSettings',
      }],
    });

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toStrictEqual({
      kind: 'confirm_tool',
      id: 'request-edit-1',
      toolName: 'Edit',
      input: { file_path: '/tmp/project/a.ts' },
      title: 'Claude wants to edit a.ts',
      displayName: 'Edit file',
      description: 'Claude will modify a.ts.',
      allowConversation: true,
      allowAlways: true,
    });

    await transport.respondToPermissionRequest('request-edit-1', { decision: 'allow_conversation' });
    await expect(permission).resolves.toStrictEqual({
      behavior: 'allow',
      updatedInput: { file_path: '/tmp/project/a.ts' },
      updatedPermissions: [{
        type: 'addRules',
        rules: [{ toolName: 'Edit' }],
        behavior: 'allow',
        destination: 'session',
      }],
    });

    const question = canUseTool?.('AskUserQuestion', {
      questions: [{
        header: 'Approach',
        question: 'Which approach should I use?',
        options: [{ label: 'Simple', description: 'Use the smaller change.' }],
        multiSelect: false,
      }],
    }, {
      signal: abortController.signal,
      toolUseID: 'tool-question-1',
      requestId: 'request-question-1',
    });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toStrictEqual({
      kind: 'ask_user',
      id: 'request-question-1',
      toolName: 'AskUserQuestion',
      input: {
        questions: [{
          header: 'Approach',
          question: 'Which approach should I use?',
          options: [{ label: 'Simple', description: 'Use the smaller change.' }],
          multiSelect: false,
        }],
      },
      allowConversation: false,
      allowAlways: false,
      questions: [{
        id: 'Which approach should I use?',
        header: 'Approach',
        question: 'Which approach should I use?',
        isOther: true,
        isSecret: false,
        multiSelect: false,
        options: [{ label: 'Simple', description: 'Use the smaller change.' }],
      }],
    });
    await transport.respondToPermissionRequest('request-question-1', {
      answers: {
        'Which approach should I use?': { answers: ['Simple'] },
      },
    });
    await expect(question).resolves.toStrictEqual({
      behavior: 'allow',
      updatedInput: {
        questions: [{
          header: 'Approach',
          question: 'Which approach should I use?',
          options: [{ label: 'Simple', description: 'Use the smaller change.' }],
          multiSelect: false,
        }],
        answers: { 'Which approach should I use?': 'Simple' },
      },
    });

    await expect(canUseTool?.('ExitPlanMode', { plan: '# Plan' }, {
      signal: abortController.signal,
      toolUseID: 'tool-plan-1',
      requestId: 'request-plan-1',
    })).resolves.toStrictEqual({
      behavior: 'deny',
      message: 'Codex Claw captured the proposed plan. Wait for the user to review or request implementation.',
    });
    expect(requests).toHaveLength(2);

    const cancelledController = new AbortController();
    const cancelled = canUseTool?.('Bash', { command: 'npm test' }, {
      signal: cancelledController.signal,
      toolUseID: 'tool-cancelled-1',
      requestId: 'request-cancelled-1',
    });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    cancelledController.abort();
    await expect(cancelled).resolves.toStrictEqual({
      behavior: 'deny',
      message: 'Claude permission request was cancelled.',
    });
    await expect(transport.respondToPermissionRequest('request-cancelled-1', { decision: 'allow' }))
      .rejects.toThrow('no longer pending');
    await transport.close();
  });

  it('interrupts the live SDK turn without destroying the reusable session', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      createQuery: harness.createQuery,
      createSessionId: () => '44444444-4444-4444-8444-444444444444',
    });
    const turn = transport.startTurn({ cwd: '/tmp/project', prompt: 'keep going' }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));

    await turn.interrupt();
    expect(harness.runtimes[0]?.interrupt).toHaveBeenCalledOnce();
    await expect(turn.done).resolves.toBeUndefined();

    transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'try again',
      sessionId: '44444444-4444-4444-8444-444444444444',
    }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(2));
    expect(harness.createQuery).toHaveBeenCalledOnce();
    await transport.close();
  });

  it('rejects overlapping turns and prevents a resumed session from changing workspaces', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      createQuery: harness.createQuery,
      createSessionId: () => '55555555-5555-4555-8555-555555555555',
    });
    const first = transport.startTurn({ cwd: '/tmp/project', prompt: 'first' }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));

    expect(() => transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'overlap',
      sessionId: '55555555-5555-4555-8555-555555555555',
    }, () => undefined)).toThrow('already has an active turn');

    harness.emit({
      type: 'result',
      subtype: 'success',
      session_id: '55555555-5555-4555-8555-555555555555',
      is_error: false,
    });
    await first.done;
    expect(() => transport.startTurn({
      cwd: '/tmp/other-project',
      prompt: 'wrong workspace',
      sessionId: '55555555-5555-4555-8555-555555555555',
    }, () => undefined)).toThrow('workspace does not match');
    await transport.close();
  });

  it('adopts the runtime session id and fails closed when no permission UI is available', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      createQuery: harness.createQuery,
      createSessionId: () => '66666666-6666-4666-8666-666666666666',
    });
    const first = transport.startTurn({ cwd: '/tmp/project', prompt: 'first' }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));
    const canUseTool = harness.options[0]?.canUseTool;
    const abortController = new AbortController();
    await expect(canUseTool?.('Bash', { command: 'npm test' }, {
      signal: abortController.signal,
      toolUseID: 'tool-no-ui',
      requestId: 'request-no-ui',
    })).resolves.toStrictEqual({
      behavior: 'deny',
      message: 'Codex Claw cannot display this Claude permission request.',
    });

    harness.emit({ type: 'system', subtype: 'init', session_id: '77777777-7777-4777-8777-777777777777' });
    harness.emit({ type: 'result', subtype: 'success', session_id: '77777777-7777-4777-8777-777777777777', is_error: false });
    await first.done;
    const second = transport.startTurn({
      cwd: '/tmp/project',
      prompt: 'second',
      sessionId: '77777777-7777-4777-8777-777777777777',
    }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(2));
    expect(harness.createQuery).toHaveBeenCalledOnce();
    await second.interrupt();
    await transport.close();
  });

  it('restarts an idle query when its agent-owned configuration changes', async () => {
    const harness = createQueryHarness();
    const transport = new ClaudeAgentSdkTransport({
      createQuery: harness.createQuery,
      createSessionId: () => '88888888-8888-4888-8888-888888888888',
    });
    const first = transport.startTurn({
      ownerId: 'agent-one',
      cwd: '/tmp/project',
      prompt: 'first',
      appendSystemPrompt: 'Agent one',
    }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(1));
    harness.emit({ type: 'result', subtype: 'success', session_id: '88888888-8888-4888-8888-888888888888', is_error: false });
    await first.done;

    transport.startTurn({
      ownerId: 'agent-two',
      cwd: '/tmp/project',
      prompt: 'second',
      sessionId: '88888888-8888-4888-8888-888888888888',
      appendSystemPrompt: 'Agent two',
    }, () => undefined);
    await vi.waitFor(() => expect(harness.inputs).toHaveLength(2));
    expect(harness.createQuery).toHaveBeenCalledTimes(2);
    expect(harness.options[1]).toMatchObject({
      resume: '88888888-8888-4888-8888-888888888888',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Agent two' },
    });
    await transport.close();
  });
});

function createQueryHarness(initializationModels: Array<Record<string, unknown>> = []): {
  createQuery: ReturnType<typeof vi.fn<ClaudeQueryFactory>>;
  inputs: SDKUserMessage[];
  options: ClaudeQueryOptions[];
  runtimes: Array<ClaudeQueryRuntime & {
    interrupt: ReturnType<typeof vi.fn>;
    setModel: ReturnType<typeof vi.fn>;
    setPermissionMode: ReturnType<typeof vi.fn>;
    applyFlagSettings: ReturnType<typeof vi.fn>;
    supportedModels: ReturnType<typeof vi.fn>;
    initializationResult: ReturnType<typeof vi.fn>;
    getContextUsage: ReturnType<typeof vi.fn>;
  }>;
  emit(message: ClaudeSdkMessage): void;
} {
  const inputs: SDKUserMessage[] = [];
  const options: ClaudeQueryOptions[] = [];
  const runtimes: Array<ClaudeQueryRuntime & {
    interrupt: ReturnType<typeof vi.fn>;
    setModel: ReturnType<typeof vi.fn>;
    setPermissionMode: ReturnType<typeof vi.fn>;
    applyFlagSettings: ReturnType<typeof vi.fn>;
    supportedModels: ReturnType<typeof vi.fn>;
    initializationResult: ReturnType<typeof vi.fn>;
    getContextUsage: ReturnType<typeof vi.fn>;
  }> = [];
  let output = new TestAsyncQueue<SDKMessage>();
  const createQuery = vi.fn<ClaudeQueryFactory>((input) => {
    options.push(input.options);
    void collectInputs(input.prompt, inputs);
    output = new TestAsyncQueue<SDKMessage>();
    const runtime: ClaudeQueryRuntime & {
      interrupt: ReturnType<typeof vi.fn>;
      setModel: ReturnType<typeof vi.fn>;
      setPermissionMode: ReturnType<typeof vi.fn>;
      applyFlagSettings: ReturnType<typeof vi.fn>;
      supportedModels: ReturnType<typeof vi.fn>;
      initializationResult: ReturnType<typeof vi.fn>;
      getContextUsage: ReturnType<typeof vi.fn>;
    } = {
      [Symbol.asyncIterator]: () => output[Symbol.asyncIterator](),
      interrupt: vi.fn().mockResolvedValue(undefined),
      setModel: vi.fn().mockResolvedValue(undefined),
      setPermissionMode: vi.fn().mockResolvedValue(undefined),
      applyFlagSettings: vi.fn().mockResolvedValue(undefined),
      supportedModels: vi.fn().mockResolvedValue([]),
      initializationResult: vi.fn().mockResolvedValue({ models: initializationModels }),
      getContextUsage: vi.fn().mockResolvedValue({
        categories: [],
        totalTokens: 0,
        maxTokens: 200_000,
        rawMaxTokens: 200_000,
        percentage: 0,
        gridRows: [],
        model: 'sonnet',
        memoryFiles: [],
        mcpTools: [],
        agents: [],
      }),
      close: vi.fn(() => output.close()),
    };
    runtimes.push(runtime);
    return runtime;
  });

  return {
    createQuery,
    inputs,
    options,
    runtimes,
    emit: (message) => output.push(message as SDKMessage),
  };
}

async function collectInputs(input: AsyncIterable<SDKUserMessage>, values: SDKUserMessage[]): Promise<void> {
  for await (const message of input) {
    values.push(message);
  }
}

class TestAsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
    } else {
      this.values.push(value);
    }
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
