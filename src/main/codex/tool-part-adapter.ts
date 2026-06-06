import type { RendererToolPart, RendererToolPartUpdate } from '../../shared/contracts';
import { toolOutputText } from '../../shared/tool-output';

const structuredToolResultNotice = 'Result returned in structuredContent.';

export function codexThreadItemToToolPart(item: unknown): RendererToolPart | null {
  if (!isRecord(item) || typeof item.id !== 'string' || typeof item.type !== 'string') {
    return null;
  }

  if (item.type === 'commandExecution') {
    const command = typeof item.command === 'string' ? item.command : 'command';
    const status = rendererToolStatus(item.status);
    const statusText = commandStatusText(status, item.commandActions, command);
    return {
      type: 'tool',
      id: item.id,
      kind: 'command',
      title: command,
      status,
      ...(statusText ? { statusText } : {}),
      body: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : undefined,
      input: {
        command,
        cwd: typeof item.cwd === 'string' ? item.cwd : undefined,
        commandActions: item.commandActions,
      },
      output: {
        exitCode: typeof item.exitCode === 'number' ? item.exitCode : undefined,
        durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
      },
      metadata: {
        source: item.source,
        processId: item.processId,
      },
    };
  }

  if (item.type === 'mcpToolCall') {
    const server = typeof item.server === 'string' ? item.server : 'mcp';
    const tool = typeof item.tool === 'string' ? item.tool : 'tool';
    const errorMessage = mcpErrorMessage(item.error);
    return {
      type: 'tool',
      id: item.id,
      kind: 'mcp',
      title: `${server}.${tool}`,
      status: rendererToolStatus(item.status),
      body: errorMessage ?? mcpResultText(item.result),
      input: item.arguments,
      output: item.result,
      metadata: {
        server,
        tool,
        pluginId: item.pluginId,
        mcpAppResourceUri: item.mcpAppResourceUri,
        durationMs: item.durationMs,
      },
    };
  }

  if (item.type === 'dynamicToolCall') {
    const tool = typeof item.tool === 'string' ? item.tool : 'tool';
    const namespace = typeof item.namespace === 'string' ? item.namespace : null;
    return {
      type: 'tool',
      id: item.id,
      kind: 'dynamic',
      title: namespace ? `${namespace}.${tool}` : tool,
      status: rendererToolStatus(item.status),
      body: dynamicToolContentText(item.contentItems),
      input: item.arguments,
      output: item.contentItems,
      metadata: {
        namespace,
        tool,
        success: item.success,
        durationMs: item.durationMs,
      },
    };
  }

  if (item.type === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const status = rendererToolStatus(item.status);
    const statusText = fileChangeStatusText(status, changes);
    return {
      type: 'tool',
      id: item.id,
      kind: 'fileChange',
      title: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
      status,
      ...(statusText ? { statusText } : {}),
      body: fileChangesText(changes),
      input: { changes },
      metadata: {
        changes,
      },
    };
  }

  if (item.type === 'webSearch') {
    const query = typeof item.query === 'string' && item.query.trim() ? item.query.trim() : 'web search';
    return {
      type: 'tool',
      id: item.id,
      kind: 'generic',
      title: 'Web search',
      status: 'completed',
      body: query,
      input: item.action ?? { query },
      metadata: {
        query,
        action: item.action,
      },
    };
  }

  if (item.type === 'imageGeneration') {
    return {
      type: 'tool',
      id: item.id,
      kind: 'dynamic',
      title: 'image_generation',
      status: rendererToolStatus(item.status),
      body: typeof item.revisedPrompt === 'string' ? item.revisedPrompt : undefined,
      input: {
        revisedPrompt: item.revisedPrompt,
      },
      output: item.savedPath ?? item.result,
      metadata: {
        savedPath: item.savedPath,
      },
    };
  }

  return null;
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

export function fileChangePatchToToolPartUpdate(itemId: string, changes: unknown[]): RendererToolPartUpdate {
  const statusText = fileChangeStatusText('running', changes);
  return {
    itemId,
    body: fileChangesText(changes),
    ...(statusText ? { statusText } : {}),
    input: { changes },
    metadata: { changes },
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'fileChange',
      title: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
      status: 'running',
      ...(statusText ? { statusText } : {}),
      body: fileChangesText(changes),
      input: { changes },
      metadata: { changes },
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

export function rawOutputToToolPartUpdate(itemId: string, output: unknown, title?: string, status: unknown = 'completed'): RendererToolPartUpdate {
  return {
    itemId,
    title: title && title.trim() ? title : undefined,
    status: rendererToolStatus(status),
    body: toolOutputText(output),
    output,
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'generic',
      title: title && title.trim() ? title : 'Tool output',
      status: rendererToolStatus(status),
      body: toolOutputText(output),
      output,
    },
  };
}

function rendererToolStatus(status: unknown): RendererToolPart['status'] {
  if (status === 'completed' || status === 'succeeded' || status === 'success') {
    return 'completed';
  }

  if (status === 'failed' || status === 'error' || status === 'declined' || status === 'incomplete' || status === 'canceled' || status === 'cancelled') {
    return 'failed';
  }

  return 'running';
}

function commandStatusText(status: RendererToolPart['status'], commandActions: unknown, command: string): string | undefined {
  const descriptor = commandStatusDescriptor(status, commandActions, command);
  return descriptor ? JSON.stringify(descriptor) : undefined;
}

function commandStatusDescriptor(status: RendererToolPart['status'], commandActions: unknown, command: string): {
  action: 'edit' | 'explore' | 'list' | 'read' | 'run' | 'search';
  phase: RendererToolPart['status'];
  params: Record<string, unknown>;
  source: 'codex';
} | undefined {
  const actions = normalizedCommandActions(commandActions);
  if (!actions.length) {
    return undefined;
  }

  const knownActions = actions.filter((action) => action.type !== 'unknown');
  const actionTypes = new Set(knownActions.map((action) => action.type));
  if (knownActions.length === 0) {
    return {
      action: 'run',
      phase: status,
      params: { target: command },
      source: 'codex',
    };
  }

  if (actionTypes.size === 1 && actionTypes.has('read')) {
    const names = uniqueNonEmpty(knownActions.map((action) => action.name));
    return {
      action: 'read',
      phase: status,
      params: {
        names,
        target: formatTargetList(names, command),
      },
      source: 'codex',
    };
  }

  if (actionTypes.size === 1 && actionTypes.has('listFiles')) {
    const targets = uniqueNonEmpty(knownActions.map((action) => action.path ?? action.command));
    return {
      action: 'list',
      phase: status,
      params: {
        targets,
        target: formatTargetList(targets, command),
      },
      source: 'codex',
    };
  }

  if (actionTypes.size === 1 && actionTypes.has('search')) {
    const searches = knownActions.map((action) => {
      if (action.query && action.path) {
        return `"${action.query}" in ${action.path}`;
      }

      return action.query ?? action.path ?? action.command;
    });
    const targets = uniqueNonEmpty(searches);
    return {
      action: 'search',
      phase: status,
      params: {
        targets,
        target: formatTargetList(targets, command),
      },
      source: 'codex',
    };
  }

  return {
    action: 'explore',
    phase: status,
    params: {
      actions: knownActions.map((action) => action.type),
    },
    source: 'codex',
  };
}

type NormalizedCommandAction = {
  command?: string;
  name?: string;
  path?: string;
  query?: string;
  type: 'listFiles' | 'read' | 'search' | 'unknown';
};

function normalizedCommandActions(value: unknown): NormalizedCommandAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.type !== 'string') {
      return [];
    }

    if (entry.type !== 'read' && entry.type !== 'listFiles' && entry.type !== 'search' && entry.type !== 'unknown') {
      return [];
    }

    return [{
      command: typeof entry.command === 'string' ? entry.command : undefined,
      name: typeof entry.name === 'string' ? entry.name : undefined,
      path: typeof entry.path === 'string' ? entry.path : undefined,
      query: typeof entry.query === 'string' ? entry.query : undefined,
      type: entry.type,
    }];
  });
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function formatTargetList(values: string[], fallback: string): string {
  if (values.length === 0) {
    return fallback;
  }

  if (values.length <= 3) {
    return values.join(', ');
  }

  return `${values.slice(0, 3).join(', ')} and ${values.length - 3} more`;
}

