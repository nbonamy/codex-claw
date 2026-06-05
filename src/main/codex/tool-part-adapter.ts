import type { RendererToolPart, RendererToolPartUpdate } from '../../shared/contracts';
import { toolOutputText } from '../../shared/tool-output';

const structuredToolResultNotice = 'Result returned in structuredContent.';

export function codexThreadItemToToolPart(item: unknown): RendererToolPart | null {
  if (!isRecord(item) || typeof item.id !== 'string' || typeof item.type !== 'string') {
    return null;
  }

  if (item.type === 'commandExecution') {
    const command = typeof item.command === 'string' ? item.command : 'command';
    return {
      type: 'tool',
      id: item.id,
      kind: 'command',
      title: command,
      status: rendererToolStatus(item.status),
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
    return {
      type: 'tool',
      id: item.id,
      kind: 'fileChange',
      title: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
      status: rendererToolStatus(item.status),
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
  return {
    itemId,
    body: fileChangesText(changes),
    input: { changes },
    metadata: { changes },
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'fileChange',
      title: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
      status: 'running',
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

      const kind = typeof change.kind === 'string' ? change.kind : 'update';
      const path = typeof change.path === 'string' ? change.path : 'unknown';
      return `${kind} ${path}`;
    })
    .join('\n') || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
