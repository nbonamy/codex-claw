import type {
  Agent,
  AgentBackend,
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
  ThreadGoal,
  ThreadPlan,
  ThreadPlanStep,
  UpdateAgentInput,
  WorkBacklogAssignment,
} from './contracts';
import { defaultGeneralSettings, defaultSourceFolderState, defaultThemeSettings } from './settings';
import { createEntityId } from './ids';
import { defaultTeamColor } from './team-colors';
import { toolOutputText } from './tool-output';
import { codexApprovalPresetFromThreadSettings, codexBackendDefaultsWithApprovalPreset } from './codex-approval-presets';
import { workItemAssignmentKey } from './work-assignments';

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
    loops: [],
    activeTeamId: seedTeamId,
    activeAgentId: null,
    messages: [],
    backendRuntimes: [{
      backend: 'codex',
      status: 'notConfigured',
      detail: 'Codex backend is not connected yet.',
    }, {
      backend: 'claude',
      status: 'notConfigured',
      detail: 'Claude backend has not been started yet.',
    }],
    workBacklog: createDefaultWorkBacklogState(),
    general: { ...defaultGeneralSettings },
    sourceFolder: { ...defaultSourceFolderState },
    theme: { ...defaultThemeSettings },
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
    loops: [],
    activeTeamId: seedTeamId,
    activeAgentId: agents[0]?.id ?? null,
    messages: [],
    backendRuntimes: [{
      backend: 'codex',
      status: 'notConfigured',
      detail: 'Codex backend is not connected yet.',
    }, {
      backend: 'claude',
      status: 'notConfigured',
      detail: 'Claude backend has not been started yet.',
    }],
    workBacklog: createDefaultWorkBacklogState(),
    general: { ...defaultGeneralSettings },
    sourceFolder: { ...defaultSourceFolderState },
    theme: { ...defaultThemeSettings },
  };
}

function createDefaultWorkBacklogState(): AppSnapshot['workBacklog'] {
  return {
    connections: [{
      provider: 'github',
      status: 'disconnected',
    }],
    providerConfigurations: {},
    providerSettings: {},
    assignments: {},
  };
}

export function createAgentFromInput(input: CreateAgentInput, createdAt = new Date().toISOString(), teamId = seedTeamId, id = createEntityId('agent')): Agent {
  const name = normalizedAgentName(input.name, input.folder);
  const backend = normalizedBackend(input.backend);

  return {
    id,
    teamId,
    name,
    avatar: normalizedOptionalString(input.avatar),
    folder: normalizedFolder(input.folder),
    backend,
    backendDefaults: defaultBackendDefaults(backend),
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };
}

export function createAgentInSnapshot(snapshot: AppSnapshot, input: CreateAgentInput, createdAt = new Date().toISOString(), id = createEntityId('agent')): AppSnapshot {
  const agent = createAgentFromInput(input, createdAt, targetTeamId(snapshot, input.teamId), id);
  snapshot.agents.push(agent);
  attachAgentToTeam(snapshot, agent);
  snapshot.activeTeamId = agent.teamId ?? snapshot.activeTeamId;
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
  const nextBackend = normalizedBackend(input.backend ?? agent.backend);
  const backendChanged = nextBackend !== agent.backend;
  agent.name = normalizedAgentName(input.name, nextFolder);
  agent.avatar = normalizedOptionalString(input.avatar);
  agent.folder = nextFolder;
  agent.backend = nextBackend;
  if (backendChanged) {
    agent.backendDefaults = defaultBackendDefaults(nextBackend);
  }
  if (folderChanged || backendChanged) {
    clearAgentRuntimeState(agent);
  }
  agent.updatedAt = updatedAt;

  return agent;
}

