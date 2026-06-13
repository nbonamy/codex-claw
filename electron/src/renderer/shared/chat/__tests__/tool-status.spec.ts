import { describe, expect, it } from 'vitest';
import { getToolDisplayTitle, getToolFallbackTitle, getToolLineDiff, parseToolStatusDescriptor } from '../tool-status';
import type { MessageToolCall } from '../types';

describe('tool status helpers', () => {
  it('parses valid status descriptors and rejects invalid values', () => {
    expect(parseToolStatusDescriptor('not json')).toBeUndefined();
    expect(parseToolStatusDescriptor('{"source":"codex"}')).toBeUndefined();
    expect(parseToolStatusDescriptor('{"source":"codex","action":"edit","phase":"done","params":{"addedLines":4}}')).toStrictEqual({
      action: 'edit',
      phase: 'done',
      params: { addedLines: 4 },
      source: 'codex',
    });
    expect(parseToolStatusDescriptor('{"source":"codex","action":"edit","phase":"done","params":[]}')).toStrictEqual({
      action: 'edit',
      phase: 'done',
      params: undefined,
      source: 'codex',
    });
  });

  it('extracts line diffs from descriptor params', () => {
    expect(getToolLineDiff(undefined)).toBeUndefined();
    expect(getToolLineDiff({
      action: 'edit',
      phase: 'done',
      params: { addedLines: 3, removedLines: 1 },
      source: 'codex',
    })).toStrictEqual({ addedLines: 3, removedLines: 1 });
  });

  it('formats fallback titles by running state', () => {
    const tool: MessageToolCall = {
      args: undefined,
      function: 'npm test',
      id: 'tool',
      result: undefined,
      state: 'running',
    };

    expect(getToolFallbackTitle(tool)).toBe('Running npm test');
    expect(getToolFallbackTitle({ ...tool, done: true, state: 'completed' })).toBe('Ran npm test');
  });

  it('formats Codex file creation and deletion titles', () => {
    const tool: MessageToolCall = {
      args: undefined,
      done: true,
      function: 'fileChange',
      id: 'tool',
      result: undefined,
      state: 'completed',
      status: 'completed',
    };

    expect(getToolDisplayTitle(tool, {
      action: 'create',
      phase: 'completed',
      params: { target: 'LISEZMOI.md' },
      source: 'codex',
    })).toBe('Created LISEZMOI.md');

    expect(getToolDisplayTitle(tool, {
      action: 'delete',
      phase: 'completed',
      params: { target: 'old.ts' },
      source: 'codex',
    })).toBe('Deleted old.ts');
  });

  it('formats Codex plan progress titles by operation and phase', () => {
    const tool: MessageToolCall = {
      args: undefined,
      done: false,
      function: 'plan',
      id: 'tool',
      result: undefined,
      state: 'running',
      status: 'running',
    };

    expect(getToolDisplayTitle(tool, {
      action: 'plan',
      phase: 'running',
      params: { operation: 'write' },
      source: 'codex',
    })).toBe('Writing plan');
    expect(getToolDisplayTitle({ ...tool, done: true, state: 'completed', status: 'completed' }, {
      action: 'plan',
      phase: 'completed',
      params: { operation: 'update' },
      source: 'codex',
    })).toBe('Updated plan');
  });

  it.each([
    ['codex_claw.register-agent', { agentId: 'agent-dina' }, 'Registered agent'],
    ['codex_claw.list-agents', { agentId: 'agent-dina' }, 'Listed agents'],
    ['codex_claw.check-messages', { agentId: 'agent-dina' }, 'Checked messages'],
    ['codex_claw.display-markdown', { path: 'docs/mcp.md' }, 'Displayed mcp.md'],
    ['mcp__codex_claw__display-markdown', { markdown: '# Plan', title: 'Plan' }, 'Displayed Plan'],
    ['mcp_codex_claw_display-markdown', { markdown: '# Notes' }, 'Displayed Markdown'],
    ['codex_claw.send-message', { to: 'Manny' }, 'Sent message to Manny'],
    ['codex_claw.broadcast-message', { from: 'agent-dina' }, 'Broadcast message'],
    ['codex_claw.set-status', { status: 'Running tests' }, 'Updated status'],
    ['codex_claw.set-status', { status: '' }, 'Cleared status'],
    ['codex_claw.mark-work-item-completed', { workItemId: 'github:nbonamy/codex-claw#12' }, 'Marked work item complete'],
    ['mcp__codex_claw__send-message', { to: 'Manny' }, 'Sent message to Manny'],
    ['mcp_codex_claw_send-message', { to: 'Manny' }, 'Sent message to Manny'],
  ])('formats Codex Claw MCP %s titles', (name, args, expected) => {
    expect(getToolDisplayTitle({
      args,
      done: true,
      function: name,
      id: 'tool',
      result: undefined,
      state: 'completed',
      status: 'completed',
    }, undefined)).toBe(expected);
  });

  it('formats Codex Claw MCP titles by running and failed state', () => {
    const tool: MessageToolCall = {
      args: { to: 'Manny' },
      done: false,
      function: 'codex_claw.send-message',
      id: 'tool',
      result: undefined,
      state: 'running',
      status: 'running',
    };

    expect(getToolDisplayTitle(tool, undefined)).toBe('Sending message to Manny');
    expect(getToolDisplayTitle({ ...tool, done: true, state: 'error', status: 'failed' }, undefined)).toBe('Failed sending message to Manny');
  });

  it('formats Codex Claw display markdown titles by running and failed state', () => {
    const tool: MessageToolCall = {
      args: { path: '/Users/nbonamy/src/codex-claw/README.md' },
      done: false,
      function: 'mcp__codex_claw__display-markdown',
      id: 'tool',
      result: undefined,
      state: 'running',
      status: 'running',
    };

    expect(getToolDisplayTitle(tool, undefined)).toBe('Displaying README.md');
    expect(getToolDisplayTitle({ ...tool, done: true, state: 'error', status: 'failed' }, undefined)).toBe('Failed displaying README.md');
  });

  it('honors descriptor phases for Codex Claw MCP titles', () => {
    const tool: MessageToolCall = {
      args: {},
      done: true,
      function: 'codex_claw.list-agents',
      id: 'tool',
      result: undefined,
      state: 'completed',
      status: 'completed',
    };

    expect(getToolDisplayTitle(tool, {
      action: 'run',
      phase: 'running',
      source: 'mcp',
    })).toBe('Listing agents');
    expect(getToolDisplayTitle(tool, {
      action: 'run',
      phase: 'failed',
      source: 'mcp',
    })).toBe('Failed listing agents');
  });
});
