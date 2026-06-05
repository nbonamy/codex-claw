import type {
  Agent,
  AgentStatus,
  AppSnapshot,
  ClientRequest,
  CreateAgentInput,
  MainToRendererEvent,
  RendererMessage,
  RendererMessagePart,
  UpdateAgentInput,
} from './contracts';

const seedCreatedAt = '2026-06-05T00:00:00.000Z';
const seedTeamId = 'team-codex-claw';
const structuredToolResultNotice = 'Result returned in structuredContent.';
type ToolPart = Extract<RendererMessagePart, { type: 'tool' }>;

export function createEmptySnapshot(): AppSnapshot {
  return {
    teams: [
      createDefaultTeam(),
    ],
    agents: [],
    bench: [],
    activeAgentId: null,
    messages: [],
    appServer: {
      status: 'notConfigured',
      detail: 'Codex app-server is not connected yet.',
    },
    theme: {
      id: 'codex-claw-dark',
    },
  };
}

export function createInitialSnapshot(): AppSnapshot {
  const agents = createSeedAgents();

  return {
    teams: [
      {
        ...createDefaultTeam(),
        agentIds: agents.map((agent) => agent.id),
      },
    ],
    agents,
    bench: [],
    activeAgentId: agents[0]?.id ?? null,
    messages: [],
    appServer: {
      status: 'notConfigured',
      detail: 'Codex app-server is not connected yet.',
    },
    theme: {
      id: 'codex-claw-dark',
    },
  };
}

export function createAgentFromInput(input: CreateAgentInput, createdAt = new Date().toISOString(), teamId = seedTeamId): Agent {
  const name = normalizedAgentName(input.name, input.folder);

  return {
    id: `agent-${slug(name)}-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    teamId,
    name,
    avatar: normalizedOptionalString(input.avatar),
    folder: normalizedFolder(input.folder),
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };
}

export function createAgentInSnapshot(snapshot: AppSnapshot, input: CreateAgentInput, createdAt = new Date().toISOString()): AppSnapshot {
  const agent = createAgentFromInput(input, createdAt, activeTeamId(snapshot));
  snapshot.agents.push(agent);
  attachAgentToTeam(snapshot, agent);
  snapshot.activeAgentId = agent.id;
  return snapshot;
}

export function updateAgentFromInput(snapshot: AppSnapshot, input: UpdateAgentInput, updatedAt = new Date().toISOString()): Agent | null {
  const agent = findAgent(snapshot, input.id);
  if (!agent) {
    return null;
  }

  if (agent.status.type !== 'idle') {
    throw new Error('Agent must be idle before editing.');
  }

  const nextFolder = normalizedFolder(input.folder);
  const folderChanged = nextFolder !== agent.folder;
  agent.name = normalizedAgentName(input.name, nextFolder);
  agent.avatar = normalizedOptionalString(input.avatar);
  agent.folder = nextFolder;
  if (folderChanged) {
    clearAgentRuntimeState(agent);
  }
  agent.updatedAt = updatedAt;

  return agent;
}

export function appendUserPrompt(snapshot: AppSnapshot, agentId: string, prompt: string, createdAt = new Date().toISOString()): RendererMessage {
  const message: RendererMessage = {
    id: `message-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    role: 'user',
    status: 'complete',
    createdAt,
    parts: [{ type: 'text', text: prompt }],
  };

  snapshot.messages.push(message);

  return message;
}

