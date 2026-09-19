import {
  type CodexToolTitlePresenterContext,
} from '@codex-app-sdk/vue';

type ToolPhase = 'completed' | 'failed' | 'running';
type AgentNameResolver = (identifier: string) => string | undefined;

const TOOL_KEYS: Record<string, string> = {
  'broadcast-message': 'broadcastMessage',
  'browser-click': 'browserClick',
  'browser-console-logs': 'browserConsoleLogs',
  'browser-get-dom': 'browserGetDom',
  'browser-open': 'browserOpen',
  'browser-screenshot': 'browserScreenshot',
  'browser-scroll': 'browserScroll',
  'browser-type': 'browserType',
  'celebrate': 'celebrate',
  'announce': 'announce',
  'check-messages': 'checkMessages',
  'computer-use-click': 'computerUseClick',
  'computer-use-dismiss': 'computerUseDismiss',
  'computer-use-drag': 'computerUseDrag',
  'computer-use-find-apps': 'computerUseFindApps',
  'computer-use-focus-app': 'computerUseFocusApp',
  'computer-use-get-app-state': 'computerUseGetAppState',
  'computer-use-guide': 'computerUseGuide',
  'computer-use-launch-app': 'computerUseLaunchApp',
  'computer-use-list-apps': 'computerUseListApps',
  'computer-use-list-windows': 'computerUseListWindows',
  'computer-use-paste': 'computerUsePaste',
  'computer-use-perform-secondary-action': 'computerUsePerformSecondaryAction',
  'computer-use-press-key': 'computerUsePressKey',
  'computer-use-request-accessibility': 'computerUseRequestAccessibility',
  'computer-use-request-screen-recording': 'computerUseRequestScreenRecording',
  'computer-use-scroll': 'computerUseScroll',
  'computer-use-select-text': 'computerUseSelectText',
  'computer-use-screenshot': 'computerUseScreenshot',
  'computer-use-set-value': 'computerUseSetValue',
  'computer-use-status': 'computerUseStatus',
  'computer-use-stop': 'computerUseStop',
  'computer-use-type-text': 'computerUseTypeText',
  'create-agent': 'createAgent',
  'create-worktree': 'createWorktree',
  'display-markdown': 'displayMarkdown',
  'list-agents': 'listAgents',
  'list-repos': 'listRepos',
  'list-worktrees': 'listWorktrees',
  'set-mission-title': 'setMissionTitle',
  'attach-mission-repository': 'attachMissionRepository',
  'list-mission-artifacts': 'listMissionArtifacts',
  'read-mission-artifact': 'readMissionArtifact',
  'write-mission-artifact': 'writeMissionArtifact',
  'submit-mission-result': 'submitMissionResult',
  'upsert-mission-ticket': 'upsertMissionTicket',
  'update-work-item': 'updateWorkItem',
  'register-agent': 'registerAgent',
  'send-message': 'sendMessage',
  'set-status': 'setStatus',
};

export function presentClawToolTitle({
  descriptor,
  toolCall,
  translate,
}: CodexToolTitlePresenterContext, resolveAgentName?: AgentNameResolver): string | undefined {
  const identity = clawToolIdentity(toolCall.function, descriptor?.params?.tool, toolCall.kind, toolCall.metadata);
  if (!identity) return undefined;

  const key = TOOL_KEYS[identity.tool];
  if (!key) return undefined;

  const args = isRecord(toolCall.args) ? toolCall.args : {};
  const phase = toolPhase(descriptor?.phase, toolCall.state);
  if (identity.tool === 'set-status' && phase === 'completed' && args.status === '') {
    return translate('chat.tool.mcp.codexClaw.setStatus.cleared');
  }
  if (identity.tool === 'announce' && phase === 'completed') {
    const outcome = announcementOutcome(toolCall.result);
    if (outcome) return translate(`chat.tool.mcp.codexClaw.announce.${outcome}`);
  }
  return translate(`chat.tool.mcp.codexClaw.${key}.${phase}`, {
    target: toolTarget(identity.tool, args, toolCall.result, phase, resolveAgentName),
  });
}

function clawToolIdentity(
  functionName: string,
  descriptorTool: unknown,
  kind?: string,
  metadata?: Readonly<Record<string, unknown>>,
): { tool: string } | undefined {
  const metadataTool = clawMcpToolName(kind, metadata);
  if (metadataTool) return { tool: metadataTool };

  const rawName = typeof descriptorTool === 'string' ? descriptorTool : functionName;
  const toolName = rawName.startsWith('mcp__codex_claw__')
    ? rawName.slice('mcp__codex_claw__'.length)
    : /^(?:codex_claw)[._](.+)$/.exec(rawName)?.[1];
  if (!toolName) return undefined;

  return { tool: toolName.replaceAll('_', '-') };
}

export function clawMcpToolName(
  kind?: string,
  metadata?: Readonly<Record<string, unknown>>,
): string | undefined {
  if (kind !== 'mcp' || metadata?.server !== 'codex_claw' || typeof metadata.tool !== 'string') {
    return undefined;
  }
  const tool = metadata.tool.trim().replaceAll('_', '-');
  return tool || undefined;
}

function toolPhase(descriptorPhase: string | undefined, state: string): ToolPhase {
  if (descriptorPhase === 'failed' || state === 'error') return 'failed';
  if (descriptorPhase === 'completed' || state === 'completed') return 'completed';
  return 'running';
}