export function appendUserPrompt(snapshot: AppSnapshot, agentId: string, prompt: string, createdAt = new Date().toISOString()): RendererMessage {
  const message = createUserMessage(agentId, prompt, createdAt);
  snapshot.messages.push(message);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

export function appendSteerPrompt(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  prompt: string,
  createdAt = new Date().toISOString(),
): RendererMessage {
  const activeAssistantMessage = findAssistantMessage(snapshot, agentId, turnId);
  if (activeAssistantMessage?.parts.length === 0 && activeAssistantMessage.id.startsWith(`${assistantMessageId(turnId)}-segment-`)) {
    snapshot.messages = snapshot.messages.filter((message) => message.id !== activeAssistantMessage.id);
  } else if (activeAssistantMessage) {
    activeAssistantMessage.status = 'complete';
  }

  const message = createUserMessage(agentId, prompt, createdAt, `steer-${turnId}`, turnId);
  snapshot.messages.push(message);
  ensureAssistantMessage(snapshot, agentId, turnId, assistantSegmentMessageId(turnId, createdAt), createdAt);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

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
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

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
  if (event.type === 'snapshot.updated') {
    const nextSnapshot = event.payload as AppSnapshot;
    if (isRecord(nextSnapshot) && Array.isArray(nextSnapshot.teams) && Array.isArray(nextSnapshot.agents)) {
      Object.assign(snapshot, nextSnapshot);
    }
    return;
  }

  if (event.type === 'backend.statusChanged') {
    const payload = event.payload as unknown;
    if (isRecord(payload) && isBackend(payload.backend) && isBackendRuntimeStatus(payload.status)) {
      setBackendRuntimeStatus(snapshot, {
        backend: payload.backend,
        status: payload.status,
        detail: typeof payload.detail === 'string' ? payload.detail : undefined,
      });
    }
    return;
  }

  if (event.type === 'account.rateLimitsUpdated') {
    const rateLimits = accountRateLimits(event.payload);
    if (rateLimits) {
      snapshot.accountRateLimits = rateLimits;
    }
    return;
  }

  if (event.type === 'workBacklog.assignmentUpdated') {
    const assignment = workBacklogAssignment(event.payload);
    if (assignment) {
      snapshot.workBacklog.assignments = {
        ...snapshot.workBacklog.assignments,
        [workItemAssignmentKey(assignment)]: assignment,
      };
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

  if (event.type === 'thread.started') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent && event.backend === 'claude' && typeof event.backendSessionId === 'string') {
      agent.backend = 'claude';
      agent.backendSession = { kind: 'claude', sessionId: event.backendSessionId, transport: 'stdio' };
      return;
    }

    if (agent && event.threadId) {
      agent.backend = 'codex';
      agent.backendSession = { kind: 'codex', threadId: event.threadId };
      agent.status = { type: 'idle' };
    }
    return;
  }

  if (event.type === 'thread.historyLoaded') {
    const payload = event.payload as { messages?: unknown };
    const messages = rendererMessages(payload.messages, event.agentId);
    const replace = isRecord(event.payload) && event.payload.replace === true;
    hydrateAgentMessages(snapshot, event.agentId, messages, { replace });
    return;
  }

  if (event.type === 'thread.settingsUpdated' && event.threadId) {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      agent.backend = 'codex';
      agent.backendSession = { kind: 'codex', threadId: event.threadId };
      const payload = isRecord(event.payload) ? event.payload : {};
      const approvalPreset = codexApprovalPresetFromThreadSettings(payload.threadSettings);
      if (approvalPreset) {
        agent.backendDefaults = codexBackendDefaultsWithApprovalPreset(agent.backendDefaults, approvalPreset);
      }
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
    if (event.turnId) {
      ensureAssistantMessage(snapshot, event.agentId, event.turnId);
      pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    }
    setAgentStatus(snapshot, event.agentId, { type: 'working' });
    return;
  }

  if (event.type === 'turn.planUpdated' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const plan = threadPlan(event.payload, event.threadId, event.turnId, event.occurredAt);
    if (agent && plan) {
      const operation = planProgressOperation(agent, event.turnId);
      agent.plan = plan;
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, plan.markdown, 'completed', operation);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanDelta' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    appendAgentPlanMarkdownDelta(snapshot, event.agentId, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'running', operation);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanCompleted' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    updateAgentPlanMarkdown(snapshot, event.agentId, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'completed', operation);
    }
    return;
  }

  if (event.type === 'thread.goalUpdated') {
    const agent = findAgent(snapshot, event.agentId);
    const goal = threadGoal(event.payload);
    if (agent && goal) {
      agent.goal = goal;
    }
    return;
  }

  if (event.type === 'thread.goalCleared') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      delete agent.goal;
    }
    return;
  }

  if (event.type === 'thread.modeUpdated') {
    return;
  }

  if (event.type === 'message.delta' && event.turnId) {
    const payload = event.payload as { delta?: unknown; itemId?: unknown };
    appendAssistantDeltaWithPlanFilter(
      snapshot,
      event.agentId,
      typeof event.threadId === 'string' ? event.threadId : undefined,
      event.turnId,
      typeof payload.delta === 'string' ? payload.delta : '',
      typeof payload.itemId === 'string' ? payload.itemId : undefined,
      event.occurredAt,
    );
    return;
  }

  if (event.type === 'message.steer' && event.turnId) {
    const payload = event.payload as { prompt?: unknown };
    if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
      appendSteerPrompt(snapshot, event.agentId, event.turnId, payload.prompt, event.occurredAt);
    }
    return;
  }

  if (event.type === 'context.compactionStarted' && event.turnId) {
    appendCompactionMarker(snapshot, event.agentId, event.turnId, event.occurredAt);
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

  if (event.type === 'diff.updated' && event.turnId) {
    updateAssistantTurnDiff(snapshot, event.agentId, event.turnId, event.payload);
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

  if (event.type === 'toolInput.requested' && event.turnId) {
    applyToolInputRequest(snapshot, event.agentId, event.turnId, event.payload);
    const request = askUserRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: request?.payload.request.questions[0]?.question ?? 'Waiting for user input',
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
    const message = typeof payload.message === 'string' ? payload.message : 'Backend error';
    appendSystemMessage(snapshot, event.agentId, message);
    setAgentStatus(snapshot, event.agentId, { type: 'error', message });
  }
}

export function formatThreadPlanMarkdown(input: Pick<ThreadPlan, 'explanation' | 'steps'>): string {
  const explanation = input.explanation.trim();
  const steps = input.steps.map((entry) => {
    const marker = entry.status === 'completed' ? '- [x]' : '- [ ]';
    return `${marker} ${entry.step}`;
  });

  return [explanation, ...steps].filter(Boolean).join('\n');
}

function threadPlan(payload: unknown, threadId: string, turnId: string, updatedAt: string): ThreadPlan | null {
  if (!isRecord(payload)) {
    return null;
  }

  const explanation = typeof payload.explanation === 'string' && payload.explanation.trim()
    ? payload.explanation.trim()
    : '';
  const plan = Array.isArray(payload.plan) ? payload.plan : [];
  const steps = plan.map((entry): ThreadPlanStep | null => {
    if (!isRecord(entry) || typeof entry.step !== 'string') {
      return null;
    }

    const step = entry.step.trim();
    if (!step) {
      return null;
    }

    return {
      step,
      status: isThreadPlanStepStatus(entry.status) ? entry.status : 'pending',
    };
  }).filter((step): step is ThreadPlanStep => Boolean(step));

  const markdown = formatThreadPlanMarkdown({ explanation, steps });
  if (!markdown) {
    return null;
  }

  return {
    threadId,
    turnId,
    explanation,
    steps,
    markdown,
    updatedAt,
  };
}

function isThreadPlanStepStatus(value: unknown): value is ThreadPlanStep['status'] {
  return value === 'pending' || value === 'inProgress' || value === 'completed';
}

function appendAgentPlanMarkdownDelta(
  snapshot: AppSnapshot,
  agentId: string,
  threadId: string,
  turnId: string,
  payload: unknown,
  updatedAt: string,
): void {
  if (!isRecord(payload) || typeof payload.delta !== 'string' || !payload.delta) {
    return;
  }

  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return;
  }

  const existingMarkdown = agent.plan?.turnId === turnId ? agent.plan.markdown : '';
  setAgentPlanMarkdown(agent, threadId, turnId, `${existingMarkdown}${payload.delta}`, updatedAt, { trim: false });
}

