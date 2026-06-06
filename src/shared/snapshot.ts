import type {
  Agent,
  AgentContextUsage,
  AgentStatus,
  AccountRateLimits,
  AppSnapshot,
  ClientRequest,
  CreateAgentInput,
  MainToRendererEvent,
  RendererMessage,
  RendererMessagePart,
  RendererToolPart,
  RendererToolPartUpdate,
  UpdateAgentInput,
} from './contracts';
import { defaultTeamColor } from './team-colors';
import { toolOutputText } from './tool-output';

const seedCreatedAt = '2026-06-05T00:00:00.000Z';
const seedTeamId = 'team-codex-claw';
type ToolPart = RendererToolPart;

export function createEmptySnapshot(): AppSnapshot {
  return {
    teams: [
      createDefaultTeam(),
    ],
    agents: [],
    bench: [],
    activeTeamId: seedTeamId,
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
    activeTeamId: seedTeamId,
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
      snapshot.activeTeamId = team.id;
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

  if (event.type === 'account.rateLimitsUpdated') {
    const rateLimits = accountRateLimits(event.payload);
    if (rateLimits) {
      snapshot.accountRateLimits = rateLimits;
    }
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

  if (event.type === 'thread.historyLoaded') {
    const payload = event.payload as { messages?: unknown };
    const messages = rendererMessages(payload.messages, event.agentId);
    hydrateAgentMessages(snapshot, event.agentId, messages);
    return;
  }

  if (event.type === 'thread.settingsUpdated' && event.threadId) {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      agent.codexThreadId = event.threadId;
    }
    return;
  }

  if (event.type === 'thread.tokenUsageUpdated') {
    const agent = findAgent(snapshot, event.agentId);
    const contextUsage = agentContextUsage(event.payload);
    if (agent && contextUsage) {
      agent.contextUsage = contextUsage;
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
    const payload = event.payload as { toolPart?: unknown };
    const toolPart = rendererToolPart(payload.toolPart);
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

function updateAssistantToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, payload: unknown): void {
  const update = rendererToolPartUpdate(payload);
  if (!update) {
    return;
  }

  let message = findAssistantMessage(snapshot, agentId, turnId);
  let toolPart = message?.parts.find((part): part is ToolPart => {
    return part.type === 'tool' && part.id === update.itemId;
  });

  if (!toolPart && update.fallbackToolPart) {
    message = message ?? ensureAssistantMessage(snapshot, agentId, turnId);
    message.parts.push(update.fallbackToolPart);
    toolPart = update.fallbackToolPart;
  }

  if (!toolPart) {
    return;
  }

  if (update.title) {
    toolPart.title = update.title;
  }

  if (update.status) {
    toolPart.status = update.status;
  }

  if (update.statusText !== undefined) {
    toolPart.statusText = update.statusText;
  }

  if (update.body !== undefined) {
    toolPart.body = update.body;
  }

  if (update.bodyDelta !== undefined) {
    toolPart.body = `${toolPart.body ?? ''}${update.bodyDelta}`;
  }

  if (update.bodyAppend !== undefined) {
    toolPart.body = [toolPart.body, update.bodyAppend].filter(Boolean).join('\n');
  }

  if ('output' in update) {
    toolPart.output = update.output;
    toolPart.body = update.body ?? toolOutputText(update.output) ?? toolPart.body;
  }

  if ('input' in update) {
    toolPart.input = update.input;
  }

  if (update.metadata) {
    toolPart.metadata = {
      ...(toolPart.metadata ?? {}),
      ...update.metadata,
    };
  }
}

function rendererToolPart(value: unknown): ToolPart | null {
  if (
    !isRecord(value) ||
    value.type !== 'tool' ||
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.title !== 'string' ||
    !isToolStatus(value.status)
  ) {
    return null;
  }

  return value as ToolPart;
}

function agentContextUsage(value: unknown): AgentContextUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const usage = isRecord(value.contextUsage) ? value.contextUsage : value;
  const modelContextWindow = typeof usage.modelContextWindow === 'number' ? usage.modelContextWindow : null;
  const usedPercent = typeof usage.usedPercent === 'number' ? usage.usedPercent : null;
  if (
    typeof usage.totalTokens !== 'number' ||
    typeof usage.inputTokens !== 'number' ||
    typeof usage.cachedInputTokens !== 'number' ||
    typeof usage.outputTokens !== 'number' ||
    typeof usage.reasoningOutputTokens !== 'number' ||
    typeof usage.lastTotalTokens !== 'number'
  ) {
    return null;
  }

  return {
    totalTokens: usage.totalTokens,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    lastTotalTokens: usage.lastTotalTokens,
    modelContextWindow,
    usedPercent,
  };
}

function accountRateLimits(value: unknown): AccountRateLimits | null {
  if (!isRecord(value)) {
    return null;
  }

  const rateLimits = isRecord(value.rateLimits) ? value.rateLimits : value;
  return {
    limitId: nullableString(rateLimits.limitId),
    limitName: nullableString(rateLimits.limitName),
    primary: accountRateLimitWindow(rateLimits.primary),
    secondary: accountRateLimitWindow(rateLimits.secondary),
    credits: rateLimits.credits ?? null,
    individualLimit: rateLimits.individualLimit ?? null,
    planType: nullableString(rateLimits.planType),
    rateLimitReachedType: nullableString(rateLimits.rateLimitReachedType),
  };
}

function accountRateLimitWindow(value: unknown): AccountRateLimits['primary'] {
  if (!isRecord(value) || typeof value.usedPercent !== 'number') {
    return null;
  }

  return {
    usedPercent: value.usedPercent,
    windowDurationMins: typeof value.windowDurationMins === 'number' ? value.windowDurationMins : null,
    resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function rendererMessages(value: unknown, agentId: string): RendererMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((message): message is RendererMessage => {
    if (
      !isRecord(message) ||
      typeof message.id !== 'string' ||
      message.agentId !== agentId ||
      !isRendererMessageRole(message.role) ||
      !isRendererMessageStatus(message.status) ||
      !Array.isArray(message.parts) ||
      typeof message.createdAt !== 'string'
    ) {
      return false;
    }

    return message.parts.every(isRendererMessagePart);
  });
}

function isRendererMessagePart(value: unknown): value is RendererMessagePart {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'text') {
    return typeof value.text === 'string';
  }

  if (value.type === 'status') {
    return typeof value.text === 'string';
  }

  return rendererToolPart(value) !== null;
}

function isRendererMessageRole(value: unknown): value is RendererMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isRendererMessageStatus(value: unknown): value is RendererMessage['status'] {
  return value === 'complete' || value === 'streaming' || value === 'error';
}

function hydrateAgentMessages(snapshot: AppSnapshot, agentId: string, messages: RendererMessage[]): void {
  if (messages.length === 0) {
    return;
  }

  const hydratedIds = new Set(messages.map((message) => message.id));
  snapshot.messages = snapshot.messages.filter((message) => {
    return message.agentId !== agentId || !hydratedIds.has(message.id);
  });

  const firstAgentMessageIndex = snapshot.messages.findIndex((message) => message.agentId === agentId);
  if (firstAgentMessageIndex === -1) {
    snapshot.messages.push(...messages);
    return;
  }

  snapshot.messages.splice(firstAgentMessageIndex, 0, ...messages);
}

function rendererToolPartUpdate(value: unknown): RendererToolPartUpdate | null {
  if (!isRecord(value) || typeof value.itemId !== 'string') {
    return null;
  }

  if ('status' in value && value.status !== undefined && !isToolStatus(value.status)) {
    return null;
  }

  const fallbackToolPart = rendererToolPart(value.fallbackToolPart);
  if ('fallbackToolPart' in value && value.fallbackToolPart !== undefined && !fallbackToolPart) {
    return null;
  }

  const update: RendererToolPartUpdate = {
    itemId: value.itemId,
    title: typeof value.title === 'string' ? value.title : undefined,
    status: isToolStatus(value.status) ? value.status : undefined,
    statusText: typeof value.statusText === 'string' ? value.statusText : undefined,
    body: typeof value.body === 'string' ? value.body : undefined,
    bodyDelta: typeof value.bodyDelta === 'string' ? value.bodyDelta : undefined,
    bodyAppend: typeof value.bodyAppend === 'string' ? value.bodyAppend : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    fallbackToolPart: fallbackToolPart ?? undefined,
  };

  if ('input' in value) {
    update.input = value.input;
  }

  if ('output' in value) {
    update.output = value.output;
  }

  return update;
}

function isToolStatus(value: unknown): value is ToolPart['status'] {
  return value === 'running' || value === 'completed' || value === 'failed';
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
  if (snapshot.activeTeamId && snapshot.teams.some((team) => team.id === snapshot.activeTeamId)) {
    return snapshot.activeTeamId;
  }

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
  delete agent.contextUsage;
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
    color: defaultTeamColor,
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