function toolTarget(
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
  phase: ToolPhase,
  resolveAgentName?: AgentNameResolver,
): string {
  const requestedRecipient = typeof args.to === 'string' ? args.to.trim() : '';
  const candidates = tool === 'send-message'
    ? [
        phase === 'completed' ? resultString(result, 'recipientName') : undefined,
        requestedRecipient ? resolveAgentName?.(requestedRecipient) : undefined,
        requestedRecipient,
      ]
    : tool === 'announce'
      ? [announcementPhase(args.phase), announcementPhase(resultString(result, 'phase'))]
      : tool === 'browser-open'
      ? [args.url]
      : tool === 'display-markdown'
        ? [args.title, args.path]
        : tool === 'celebrate'
          ? [celebrationKind(args.kind), celebrationKind(resultString(result, 'kind'))]
          : tool === 'create-agent'
            ? [phase === 'completed' ? resultString(result, 'agentName') : undefined, args.name, args.branchName, args.repoPath]
            : tool === 'create-worktree'
              ? [args.branchName, args.destinationPath]
              : tool === 'list-worktrees'
                ? [args.repoPath]
                : tool.startsWith('computer-use-')
                  ? [computerUseTarget(tool, args, result)]
                  : [];

  const target = candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
  return target?.trim() ?? '';
}

function announcementPhase(value: unknown): string | undefined {
  return value === 'start' ? 'start' : value === 'finish' ? 'finish' : undefined;
}

function announcementOutcome(result: unknown): 'queued' | 'skipped' | undefined {
  const outcome = resultString(result, 'outcome');
  return outcome === 'queued' || outcome === 'skipped' ? outcome : undefined;
}

function computerUseTarget(tool: string, args: Record<string, unknown>, result: unknown): string {
  const app = computerUseAppTarget(args, result);
  const elementIndex = integer(args.element_index);
  const rootElementIndex = integer(args.rootElementIndex);
  const x = finiteNumber(args.x);
  const y = finiteNumber(args.y);

  switch (tool) {
    case 'computer-use-click':
      if (elementIndex !== undefined) return `control #${elementIndex} in ${app}`;
      if (x !== undefined && y !== undefined) return `${app} at (${x}, ${y})`;
      return `app control in ${app}`;
    case 'computer-use-find-apps':
      return hasExplicitAppTarget(args) ? `installed apps matching ${app}` : 'installed apps';
    case 'computer-use-focus-app':
    case 'computer-use-launch-app':
      return app;
    case 'computer-use-get-app-state':
      return rootElementIndex === undefined ? app : `control #${rootElementIndex} in ${app}`;
    case 'computer-use-list-apps': {
      const count = resultArrayLength(result, 'apps');
      return count === undefined ? 'open apps' : `${count} open apps`;
    }
    case 'computer-use-list-windows': {
      const count = resultArrayLength(result, 'windows');
      return count === undefined ? `${app} windows` : `${count} ${app} windows`;
    }
    case 'computer-use-scroll': {
      const direction = firstString(args.direction);
      return elementIndex === undefined
        ? `${direction ?? ''}${direction ? ' in ' : ''}${app}`
        : `control #${elementIndex}${direction ? ` ${direction}` : ''} in ${app}`;
    }
    case 'computer-use-screenshot': {
      if (args.scope === 'screen') {
        const displayId = integer(args.displayId);
        return `${displayId === undefined ? 'main display' : `display ${displayId}`} screenshot`;
      }
      return `${app} window screenshot`;
    }
    case 'computer-use-set-value':
    case 'computer-use-select-text':
    case 'computer-use-perform-secondary-action':
      return elementIndex === undefined ? `app control in ${app}` : `control #${elementIndex} in ${app}`;
    case 'computer-use-press-key': {
      const key = firstString(args.key);
      return key ? `${key} in ${app}` : app;
    }
    case 'computer-use-drag':
    case 'computer-use-paste':
    case 'computer-use-type-text':
      return app;
    default:
      return app;
  }
}

function computerUseAppTarget(args: Record<string, unknown>, result: unknown): string {
  return resultAppName(result) ??
    firstString(args.app, args.name, args.appName) ??
    appNameFromPath(firstString(args.path)) ??
    firstString(args.bundleIdentifier) ??
    (integer(args.pid) === undefined ? 'frontmost app' : 'target app');
}

function resultAppName(result: unknown): string | undefined {
  const payloads = nestedResultRecords(result);
  for (const payload of payloads) {
    const app = isRecord(payload.app) ? payload.app : undefined;
    const name = app ? firstString(app.localizedName, app.name) : undefined;
    if (name) return name;
  }
  return undefined;
}

function resultArrayLength(result: unknown, key: string): number | undefined {
  for (const payload of nestedResultRecords(result)) {
    if (Array.isArray(payload[key])) return payload[key].length;
  }
  return undefined;
}

function nestedResultRecords(result: unknown): Record<string, unknown>[] {
  if (!isRecord(result)) return [];
  const records = [result];
  for (const key of ['structuredContent', 'result']) {
    if (isRecord(result[key])) records.push(result[key]);
  }
  return records;
}

function hasExplicitAppTarget(args: Record<string, unknown>): boolean {
  return firstString(args.app, args.name, args.appName, args.bundleIdentifier, args.path) !== undefined;
}

function appNameFromPath(value: string | undefined): string | undefined {
  const name = value?.split('/').filter(Boolean).at(-1)?.replace(/\.app$/u, '').trim();
  return name || undefined;
}

function firstString(...values: unknown[]): string | undefined {
  const value = values.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
  return value?.trim();
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resultString(result: unknown, key: string): string | undefined {
  for (const payload of nestedResultRecords(result)) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function celebrationKind(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim() === 'schoolPride' ? 'school pride' : value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
