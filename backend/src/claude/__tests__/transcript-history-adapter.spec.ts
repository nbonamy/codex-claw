import { mkdir, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { claudeTranscriptToRendererMessages, listClaudeTranscriptSummaries, loadClaudeTranscriptHistory } from '../transcript-history-adapter';
import type { Agent } from '@codex-claw/shared/contracts';

describe('claudeTranscriptToRendererMessages', () => {
  it('translates Claude JSONL transcript records into renderer messages', () => {
    const content = [
      JSON.stringify({ type: 'queue-operation', operation: 'enqueue', content: 'ignored' }),
      JSON.stringify({
        type: 'user',
        uuid: 'user-1',
        promptId: 'prompt-1',
        timestamp: '2026-06-06T22:33:42.809Z',
        message: { role: 'user', content: 'read README.md' },
      }),
      JSON.stringify({
        type: 'attachment',
        attachment: { type: 'skill_listing', content: 'ignored' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: '2026-06-06T22:33:43.100Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will read it.' },
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'README.md' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'tool-result-1',
        timestamp: '2026-06-06T22:33:43.200Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: '# Codex Claw' }],
        },
      }),
      JSON.stringify({ type: 'last-prompt', lastPrompt: 'ignored' }),
    ].join('\n');

    expect(claudeTranscriptToRendererMessages(content, 'agent-claude', 'session-1')).toStrictEqual([
      {
        id: 'user-session-1-user-1',
        agentId: 'agent-claude',
        role: 'user',
        status: 'complete',
        turnId: 'claude-prompt-1',
        createdAt: '2026-06-06T22:33:42.809Z',
        parts: [{ type: 'text', text: 'read README.md' }],
      },
      {
        id: 'assistant-claude-prompt-1',
        agentId: 'agent-claude',
        role: 'assistant',
        status: 'complete',
        turnId: 'claude-prompt-1',
        createdAt: '2026-06-06T22:33:43.100Z',
        parts: [
          { type: 'text', text: 'I will read it.' },
          {
            type: 'tool',
            id: 'tool-1',
            kind: 'generic',
            title: 'Read',
            status: 'completed',
            input: { file_path: 'README.md' },
            output: '# Codex Claw',
            body: '# Codex Claw',
            metadata: {
              provider: 'claude',
              itemType: 'tool_use',
            },
          },
        ],
      },
    ]);
  });

  it('ignores Claude meta user records and sidechain entries', () => {
    const content = [
      JSON.stringify({
        type: 'user',
        uuid: 'meta-1',
        isMeta: true,
        message: { role: 'user', content: '<local-command-caveat>ignore</local-command-caveat>' },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'sidechain-1',
        isSidechain: true,
        message: { role: 'user', content: 'ignore sidechain' },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'user-1',
        promptId: 'prompt-1',
        message: { role: 'user', content: 'keep this' },
      }),
    ].join('\n');

    expect(claudeTranscriptToRendererMessages(content, 'agent-claude', 'session-1')).toStrictEqual([
      expect.objectContaining({
        id: 'user-session-1-user-1',
        parts: [{ type: 'text', text: 'keep this' }],
      }),
    ]);
  });
});

describe('loadClaudeTranscriptHistory', () => {
  it('loads the transcript for a persisted Claude session from the project directory', async () => {
    const projectsRoot = path.join(tmpdir(), `codex-claw-claude-history-${Date.now()}`);
    const projectDirectory = path.join(projectsRoot, '-Users-nbonamy-src-id8');
    await mkdir(projectDirectory, { recursive: true });
    await writeFile(path.join(projectDirectory, 'session-1.jsonl'), JSON.stringify({
      type: 'user',
      uuid: 'user-1',
      promptId: 'prompt-1',
      message: { role: 'user', content: 'hello' },
    }));

    const agent: Agent = {
      id: 'agent-claude',
      name: 'Claude',
      folder: '/Users/nbonamy/src/id8',
      backend: 'claude',
      backendSession: { kind: 'claude', sessionId: 'session-1', transport: 'stdio' },
      status: { type: 'idle' },
      createdAt: '2026-06-06T00:00:00.000Z',
      updatedAt: '2026-06-06T00:00:00.000Z',
    };

    await expect(loadClaudeTranscriptHistory(agent, { projectsRoot })).resolves.toStrictEqual({
      backendSession: { kind: 'claude', sessionId: 'session-1', transcriptSessionId: 'session-1', transport: 'stdio' },
      messages: [
        expect.objectContaining({
          id: 'user-session-1-user-1',
          parts: [{ type: 'text', text: 'hello' }],
        }),
      ],
    });
  });
});

describe('listClaudeTranscriptSummaries', () => {
  it('lists Claude project transcripts newest first with user-facing titles', async () => {
    const projectsRoot = path.join(tmpdir(), `codex-claw-claude-list-${Date.now()}`);
    const projectDirectory = path.join(projectsRoot, '-Users-nbonamy-src-id8');
    await mkdir(projectDirectory, { recursive: true });
    await writeFile(path.join(projectDirectory, 'session-old.jsonl'), [
      JSON.stringify({
        type: 'user',
        uuid: 'user-1',
        message: { role: 'user', content: 'older prompt' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'assistant-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'older answer' }] },
      }),
    ].join('\n'));
    await writeFile(path.join(projectDirectory, 'session-new.jsonl'), [
      JSON.stringify({
        type: 'user',
        uuid: 'meta-1',
        isMeta: true,
        message: { role: 'user', content: '<local-command-caveat>ignore</local-command-caveat>' },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'user-2',
        message: { role: 'user', content: '<command-name>plan</command-name><command-args>ship history</command-args>' },
      }),
    ].join('\n'));
    await writeFile(path.join(projectDirectory, 'not-a-session.txt'), 'ignored');

    await utimes(path.join(projectDirectory, 'session-old.jsonl'), new Date('2026-06-09T10:00:00.000Z'), new Date('2026-06-09T10:00:00.000Z'));
    await utimes(path.join(projectDirectory, 'session-new.jsonl'), new Date('2026-06-09T11:00:00.000Z'), new Date('2026-06-09T11:00:00.000Z'));

    const agent: Agent = {
      id: 'agent-claude',
      name: 'Claude',
      folder: '/Users/nbonamy/src/id8',
      backend: 'claude',
      status: { type: 'idle' },
      createdAt: '2026-06-06T00:00:00.000Z',
      updatedAt: '2026-06-06T00:00:00.000Z',
    };

    await expect(listClaudeTranscriptSummaries(agent, { projectsRoot })).resolves.toStrictEqual([
      {
        id: 'session-new',
        title: '/plan ship history',
        updatedAt: '2026-06-09T11:00:00.000Z',
        messageCount: 1,
        ref: { backend: 'claude', folder: '/Users/nbonamy/src/id8', sessionId: 'session-new' },
      },
      {
        id: 'session-old',
        title: 'older prompt',
        updatedAt: '2026-06-09T10:00:00.000Z',
        messageCount: 2,
        ref: { backend: 'claude', folder: '/Users/nbonamy/src/id8', sessionId: 'session-old' },
      },
    ]);
  });
});