function updateAgentPlanMarkdown(
  snapshot: AppSnapshot,
  agentId: string,
  threadId: string,
  turnId: string,
  payload: unknown,
  updatedAt: string,
): void {
  if (!isRecord(payload) || typeof payload.markdown !== 'string') {
    return;
  }

  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return;
  }

  setAgentPlanMarkdown(agent, threadId, turnId, payload.markdown, updatedAt);
}

function setAgentPlanMarkdown(agent: Agent, threadId: string, turnId: string, markdown: string, updatedAt: string, options: { trim?: boolean } = {}): void {
  const content = markdown.trim();
  if (!content) {
    return;
  }
  const nextMarkdown = options.trim === false ? markdown : content;

  if (agent.plan?.turnId === turnId && agent.plan.markdown === nextMarkdown) {
    return;
  }

  agent.plan = {
    threadId,
    turnId,
    explanation: '',
    steps: [],
    markdown: nextMarkdown,
    updatedAt,
  };
}

function appendAssistantDeltaWithPlanFilter(
  snapshot: AppSnapshot,
  agentId: string,
  threadId: string | undefined,
  turnId: string,
  delta: string,
  itemId: string | undefined,
  updatedAt: string,
): void {
  if (!delta) {
    return;
  }

  if (!threadId) {
    appendAssistantDelta(snapshot, agentId, turnId, delta, itemId);
    return;
  }

  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    appendAssistantDelta(snapshot, agentId, turnId, delta, itemId);
    return;
  }

  let remaining = delta;
  let capturing = isCapturingProposedPlan(snapshot, agentId, turnId);
  const operation = planProgressOperation(agent, turnId);

  while (remaining) {
    if (capturing) {
      const closeIndex = lowerIndexOf(remaining, '</proposed_plan>');
      const planDelta = closeIndex >= 0 ? remaining.slice(0, closeIndex) : remaining;
      if (planDelta) {
        appendAgentPlanMarkdownText(agent, threadId, turnId, planDelta, updatedAt);
      }
      if (closeIndex >= 0 && agent.plan?.turnId === turnId) {
        setAgentPlanMarkdown(agent, threadId, turnId, agent.plan.markdown, updatedAt);
      }
      if (agent.plan?.turnId === turnId) {
        upsertPlanProgressToolPart(snapshot, agentId, turnId, agent.plan.markdown, closeIndex >= 0 ? 'completed' : 'running', operation, closeIndex < 0);
      }

      if (closeIndex < 0) {
        return;
      }

      remaining = remaining.slice(closeIndex + '</proposed_plan>'.length);
      capturing = false;
      continue;
    }

    const openIndex = lowerIndexOf(remaining, '<proposed_plan>');
    if (openIndex < 0) {
      appendAssistantDelta(snapshot, agentId, turnId, remaining, itemId);
      return;
    }

    const visibleDelta = remaining.slice(0, openIndex);
    if (visibleDelta) {
      appendAssistantDelta(snapshot, agentId, turnId, visibleDelta, itemId);
    }

    remaining = remaining.slice(openIndex + '<proposed_plan>'.length);
    capturing = true;
    upsertPlanProgressToolPart(snapshot, agentId, turnId, agent.plan?.turnId === turnId ? agent.plan.markdown : '', 'running', operation, true);
  }
}

