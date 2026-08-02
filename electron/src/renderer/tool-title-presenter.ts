import {
  registerCodexToolTitlePresenter,
  type CodexToolTitlePresenterContext,
} from 'codex-app-sdk/vue';

type ToolPhase = 'completed' | 'failed' | 'running';

const TOOL_KEYS: Record<string, string> = {
  'broadcast-message': 'broadcastMessage',
  'browser-click': 'browserClick',
  'browser-console-logs': 'browserConsoleLogs',
  'browser-get-dom': 'browserGetDom',
  'browser-open': 'browserOpen',
  'browser-screenshot': 'browserScreenshot',
  'browser-scroll': 'browserScroll',
  'browser-type': 'browserType',
  'check-messages': 'checkMessages',
  'computer-use-click': 'computerUseClick',
  'computer-use-find-apps': 'computerUseFindApps',
  'computer-use-focus-app': 'computerUseFocusApp',
  'computer-use-get-app-state': 'computerUseGetAppState',
  'computer-use-launch-app': 'computerUseLaunchApp',
  'computer-use-list-apps': 'computerUseListApps',
  'computer-use-request-accessibility': 'computerUseRequestAccessibility',
  'computer-use-scroll': 'computerUseScroll',
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
  'mark-work-item-completed': 'markWorkItemCompleted',
  'register-agent': 'registerAgent',
  'send-message': 'sendMessage',
  'set-status': 'setStatus',
};

export function registerClawToolTitlePresenter(): () => void {
  return registerCodexToolTitlePresenter(presentClawToolTitle);
}

export function presentClawToolTitle({
  descriptor,
  toolCall,
  translate,
}: CodexToolTitlePresenterContext): string | undefined {
  const identity = clawToolIdentity(toolCall.function, descriptor?.params?.tool);
  if (!identity) return undefined;

  const key = TOOL_KEYS[identity.tool];
  if (!key) return undefined;

  const args = isRecord(toolCall.args) ? toolCall.args : {};
  const phase = toolPhase(descriptor?.phase, toolCall.state);
  if (identity.tool === 'set-status' && phase === 'completed' && args.status === '') {
    return translate('chat.tool.mcp.codexClaw.setStatus.cleared');
  }

  return translate(`chat.tool.mcp.codexClaw.${key}.${phase}`, {
    target: toolTarget(identity.tool, args),
  });
}

function clawToolIdentity(functionName: string, descriptorTool: unknown): { tool: string } | undefined {
  const rawName = typeof descriptorTool === 'string' ? descriptorTool : functionName;
  const toolName = rawName.startsWith('mcp__codex_claw__')
    ? rawName.slice('mcp__codex_claw__'.length)
    : /^(?:codex_claw)[._](.+)$/.exec(rawName)?.[1];
  if (!toolName) return undefined;

  return { tool: toolName.replaceAll('_', '-') };
}

function toolPhase(descriptorPhase: string | undefined, state: string): ToolPhase {
  if (descriptorPhase === 'failed' || state === 'error') return 'failed';
  if (descriptorPhase === 'completed' || state === 'completed') return 'completed';
  return 'running';
}

function toolTarget(tool: string, args: Record<string, unknown>): string {
  const candidates = tool === 'send-message'
    ? [args.to]
    : tool === 'browser-open'
      ? [args.url]
      : tool === 'display-markdown'
        ? [args.title, args.path]
        : tool === 'create-agent'
          ? [args.name, args.repoPath]
          : tool === 'create-worktree'
            ? [args.branchName, args.destinationPath]
            : tool === 'list-worktrees'
              ? [args.repoPath]
              : tool.startsWith('computer-use-')
                ? [args.name, args.appName, args.bundleIdentifier, args.path]
                : [];

  const target = candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
  return target?.trim() ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
