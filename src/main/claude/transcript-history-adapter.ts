import { access, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Agent, BackendSession, RendererMessage, RendererMessagePart, RendererToolPart } from '../../shared/contracts';
import { claudeMessageContentBlocks, parseClaudeSdkMessage, type ClaudeSdkContentBlock, type ClaudeSdkMessage } from './protocol';

export type ClaudeTranscriptHistory = {
  backendSession: BackendSession;
  messages: RendererMessage[];
};

export type ClaudeTranscriptHistoryOptions = {
  projectsRoot?: string;
};

type TranscriptLine = ClaudeSdkMessage & {
  uuid?: string;
  promptId?: string;
  parentUuid?: string | null;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  cwd?: string;
};

export async function loadClaudeTranscriptHistory(
  agent: Agent,
  options: ClaudeTranscriptHistoryOptions = {},
): Promise<ClaudeTranscriptHistory | null> {
  if (agent.backendSession?.kind !== 'claude') {
    return null;
  }

  const sessionId = agent.backendSession.transcriptSessionId ?? agent.backendSession.sessionId;
  if (!isSafeSessionId(sessionId)) {
    return null;
  }

  const projectsRoot = options.projectsRoot ?? path.join(os.homedir(), '.claude', 'projects');
  const transcriptPath = await findClaudeTranscriptPath(projectsRoot, agent.folder, sessionId);
  if (!transcriptPath) {
    return {
      backendSession: agent.backendSession,
      messages: [],
    };
  }

  const content = await readFile(transcriptPath, 'utf8');
  return {
    backendSession: {
      ...agent.backendSession,
      transcriptSessionId: sessionId,
    },
    messages: claudeTranscriptToRendererMessages(content, agent.id, sessionId),
  };
}

export function claudeTranscriptToRendererMessages(content: string, agentId: string, sessionId: string): RendererMessage[] {
  const messages: RendererMessage[] = [];
  let currentTurnId: string | null = null;
  let currentTurnCreatedAt: string | null = null;
  let assistantCreatedAt: string | null = null;
  let assistantSegmentIndex = 0;
  const assistantParts: RendererMessagePart[] = [];

  const flushAssistantMessage = () => {
    if (!currentTurnId || assistantParts.length === 0) {
      return;
    }

    const segmentSuffix = assistantSegmentIndex === 0 ? '' : `-segment-${assistantSegmentIndex}`;
    messages.push({
      id: `assistant-${currentTurnId}${segmentSuffix}`,
      agentId,
      role: 'assistant',
      status: 'complete',
      turnId: currentTurnId,
      createdAt: assistantCreatedAt ?? currentTurnCreatedAt ?? new Date(0).toISOString(),
      parts: [...assistantParts],
    });
    assistantParts.length = 0;
    assistantCreatedAt = null;
    assistantSegmentIndex += 1;
  };

  for (const line of content.split(/\r?\n/)) {
    const entry = parseClaudeSdkMessage(line) as TranscriptLine | null;
    if (!entry || entry.isSidechain) {
      continue;
    }

    if (entry.type === 'user') {
      const toolResults = claudeMessageContentBlocks(entry).filter(isClaudeToolResultBlock);
      if (toolResults.length > 0) {
        for (const toolResult of toolResults) {
          applyToolResult(assistantParts, toolResult);
        }
        continue;
      }

      if (entry.isMeta) {
        continue;
      }

      const text = messageText(entry);
      if (!text) {
        continue;
      }

      flushAssistantMessage();
      currentTurnId = claudeTurnId(entry, sessionId, messages.length);
      currentTurnCreatedAt = timestampToIso(entry.timestamp);
      assistantSegmentIndex = 0;
      messages.push({
        id: `user-${sessionId}-${entry.uuid ?? messages.length}`,
        agentId,
        role: 'user',
        status: 'complete',
        turnId: currentTurnId,
        createdAt: currentTurnCreatedAt,
        parts: [{ type: 'text', text }],
      });
      continue;
    }

    if (entry.type === 'assistant') {
      const parts = assistantMessageParts(entry);
      if (parts.length === 0) {
        continue;
      }

      if (!currentTurnId) {
        currentTurnId = claudeTurnId(entry, sessionId, messages.length);
        currentTurnCreatedAt = timestampToIso(entry.timestamp);
      }
      assistantCreatedAt ??= timestampToIso(entry.timestamp);
      assistantParts.push(...parts);
    }
  }

  flushAssistantMessage();
  return messages;
}