function appendAgentPlanMarkdownText(agent: Agent, threadId: string, turnId: string, delta: string, updatedAt: string): void {
  const existingMarkdown = agent.plan?.turnId === turnId ? agent.plan.markdown : '';
  setAgentPlanMarkdown(agent, threadId, turnId, `${existingMarkdown}${delta}`, updatedAt, { trim: false });
}

function lowerIndexOf(value: string, search: string): number {
  return value.toLowerCase().indexOf(search.toLowerCase());
}

function planProgressOperation(agent: Agent, turnId: string): 'update' | 'write' {
  return agent.plan && agent.plan.turnId !== turnId ? 'update' : 'write';
}

function isCapturingProposedPlan(snapshot: AppSnapshot, agentId: string, turnId: string): boolean {
  return Boolean(planProgressToolPart(snapshot, agentId, turnId)?.metadata?.capturingProposedPlan);
}

function planProgressToolPart(snapshot: AppSnapshot, agentId: string, turnId: string): ToolPart | undefined {
  const message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, planProgressToolPartId(turnId));
  return message?.parts.find((part): part is ToolPart => part.type === 'tool' && part.id === planProgressToolPartId(turnId));
}

function upsertPlanProgressToolPart(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  markdown: string,
  status: ToolPart['status'],
  operation: 'update' | 'write',
  capturingProposedPlan = false,
): void {
  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: planProgressToolPartId(turnId),
    kind: 'generic',
    title: 'plan',
    status,
    statusText: JSON.stringify({
      source: 'codex',
      action: 'plan',
      phase: status,
      params: {
        addedLines: planLineCount(markdown),
        operation,
        target: 'plan',
      },
    }),
    metadata: {
      capturingProposedPlan,
      planProgress: true,
    },
  });
}

