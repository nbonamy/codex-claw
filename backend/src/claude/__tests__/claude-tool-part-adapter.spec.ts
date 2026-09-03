import { describe, expect, it } from 'vitest';
import {
  claudeToolFileActivity,
  claudeToolPart,
  claudeToolPartInputUpdate,
  completedClaudeToolPart,
} from '../claude-tool-part-adapter';

describe('Claude tool part adapter', () => {
  it('preserves Bash commands and descriptions as a command tool', () => {
    const part = claudeToolPart({
      type: 'tool_use',
      id: 'bash-1',
      name: 'Bash',
      input: {
        command: 'npm test',
        description: 'Run the test suite',
      },
    }, { cwd: '/workspace/project' });

    expect(part).toStrictEqual({
      type: 'tool',
      id: 'bash-1',
      kind: 'command',
      title: 'npm test',
      status: 'running',
      statusText: JSON.stringify({
        source: 'claude',
        action: 'run',
        phase: 'running',
        params: { target: 'npm test' },
      }),
      input: {
        command: 'npm test',
        description: 'Run the test suite',
        cwd: '/workspace/project',
      },
      metadata: {
        provider: 'claude',
        itemType: 'tool_use',
        claudeToolName: 'Bash',
      },
    });
  });

  it('maps reads to linked file inputs and file activity', () => {
    const part = claudeToolPart({
      type: 'tool_use',
      id: 'read-1',
      name: 'Read',
      input: { file_path: 'README.md', offset: 10 },
    }, { cwd: '/workspace/project' });

    expect(part).toMatchObject({
      kind: 'command',
      title: 'Read',
      input: {
        file_path: 'README.md',
        offset: 10,
        path: '/workspace/project/README.md',
        cwd: '/workspace/project',
      },
      statusText: JSON.stringify({
        source: 'claude',
        action: 'read',
        phase: 'running',
        params: { target: 'README.md' },
      }),
    });
    expect(claudeToolFileActivity(part)).toStrictEqual({
      action: 'read',
      path: '/workspace/project/README.md',
    });
  });

  it('maps edits to file changes with exact changed-line counts', () => {
    const part = claudeToolPart({
      type: 'tool_use',
      id: 'edit-1',
      name: 'Edit',
      input: {
        file_path: '/workspace/project/src/app.ts',
        old_string: 'const a = 1;\nconst b = 2;',
        new_string: 'const a = 1;\nconst b = 3;\nconst c = 4;',
      },
    }, { cwd: '/workspace/project' });

    expect(part).toMatchObject({
      kind: 'fileChange',
      title: '1 file change',
      input: {
        path: '/workspace/project/src/app.ts',
        changes: [{
          kind: 'update',
          path: '/workspace/project/src/app.ts',
          addedLines: 2,
          removedLines: 1,
        }],
      },
      metadata: {
        changes: [{
          kind: 'update',
          path: '/workspace/project/src/app.ts',
          addedLines: 2,
          removedLines: 1,
        }],
      },
      statusText: JSON.stringify({
        source: 'claude',
        action: 'edit',
        phase: 'running',
        params: {
          target: 'app.ts',
          addedLines: 2,
          removedLines: 1,
        },
      }),
    });
    expect(claudeToolFileActivity(part)).toStrictEqual({
      action: 'edit',
      path: '/workspace/project/src/app.ts',
    });
  });

  it('preserves MCP identity for Claw-owned tool presentation', () => {
    expect(claudeToolPart({
      type: 'tool_use',
      id: 'mcp-1',
      name: 'mcp__codex_claw__set_status',
      input: { status: 'Testing' },
    })).toMatchObject({
      kind: 'mcp',
      title: 'codex_claw.set_status',
      metadata: {
        provider: 'claude',
        server: 'codex_claw',
        tool: 'set_status',
      },
    });
  });

  it('projects announcement phases without retaining the spoken phrase', () => {
    const part = claudeToolPart({
      type: 'tool_use',
      id: 'announce-1',
      name: 'mcp__codex_claw__announce',
      input: { phase: 'finish', text: 'A phrase that must not enter renderer state.' },
    });

    expect(part).toMatchObject({
      kind: 'mcp',
      input: { phase: 'finish' },
      metadata: { server: 'codex_claw', tool: 'announce' },
    });
    expect(JSON.stringify(part)).not.toContain('phrase that must not');
  });

  it('updates streamed inputs and completed semantic phases', () => {
    const running = claudeToolPart({
      type: 'tool_use',
      id: 'grep-1',
      name: 'Grep',
      input: { pattern: 'TODO', path: 'src' },
    });
    expect(claudeToolPartInputUpdate(running)).toMatchObject({
      itemId: 'grep-1',
      title: 'Grep',
      input: { pattern: 'TODO', path: 'src' },
      fallbackToolPart: running,
    });

    const completed = completedClaudeToolPart(running, 'completed', 'src/app.ts', 'src/app.ts');
    expect(completed).toMatchObject({
      status: 'completed',
      body: 'src/app.ts',
      output: 'src/app.ts',
      statusText: JSON.stringify({
        source: 'claude',
        action: 'search',
        phase: 'completed',
        params: { target: '"TODO" in src' },
      }),
    });
  });
});