async function findClaudeTranscriptPath(projectsRoot: string, folder: string, sessionId: string): Promise<string | null> {
  const expandedFolder = expandHome(folder);
  const directPath = path.join(projectsRoot, claudeProjectDirectoryName(expandedFolder), `${sessionId}.jsonl`);
  if (await fileExists(directPath)) {
    return directPath;
  }

  const indexedPath = await findIndexedTranscriptPath(projectsRoot, expandedFolder, sessionId);
  return indexedPath && await fileExists(indexedPath) ? indexedPath : null;
}

async function findIndexedTranscriptPath(projectsRoot: string, folder: string, sessionId: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(projectsRoot);
  } catch {
    return null;
  }

  for (const entry of entries) {
    const indexPath = path.join(projectsRoot, entry, 'sessions-index.json');
    let rawIndex: string;
    try {
      rawIndex = await readFile(indexPath, 'utf8');
    } catch {
      continue;
    }

    const parsed = safeJson(rawIndex);
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
      continue;
    }

    for (const sessionEntry of parsed.entries) {
      if (
        !isRecord(sessionEntry) ||
        sessionEntry.sessionId !== sessionId ||
        sessionEntry.projectPath !== folder ||
        typeof sessionEntry.fullPath !== 'string'
      ) {
        continue;
      }

      const resolved = path.resolve(sessionEntry.fullPath);
      if (isPathInside(path.resolve(projectsRoot), resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

function assistantMessageParts(message: ClaudeSdkMessage): RendererMessagePart[] {
  return claudeMessageContentBlocks(message).flatMap((block): RendererMessagePart[] => {
    if (block.type === 'text' && typeof block.text === 'string' && block.text) {
      return [{ type: 'text', text: block.text }];
    }

    if (isClaudeToolUseBlock(block)) {
      return [claudeToolPart(block)];
    }

    return [];
  });
}

function messageText(message: ClaudeSdkMessage): string {
  return claudeMessageContentBlocks(message)
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function applyToolResult(parts: RendererMessagePart[], block: Extract<ClaudeSdkContentBlock, { type: 'tool_result' }>): void {
  const toolPart = parts.find((part): part is RendererToolPart => part.type === 'tool' && part.id === block.tool_use_id);
  if (!toolPart) {
    return;
  }

  toolPart.status = block.is_error ? 'failed' : 'completed';
  toolPart.output = block.content;
  toolPart.body = claudeToolResultText(block.content);
}

function claudeToolPart(block: Extract<ClaudeSdkContentBlock, { type: 'tool_use' }>): RendererToolPart {
  return {
    type: 'tool',
    id: block.id,
    kind: 'generic',
    title: block.name,
    status: 'running',
    input: block.input,
    metadata: {
      provider: 'claude',
      itemType: 'tool_use',
    },
  };
}

function claudeToolResultText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (isRecord(entry) && typeof entry.text === 'string') {
        return entry.text;
      }
      return JSON.stringify(entry);
    }).join('\n');
  }

  if (value === undefined || value === null) {
    return '';
  }

  return JSON.stringify(value);
}

function claudeTurnId(entry: TranscriptLine, sessionId: string, index: number): string {
  return `claude-${entry.promptId ?? entry.uuid ?? `${sessionId}-${index}`}`;
}

function claudeProjectDirectoryName(folder: string): string {
  return folder.replaceAll(path.sep, '-');
}

function expandHome(value: string): string {
  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

function timestampToIso(value: string | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isSafeSessionId(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && !value.includes('..');
}

function isClaudeToolUseBlock(block: ClaudeSdkContentBlock): block is Extract<ClaudeSdkContentBlock, { type: 'tool_use' }> {
  return block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string';
}

function isClaudeToolResultBlock(block: ClaudeSdkContentBlock): block is Extract<ClaudeSdkContentBlock, { type: 'tool_result' }> {
  return block.type === 'tool_result' && typeof block.tool_use_id === 'string';
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