function fileChangeStatusText(status: RendererToolPart['status'], changes: unknown[]): string | undefined {
  const descriptor = fileChangeStatusDescriptor(status, changes);
  return descriptor ? JSON.stringify(descriptor) : undefined;
}

function fileChangeStatusDescriptor(status: RendererToolPart['status'], changes: unknown[]): {
  action: 'create' | 'delete' | 'edit';
  phase: RendererToolPart['status'];
  params: Record<string, unknown>;
  source: 'codex';
} | undefined {
  const normalizedChanges = changes.flatMap((change) => {
    if (!isRecord(change)) {
      return [];
    }

    const path = typeof change.path === 'string' ? change.path : undefined;
    const kind = patchChangeKind(change.kind) ?? 'update';
    const lineDiff = lineDiffFromFileChange(change);
    return [{
      addedLines: lineDiff.addedLines,
      kind,
      path,
      removedLines: lineDiff.removedLines,
    }];
  });

  if (!normalizedChanges.length) {
    return undefined;
  }

  const addedLines = normalizedChanges.reduce((total, change) => total + change.addedLines, 0);
  const removedLines = normalizedChanges.reduce((total, change) => total + change.removedLines, 0);
  const paths = uniqueNonEmpty(normalizedChanges.map((change) => change.path));
  const target = paths.length === 1 ? fileName(paths[0]) : `${normalizedChanges.length} files`;
  return {
    action: fileChangeAction(normalizedChanges.map((change) => change.kind)),
    phase: status,
    params: {
      addedLines,
      path: paths.length === 1 ? paths[0] : undefined,
      removedLines,
      target,
    },
    source: 'codex',
  };
}

