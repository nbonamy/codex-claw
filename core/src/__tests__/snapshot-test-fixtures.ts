import type { RendererToolPart, RendererToolPartUpdate } from '../contracts';
import { toolOutputText } from '../tool-output';
export function toolPartPayload(toolPart: RendererToolPart): { toolPart: RendererToolPart } {
  return { toolPart };
}

export function commandToolPart(input: {
  id: string;
  title: string;
  status: RendererToolPart['status'];
  body?: string;
  cwd?: string;
  commandActions?: unknown;
  exitCode?: number;
  durationMs?: number;
}): RendererToolPart {
  return {
    type: 'tool',
    id: input.id,
    kind: 'command',
    title: input.title,
    status: input.status,
    body: input.body,
    input: {
      command: input.title,
      cwd: input.cwd,
      commandActions: input.commandActions,
    },
    output: {
      exitCode: input.exitCode,
      durationMs: input.durationMs,
    },
    metadata: {
      source: undefined,
      processId: undefined,
    },
  };
}

export function mcpToolPart(input: {
  id: string;
  title: string;
  status: RendererToolPart['status'];
  body?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}): RendererToolPart {
  return {
    type: 'tool',
    id: input.id,
    kind: 'mcp',
    title: input.title,
    status: input.status,
    body: input.body,
    input: input.input,
    output: input.output,
    metadata: input.metadata,
  };
}

export function dynamicToolPart(input: {
  id: string;
  title: string;
  status: RendererToolPart['status'];
  statusText?: string;
  body?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}): RendererToolPart {
  return {
    type: 'tool',
    id: input.id,
    kind: 'dynamic',
    title: input.title,
    status: input.status,
    ...(input.statusText !== undefined ? { statusText: input.statusText } : {}),
    body: input.body,
    input: input.input,
    output: input.output,
    metadata: input.metadata,
  };
}

export function fileChangeToolPart(
  id: string,
  changes: unknown[],
  status: RendererToolPart['status'],
): RendererToolPart {
  return {
    type: 'tool',
    id,
    kind: 'fileChange',
    title: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
    status,
    body: fileChangesText(changes),
    input: { changes },
    metadata: { changes },
  };
}

export function commandOutputDeltaToToolPartUpdate(itemId: string, delta: string): RendererToolPartUpdate {
  return {
    itemId,
    bodyDelta: delta,
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'command',
      title: 'Command',
      status: 'running',
    },
  };
}

export function mcpProgressToToolPartUpdate(itemId: string, message: string): RendererToolPartUpdate {
  return {
    itemId,
    bodyAppend: message,
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'mcp',
      title: 'MCP tool',
      status: 'running',
    },
  };
}

export function fileChangePatchToToolPartUpdate(itemId: string, changes: unknown[]): RendererToolPartUpdate {
  return {
    itemId,
    body: fileChangesText(changes),
    input: { changes },
    metadata: { changes },
    fallbackToolPart: fileChangeToolPart(itemId, changes, 'running'),
  };
}

export function rawOutputToToolPartUpdate(
  itemId: string,
  output: unknown,
  title?: string,
  status: RendererToolPart['status'] = 'completed',
): RendererToolPartUpdate {
  const body = toolOutputText(output);
  return {
    itemId,
    title,
    status,
    body,
    output,
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'generic',
      title: title ?? 'Tool output',
      status,
      body,
      output,
    },
  };
}

function fileChangesText(changes: unknown[]): string | undefined {
  return changes
    .map((change) => {
      if (typeof change !== 'object' || change === null || Array.isArray(change)) {
        return JSON.stringify(change);
      }

      const record = change as Record<string, unknown>;
      const kind = typeof record.kind === 'string' ? record.kind : 'update';
      const path = typeof record.path === 'string' ? record.path : 'unknown';
      return `${kind} ${path}`;
    })
    .join('\n') || undefined;
}