function planProgressToolPartId(turnId: string): string {
  return `plan-${turnId}`;
}

function planLineCount(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => line.trim()).length;
}

function updateAssistantToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, payload: unknown): void {
  const update = rendererToolPartUpdate(payload);
  if (!update) {
    return;
  }

  let message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, update.itemId) ?? findAssistantMessage(snapshot, agentId, turnId);
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

  if (update.statusText === null) {
    delete toolPart.statusText;
  } else if (update.statusText !== undefined) {
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

function updateAssistantTurnDiff(snapshot: AppSnapshot, agentId: string, turnId: string, payload: unknown): void {
  if (!isRecord(payload)) {
    return;
  }

  const addedLines = typeof payload.addedLines === 'number' ? payload.addedLines : 0;
  const removedLines = typeof payload.removedLines === 'number' ? payload.removedLines : 0;
  if (!addedLines && !removedLines) {
    return;
  }

  const message = findAssistantMessage(snapshot, agentId, turnId);
  const toolPart = lastRunningFileChangeToolPart(message?.parts);
  if (!toolPart) {
    return;
  }

  const existingDescriptor = toolStatusDescriptor(toolPart.statusText);
  const existingParams = isRecord(existingDescriptor?.params) ? existingDescriptor.params : {};
  toolPart.statusText = JSON.stringify({
    action: typeof existingDescriptor?.action === 'string' ? existingDescriptor.action : 'edit',
    phase: toolPart.status,
    params: {
      ...existingParams,
      addedLines,
      removedLines,
      target: typeof existingParams.target === 'string' ? existingParams.target : toolPart.title,
    },
    source: 'codex',
  });
}

function toolStatusDescriptor(statusText: unknown): { action?: unknown; params?: unknown } | undefined {
  if (typeof statusText !== 'string' || !statusText.trim().startsWith('{')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(statusText) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function lastRunningFileChangeToolPart(parts: RendererMessagePart[] | undefined): ToolPart | undefined {
  if (!parts) {
    return undefined;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === 'tool' && part.kind === 'fileChange' && part.status === 'running') {
      return part;
    }
  }

  return undefined;
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

function workBacklogAssignment(value: unknown): WorkBacklogAssignment | null {
  if (
    !isRecord(value) ||
    value.provider !== 'github' ||
    typeof value.itemId !== 'string' ||
    typeof value.agentId !== 'string' ||
    typeof value.assignedAt !== 'string' ||
    (value.status !== 'working' && value.status !== 'completed')
  ) {
    return null;
  }

  return {
    provider: value.provider,
    itemId: value.itemId,
    agentId: value.agentId,
    assignedAt: value.assignedAt,
    status: value.status,
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function threadGoal(value: unknown): ThreadGoal | null {
  const goal = isRecord(value) && isRecord(value.goal) ? value.goal : value;
  if (
    !isRecord(goal) ||
    typeof goal.threadId !== 'string' ||
    typeof goal.objective !== 'string' ||
    !isThreadGoalStatus(goal.status) ||
    (goal.tokenBudget !== null && typeof goal.tokenBudget !== 'number') ||
    typeof goal.tokensUsed !== 'number' ||
    typeof goal.timeUsedSeconds !== 'number' ||
    typeof goal.createdAt !== 'number' ||
    typeof goal.updatedAt !== 'number'
  ) {
    return null;
  }

  return {
    threadId: goal.threadId,
    objective: goal.objective,
    status: goal.status,
    tokenBudget: goal.tokenBudget,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function isThreadGoalStatus(value: unknown): value is ThreadGoal['status'] {
  return value === 'active' ||
    value === 'paused' ||
    value === 'blocked' ||
    value === 'usageLimited' ||
    value === 'budgetLimited' ||
    value === 'complete';
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
      typeof message.createdAt !== 'string' ||
      ('turnId' in message && message.turnId !== undefined && typeof message.turnId !== 'string')
    ) {
      return false;
    }

    return (
      (!('kind' in message) || message.kind === undefined || message.kind === 'compaction' || message.kind === 'steer') &&
      message.parts.every(isRendererMessagePart)
    );
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

function hydrateAgentMessages(
  snapshot: AppSnapshot,
  agentId: string,
  messages: RendererMessage[],
  options: { replace?: boolean } = {},
): void {
  if (options.replace) {
    snapshot.messages = snapshot.messages.filter((message) => message.agentId !== agentId);
  }

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
    pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
    return;
  }

  snapshot.messages.splice(firstAgentMessageIndex, 0, ...messages);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
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
    statusText: value.statusText === null || typeof value.statusText === 'string' ? value.statusText : undefined,
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

function setBackendRuntimeStatus(snapshot: AppSnapshot, status: AppSnapshot['backendRuntimes'][number]): void {
  const existingIndex = snapshot.backendRuntimes.findIndex((candidate) => candidate.backend === status.backend);
  if (existingIndex === -1) {
    snapshot.backendRuntimes.push(status);
    return;
  }

  snapshot.backendRuntimes[existingIndex] = status;
}

function isBackend(value: unknown): value is AppSnapshot['backendRuntimes'][number]['backend'] {
  return value === 'codex' || value === 'claude';
}

function isBackendRuntimeStatus(value: unknown): value is AppSnapshot['backendRuntimes'][number]['status'] {
  return value === 'notConfigured' || value === 'starting' || value === 'running' || value === 'error';
}

function upsertAssistantToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, toolPart: ToolPart): void {
  const message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, toolPart.id) ?? ensureAssistantMessage(snapshot, agentId, turnId);
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
    pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
    return;
  }

  message.parts.push(toolPart);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
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

function applyToolInputRequest(snapshot: AppSnapshot, agentId: string, turnId: string, payload: unknown): void {
  const request = askUserRequest(payload);
  if (!request) {
    return;
  }

  const question = request.payload.request.questions[0];
  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: request.payload.request.itemId,
    kind: 'generic',
    title: 'ask_user_question',
    status: 'running',
    statusText: JSON.stringify({
      source: 'codex',
      action: 'ask_user_question',
      phase: 'running',
      params: {
        requestId: request.id,
        questions: request.payload.request.questions,
      },
    }),
    input: request.payload.request.questions,
    metadata: {
      requestId: request.id,
      question: question?.question,
    },
  });
}

function findPendingMcpToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, server: string, tool: string): ToolPart | undefined {
  const runningMcpTools = findAssistantMessages(snapshot, agentId, turnId).flatMap((message) => (
    message.parts.filter((part): part is ToolPart => {
      if (part.type !== 'tool' || part.kind !== 'mcp' || part.status !== 'running') {
        return false;
      }

      return true;
    })
  ));
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

function confirmToolRequest(payload: unknown): Extract<ClientRequest, { kind: 'confirm_tool' }> | null {
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

  return payload as Extract<ClientRequest, { kind: 'confirm_tool' }>;
}

function askUserRequest(payload: unknown): Extract<ClientRequest, { kind: 'ask_user' }> | null {
  if (
    !isRecord(payload) ||
    payload.kind !== 'ask_user' ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.request) ||
    typeof payload.payload.request.itemId !== 'string' ||
    !Array.isArray(payload.payload.request.questions)
  ) {
    return null;
  }

  return payload as Extract<ClientRequest, { kind: 'ask_user' }>;
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
  if (message.status !== 'complete') {
    message.status = 'streaming';
  }

  const textPart = message.parts.at(-1);
  if (textPart?.type === 'text' && textPart.itemId === itemId) {
    textPart.text += delta;
  } else {
    message.parts.push(itemId ? { type: 'text', text: delta, itemId } : { type: 'text', text: delta });
  }
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function appendCompactionMarker(snapshot: AppSnapshot, agentId: string, turnId: string, createdAt: string): RendererMessage {
  const existing = snapshot.messages.find((message) => {
    return message.agentId === agentId && message.id === compactionMessageId(turnId);
  });
  if (existing) {
    return existing;
  }

  const activeAssistantMessage = findAssistantMessage(snapshot, agentId, turnId);
  if (activeAssistantMessage?.parts.length === 0 && activeAssistantMessage.id === assistantMessageId(turnId)) {
    snapshot.messages = snapshot.messages.filter((message) => message !== activeAssistantMessage);
  } else if (activeAssistantMessage) {
    activeAssistantMessage.status = 'complete';
  }

  const message: RendererMessage = {
    id: compactionMessageId(turnId),
    agentId,
    kind: 'compaction',
    role: 'assistant',
    status: 'streaming',
    turnId,
    createdAt,
    parts: [],
  };
  snapshot.messages.push(message);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

function ensureAssistantMessage(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  messageId = assistantMessageId(turnId),
  createdAt = new Date().toISOString(),
): RendererMessage {
  let effectiveMessageId = messageId;
  let effectiveCreatedAt = createdAt;
  const compactionMessage = messageId === assistantMessageId(turnId)
    ? findCompactionMessages(snapshot, agentId, turnId).at(-1)
    : undefined;
  const message = messageId === assistantMessageId(turnId)
    ? findAssistantMessageForAppend(snapshot, agentId, turnId)
    : snapshot.messages.find((candidate) => candidate.id === messageId && candidate.agentId === agentId);

  if (message) {
    return message;
  }
  if (compactionMessage) {
    effectiveMessageId = assistantSegmentMessageId(turnId, compactionMessage.createdAt);
    effectiveCreatedAt = compactionMessage.createdAt;
  }

  const nextMessage: RendererMessage = {
    id: effectiveMessageId,
    agentId,
    role: 'assistant',
    status: 'streaming',
    turnId,
    createdAt: effectiveCreatedAt,
    parts: [],
  };
  snapshot.messages.push(nextMessage);
  return nextMessage;
}

function completeAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): void {
  for (const message of findAssistantMessages(snapshot, agentId, turnId)) {
    message.status = 'complete';
  }
  for (const message of findCompactionMessages(snapshot, agentId, turnId)) {
    message.status = 'complete';
  }

  snapshot.messages = snapshot.messages.filter((message) => (
    message.agentId !== agentId ||
    !isAssistantTurnMessage(message, agentId, turnId) ||
    message.parts.length > 0
  ));
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function pruneSupersededEmptyAssistantPlaceholders(snapshot: AppSnapshot, agentId: string): void {
  let lastAgentMessageIndex = -1;
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    if (snapshot.messages[index]?.agentId === agentId) {
      lastAgentMessageIndex = index;
      break;
    }
  }

  if (lastAgentMessageIndex === -1) {
    return;
  }

  snapshot.messages = snapshot.messages.filter((message, index) => (
    message.agentId !== agentId ||
    index === lastAgentMessageIndex ||
    !isPlainEmptyAssistantPlaceholder(message)
  ));
}

function isPlainEmptyAssistantPlaceholder(message: RendererMessage): boolean {
  return message.role === 'assistant' && message.kind === undefined && message.parts.length === 0;
}

function findAssistantMessageForAppend(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  const compactionMessage = findCompactionMessages(snapshot, agentId, turnId).at(-1);
  if (!compactionMessage) {
    return findAssistantMessage(snapshot, agentId, turnId);
  }

  const compactionIndex = snapshot.messages.indexOf(compactionMessage);
  return snapshot.messages
    .slice(compactionIndex + 1)
    .filter((message) => isAssistantTurnMessage(message, agentId, turnId))
    .at(-1);
}

function findAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  return findAssistantMessages(snapshot, agentId, turnId).at(-1);
}

function findAssistantMessages(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage[] {
  return snapshot.messages.filter((message) => isAssistantTurnMessage(message, agentId, turnId));
}

function isAssistantTurnMessage(message: RendererMessage, agentId: string, turnId: string): boolean {
  const baseId = assistantMessageId(turnId);
  return (
    message.agentId === agentId &&
    message.role === 'assistant' &&
    (message.id === baseId || message.id.startsWith(`${baseId}-segment-`))
  );
}

function findCompactionMessages(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage[] {
  return snapshot.messages.filter((message) => (
    message.agentId === agentId &&
    message.kind === 'compaction' &&
    message.turnId === turnId
  ));
}

function findAssistantMessageWithToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, itemId: string): RendererMessage | undefined {
  return findAssistantMessages(snapshot, agentId, turnId).find((message) => (
    message.parts.some((part) => part.type === 'tool' && part.id === itemId)
  ));
}

function assistantMessageId(turnId: string): string {
  return `assistant-${turnId}`;
}

function assistantSegmentMessageId(turnId: string, createdAt: string): string {
  return `${assistantMessageId(turnId)}-segment-${createdAt.replace(/\W/g, '').toLowerCase()}`;
}

function compactionMessageId(turnId: string): string {
  return `compaction-${turnId}`;
}

function createUserMessage(agentId: string, prompt: string, createdAt: string, idPrefix = 'message', turnId?: string): RendererMessage {
  const isSteer = idPrefix.startsWith('steer-');
  return {
    id: `${idPrefix}-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    ...(isSteer ? { kind: 'steer' as const } : {}),
    role: 'user',
    status: 'complete',
    ...(turnId ? { turnId } : {}),
    createdAt,
    parts: [{ type: 'text', text: prompt }],
  };
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

function targetTeamId(snapshot: AppSnapshot, teamId: string | undefined): string {
  if (teamId && snapshot.teams.some((team) => team.id === teamId)) {
    return teamId;
  }

  return activeTeamId(snapshot);
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
  delete agent.backendSession;
  delete agent.contextUsage;
  delete agent.plan;
  delete agent.goal;
  delete agent.isRegistered;
  delete agent.mcpSessionId;
  delete agent.statusText;
}

function normalizedBackend(value: AgentBackend | undefined): AgentBackend {
  return value === 'claude' ? 'claude' : 'codex';
}

function defaultBackendDefaults(backend: AgentBackend): Agent['backendDefaults'] {
  return backend === 'claude' ? { kind: 'claude' } : { kind: 'codex' };
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
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
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
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    },
  ];
}