export function appendSystemMessage(snapshot: AppSnapshot, agentId: string, text: string, createdAt = new Date().toISOString()): RendererMessage {
  const message: RendererMessage = {
    id: `system-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    role: 'system',
    status: 'error',
    createdAt,
    parts: [{ type: 'status', text }],
  };

  snapshot.messages.push(message);

  return message;
}

export function updateAgentFolder(snapshot: AppSnapshot, agentId: string, folder: string, updatedAt = new Date().toISOString()): Agent | null {
  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return null;
  }

  agent.folder = normalizedFolder(folder);
  clearAgentRuntimeState(agent);
  agent.updatedAt = updatedAt;

  return agent;
}

export function selectAgent(snapshot: AppSnapshot, agentId: string): AppSnapshot {
  const agent = findAgent(snapshot, agentId);
  if (agent) {
    snapshot.activeAgentId = agentId;
    const team = snapshot.teams.find((candidate) => candidate.id === agent.teamId);
    if (team) {
      team.activeAgentId = agentId;
    }
  }

  return snapshot;
}

export function applyMainEventToSnapshot(snapshot: AppSnapshot, event: MainToRendererEvent): void {
  if (event.type === 'appServer.statusChanged') {
    const payload = event.payload as AppSnapshot['appServer'];
    snapshot.appServer = payload;
    return;
  }

  if (!event.agentId) {
    return;
  }

  if (event.type === 'agent.updated') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent && isRecord(event.payload)) {
      Object.assign(agent, event.payload);
    }
    return;
  }

  if (event.type === 'agent.statusChanged') {
    setAgentStatus(snapshot, event.agentId, event.payload as AgentStatus);
    return;
  }

  if (event.type === 'thread.started' && event.threadId) {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      agent.codexThreadId = event.threadId;
      agent.status = { type: 'idle' };
    }
    return;
  }

  if (event.type === 'turn.started') {
    setAgentStatus(snapshot, event.agentId, { type: 'working' });
    return;
  }

  if (event.type === 'message.delta' && event.turnId) {
    const payload = event.payload as { delta?: unknown; itemId?: unknown };
    appendAssistantDelta(
      snapshot,
      event.agentId,
      event.turnId,
      typeof payload.delta === 'string' ? payload.delta : '',
      typeof payload.itemId === 'string' ? payload.itemId : undefined,
    );
    return;
  }

  if ((event.type === 'item.started' || event.type === 'item.completed') && event.turnId) {
    const payload = event.payload as { item?: unknown };
    const toolPart = rendererToolPartFromCodexItem(payload.item);
    if (toolPart) {
      upsertAssistantToolPart(snapshot, event.agentId, event.turnId, toolPart);
    }
    return;
  }

  if (event.type === 'item.updated' && event.turnId) {
    updateAssistantToolPart(snapshot, event.agentId, event.turnId, event.payload);
    return;
  }

  if (event.type === 'approval.requested' && event.turnId) {
    applyApprovalRequest(snapshot, event.agentId, event.turnId, event.payload);
    const confirmation = confirmToolRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: confirmation?.payload.confirmation.summary,
    });
    return;
  }

  if (event.type === 'turn.completed' && event.turnId) {
    completeAssistantMessage(snapshot, event.agentId, event.turnId);
    setAgentStatus(snapshot, event.agentId, { type: 'idle' });
    return;
  }

  if (event.type === 'error') {
    const payload = event.payload as { message?: unknown };
    const message = typeof payload.message === 'string' ? payload.message : 'Codex app-server error';
    appendSystemMessage(snapshot, event.agentId, message);
    setAgentStatus(snapshot, event.agentId, { type: 'error', message });
  }
}

function rendererToolPartFromCodexItem(item: unknown): ToolPart | null {
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

function rendererToolStatus(status: unknown): ToolPart['status'] {
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

function updateAssistantToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, payload: unknown): void {
  if (!isRecord(payload) || typeof payload.itemId !== 'string') {
    return;
  }

  let message = findAssistantMessage(snapshot, agentId, turnId);
  let toolPart = message?.parts.find((part): part is ToolPart => {
    return part.type === 'tool' && part.id === payload.itemId;
  });
  if (!toolPart) {
    const placeholder = fallbackToolPartFromUpdate(payload);
    if (!placeholder) {
      return;
    }

    message = message ?? ensureAssistantMessage(snapshot, agentId, turnId);
    message.parts.push(placeholder);
    toolPart = placeholder;
  }

  if (typeof payload.status === 'string') {
    toolPart.status = rendererToolStatus(payload.status);
  }

  if (typeof payload.delta === 'string') {
    toolPart.body = `${toolPart.body ?? ''}${payload.delta}`;
  }

  if (typeof payload.message === 'string') {
    toolPart.body = [toolPart.body, payload.message].filter(Boolean).join('\n');
  }

  if (Array.isArray(payload.changes)) {
    toolPart.body = fileChangesText(payload.changes);
    toolPart.input = { changes: payload.changes };
    toolPart.metadata = {
      ...(toolPart.metadata ?? {}),
      changes: payload.changes,
    };
  }

  if ('output' in payload) {
    toolPart.output = payload.output;
    toolPart.body = toolOutputText(payload.output) ?? toolPart.body;
  }

  if ('input' in payload) {
    toolPart.input = payload.input;
  }
}

function fallbackToolPartFromUpdate(payload: Record<string, unknown>): ToolPart | null {
  if (payload.kind === 'commandExecution.outputDelta') {
    return {
      type: 'tool',
      id: payload.itemId as string,
      kind: 'command',
      title: 'Command',
      status: 'running',
    };
  }

  if (payload.kind === 'fileChange.patchUpdated') {
    const changes = Array.isArray(payload.changes) ? payload.changes : [];
    return {
      type: 'tool',
      id: payload.itemId as string,
      kind: 'fileChange',
      title: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
      status: 'running',
      body: fileChangesText(changes),
      input: { changes },
      metadata: { changes },
    };
  }

  if (payload.kind === 'mcpToolCall.progress') {
    return {
      type: 'tool',
      id: payload.itemId as string,
      kind: 'mcp',
      title: 'MCP tool',
      status: 'running',
    };
  }

  if (payload.kind === 'rawResponseItem.output') {
    return {
      type: 'tool',
      id: payload.itemId as string,
      kind: 'generic',
      title: typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Tool output',
      status: rendererToolStatus(payload.status ?? 'completed'),
      body: toolOutputText(payload.output),
      output: payload.output,
    };
  }

  return null;
}

function toolOutputText(output: unknown): string | undefined {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    return output
      .map((entry) => toolOutputText(entry))
      .filter(Boolean)
      .join('\n\n') || undefined;
  }

  if (!isRecord(output)) {
    return output === undefined ? undefined : JSON.stringify(output);
  }

  const structuredText = 'structuredContent' in output ? toolOutputText(output.structuredContent) : undefined;
  if (structuredText) {
    const contentText = toolOutputContentText(output);
    if (!contentText || contentText.trim() === structuredToolResultNotice) {
      return structuredText;
    }

    return `${contentText}\n\n${structuredText}`;
  }

  return toolOutputContentText(output) ?? JSON.stringify(output);
}

function toolOutputContentText(output: Record<string, unknown>): string | undefined {
  if (typeof output.text === 'string') {
    return output.text;
  }

  if (typeof output.content === 'string') {
    return output.content;
  }

  if (Array.isArray(output.content)) {
    return toolOutputText(output.content);
  }

  return undefined;
}

function upsertAssistantToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, toolPart: ToolPart): void {
  const message = ensureAssistantMessage(snapshot, agentId, turnId);
  const existingIndex = message.parts.findIndex((part) => part.type === 'tool' && part.id === toolPart.id);

  if (existingIndex >= 0) {
    const existing = message.parts[existingIndex] as ToolPart;
    message.parts[existingIndex] = {
      ...existing,
      ...toolPart,
      body: toolPart.body ?? existing.body,
      input: toolPart.input ?? existing.input,
      output: toolPart.output ?? existing.output,
      statusText: toolPart.statusText ?? (toolPart.status === 'running' ? existing.statusText : undefined),
      metadata: {
        ...(existing.metadata ?? {}),
        ...(toolPart.metadata ?? {}),
      },
    };
    return;
  }

  message.parts.push(toolPart);
}

function applyApprovalRequest(snapshot: AppSnapshot, agentId: string, turnId: string, payload: unknown): void {
  const request = confirmToolRequest(payload);
  if (!request) {
    return;
  }

  const confirmation = request.payload.confirmation;
  const toolPart = findPendingMcpToolPart(snapshot, agentId, turnId, confirmation.integrationId, confirmation.toolName);
  const statusText = JSON.stringify({
    source: 'mcp',
    action: 'run',
    phase: 'running',
    params: {
      requestId: request.id,
      tool: `${confirmation.integrationId}.${confirmation.toolName}`,
      confirmationSummary: confirmation.summary,
      argumentsPreview: confirmation.argumentsPreview,
      allowConversation: confirmation.allowConversation === true,
      allowAlways: confirmation.allowAlways === true,
    },
  });
  const input = parseJsonPreview(confirmation.argumentsPreview) ?? (confirmation.argumentsPreview || undefined);

  if (toolPart) {
    toolPart.title = `${confirmation.integrationId}.${confirmation.toolName}`;
    toolPart.status = 'running';
    toolPart.statusText = statusText;
    toolPart.input = toolPart.input ?? input;
    toolPart.metadata = {
      ...(toolPart.metadata ?? {}),
      confirmationRequestId: request.id,
      server: confirmation.integrationId,
      tool: confirmation.toolName,
    };
    return;
  }

  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: `approval-${request.id}`,
    kind: 'mcp',
    title: `${confirmation.integrationId}.${confirmation.toolName}`,
    status: 'running',
    statusText,
    input,
    metadata: {
      confirmationRequestId: request.id,
      server: confirmation.integrationId,
      tool: confirmation.toolName,
    },
  });
}

function findPendingMcpToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, server: string, tool: string): ToolPart | undefined {
  const message = findAssistantMessage(snapshot, agentId, turnId);
  if (!message) {
    return undefined;
  }

  const runningMcpTools = message.parts.filter((part): part is ToolPart => {
    if (part.type !== 'tool' || part.kind !== 'mcp' || part.status !== 'running') {
      return false;
    }

    return true;
  });
  const exactMatch = runningMcpTools.find((part) => {
    const metadataServer = isRecord(part.metadata) ? stringValue(part.metadata.server) : undefined;
    const metadataTool = isRecord(part.metadata) ? stringValue(part.metadata.tool) : undefined;
    return (
      (metadataServer === server && metadataTool === tool) ||
      part.title === `${server}.${tool}` ||
      part.title.endsWith(`.${tool}`)
    );
  });

  return exactMatch ?? (runningMcpTools.length === 1 ? runningMcpTools[0] : undefined);
}

function confirmToolRequest(payload: unknown): ClientRequest | null {
  if (
    !isRecord(payload) ||
    payload.kind !== 'confirm_tool' ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.confirmation)
  ) {
    return null;
  }

  const confirmation = payload.payload.confirmation;
  if (
    typeof confirmation.argumentsPreview !== 'string' ||
    typeof confirmation.integrationId !== 'string' ||
    typeof confirmation.integrationName !== 'string' ||
    typeof confirmation.summary !== 'string' ||
    typeof confirmation.toolName !== 'string'
  ) {
    return null;
  }

  return payload as ClientRequest;
}

function parseJsonPreview(preview: string): unknown {
  if (!preview.trim().startsWith('{') && !preview.trim().startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(preview);
  } catch {
    return undefined;
  }
}

function appendAssistantDelta(snapshot: AppSnapshot, agentId: string, turnId: string, delta: string, itemId?: string): void {
  const message = ensureAssistantMessage(snapshot, agentId, turnId);

  const textPart = message.parts.at(-1);
  if (textPart?.type === 'text' && textPart.itemId === itemId) {
    textPart.text += delta;
  } else {
    message.parts.push(itemId ? { type: 'text', text: delta, itemId } : { type: 'text', text: delta });
  }
}

function ensureAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage {
  const message = findAssistantMessage(snapshot, agentId, turnId);

  if (message) {
    return message;
  }

  const nextMessage: RendererMessage = {
    id: assistantMessageId(turnId),
    agentId,
    role: 'assistant',
    status: 'streaming',
    createdAt: new Date().toISOString(),
    parts: [],
  };
  snapshot.messages.push(nextMessage);
  return nextMessage;
}

function completeAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): void {
  const message = findAssistantMessage(snapshot, agentId, turnId);
  if (message) {
    message.status = 'complete';
  }
}

function findAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  return snapshot.messages.find((message) => message.id === assistantMessageId(turnId) && message.agentId === agentId);
}

function assistantMessageId(turnId: string): string {
  return `assistant-${turnId}`;
}

function setAgentStatus(snapshot: AppSnapshot, agentId: string, status: AgentStatus): void {
  const agent = findAgent(snapshot, agentId);
  if (agent) {
    agent.status = status;
    agent.updatedAt = new Date().toISOString();
  }
}

function findAgent(snapshot: AppSnapshot, agentId: string): Agent | undefined {
  return snapshot.agents.find((agent) => agent.id === agentId);
}

function activeTeamId(snapshot: AppSnapshot): string {
  const activeAgent = snapshot.activeAgentId ? findAgent(snapshot, snapshot.activeAgentId) : undefined;
  if (activeAgent?.teamId) {
    return activeAgent.teamId;
  }

  const activeTeam = snapshot.teams.find((team) => activeAgent && team.agentIds.includes(activeAgent.id));
  return activeTeam?.id ?? snapshot.teams[0]?.id ?? seedTeamId;
}

function attachAgentToTeam(snapshot: AppSnapshot, agent: Agent): void {
  let team = snapshot.teams.find((candidate) => candidate.id === agent.teamId);
  if (!team) {
    team = snapshot.teams[0];
  }

  if (!team) {
    return;
  }

  agent.teamId = team.id;
  if (!team.agentIds.includes(agent.id)) {
    team.agentIds.push(agent.id);
  }
  team.activeAgentId = agent.id;
}

function clearAgentRuntimeState(agent: Agent): void {
  delete agent.codexThreadId;
  delete agent.isRegistered;
  delete agent.mcpSessionId;
  delete agent.statusText;
}

function normalizedAgentName(name: string, folder: string): string {
  return name.trim() || folderBasename(folder) || 'Codex';
}

function normalizedFolder(folder: string): string {
  return folder.trim();
}

function normalizedOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function folderBasename(folder: string): string {
  return normalizedFolder(folder).split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function createDefaultTeam(): AppSnapshot['teams'][number] {
  return {
    id: seedTeamId,
    name: 'Codex Claw',
    avatar: 'CC',
    agentIds: [],
  };
}

function createSeedAgents(): Agent[] {
  return [
    {
      id: 'agent-dina',
      teamId: seedTeamId,
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      status: { type: 'idle' },
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    },
    {
      id: 'agent-jesse',
      teamId: seedTeamId,
      name: 'Jesse',
      avatar: 'JE',
      folder: '~/src/codex-claw',
      status: { type: 'idle' },
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    },
  ];
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || 'codex';
}