function fileChangeAction(kinds: Array<'add' | 'delete' | 'update'>): 'create' | 'delete' | 'edit' {
  if (kinds.length > 0 && kinds.every((kind) => kind === 'add')) {
    return 'create';
  }

  if (kinds.length > 0 && kinds.every((kind) => kind === 'delete')) {
    return 'delete';
  }

  return 'edit';
}

function lineDiffFromFileChange(change: Record<string, unknown>): { addedLines: number; removedLines: number } {
  const diff = typeof change.diff === 'string' ? change.diff : undefined;
  const kind = patchChangeKind(change.kind);
  if (kind === 'add') {
    return { addedLines: rawContentLineCount(diff), removedLines: 0 };
  }
  if (kind === 'delete') {
    return { addedLines: 0, removedLines: rawContentLineCount(diff) };
  }

  return lineDiffFromUnifiedDiff(diff);
}

export function lineDiffFromUnifiedDiff(diff: string | undefined): { addedLines: number; removedLines: number } {
  if (!diff) {
    return { addedLines: 0, removedLines: 0 };
  }

  let addedLines = 0;
  let removedLines = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      addedLines += 1;
    } else if (line.startsWith('-')) {
      removedLines += 1;
    }
  }

  return { addedLines, removedLines };
}

function patchChangeKind(kind: unknown): 'add' | 'delete' | 'update' | undefined {
  if (kind === 'add' || kind === 'delete' || kind === 'update') {
    return kind;
  }

  if (isRecord(kind) && typeof kind.type === 'string') {
    return patchChangeKind(kind.type);
  }

  return undefined;
}

function rawContentLineCount(content: string | undefined): number {
  if (!content) {
    return 0;
  }

  const lines = content.split(/\r\n|\r|\n/);
  while (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.length;
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function mcpErrorMessage(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.message === 'string' ? error.message : undefined;
}

function mcpResultText(result: unknown): string | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const contentText = mcpContentText(result.content);
  const structuredText = 'structuredContent' in result ? toolOutputText(result.structuredContent) : undefined;
  if (!structuredText) {
    return contentText;
  }

  if (!contentText || contentText.trim() === structuredToolResultNotice) {
    return structuredText;
  }

  return `${contentText}\n\n${structuredText}`;
}

function mcpContentText(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  return content
    .map((entry) => {
      if (!isRecord(entry)) {
        return '';
      }

      if (typeof entry.text === 'string') {
        return entry.text;
      }

      return JSON.stringify(entry);
    })
    .filter(Boolean)
    .join('\n\n') || undefined;
}

function dynamicToolContentText(contentItems: unknown): string | undefined {
  if (!Array.isArray(contentItems)) {
    return undefined;
  }

  return contentItems
    .map((entry) => {
      if (isRecord(entry) && typeof entry.text === 'string') {
        return entry.text;
      }

      return JSON.stringify(entry);
    })
    .filter(Boolean)
    .join('\n\n') || undefined;
}

function fileChangesText(changes: unknown[]): string | undefined {
  return changes
    .map((change) => {
      if (!isRecord(change)) {
        return JSON.stringify(change);
      }

      const kind = patchChangeKind(change.kind) ?? 'update';
      const path = typeof change.path === 'string' ? change.path : 'unknown';
      return `${kind} ${path}`;
    })
    .join('\n') || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
