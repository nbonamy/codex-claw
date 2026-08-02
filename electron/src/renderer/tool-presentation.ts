import {
  provideCodexToolPresentation,
  type CodexToolPresentation,
  type CodexToolPresentationContext,
  type CodexToolTitlePresenterContext,
} from 'codex-app-sdk/vue';
import {
  IconBrowser as BrowserIcon,
  IconDeviceDesktop as DeviceDesktopIcon,
  IconGitBranch as GitBranchIcon,
  IconMarkdown as MarkdownIcon,
  IconMessage as MessageIcon,
  IconSquareCheck as SquareCheck,
  IconUsers as UsersIcon,
} from '@tabler/icons-vue';
import { clawMcpToolName, presentClawToolTitle } from './tool-title-presenter';

type Translate = CodexToolTitlePresenterContext['translate'];
type ToolIcon = Exclude<CodexToolPresentation['icon'], null | undefined>;

// The linked SDK and Claw resolve Vue through separate package roots during
// typechecking, while Vite dedupes them at runtime. Keep that cast at this one
// host boundary instead of leaking it through the resolver.
const icons = {
  agents: UsersIcon as unknown as ToolIcon,
  browser: BrowserIcon as unknown as ToolIcon,
  computerUse: DeviceDesktopIcon as unknown as ToolIcon,
  markdown: MarkdownIcon as unknown as ToolIcon,
  messages: MessageIcon as unknown as ToolIcon,
  workItem: SquareCheck as unknown as ToolIcon,
  workspace: GitBranchIcon as unknown as ToolIcon,
};

const BROWSER_TOOLS = new Set([
  'browser-click',
  'browser-console-logs',
  'browser-get-dom',
  'browser-open',
  'browser-screenshot',
  'browser-scroll',
  'browser-type',
]);
const COMPUTER_USE_TOOLS = new Set([
  'computer-use-click',
  'computer-use-find-apps',
  'computer-use-focus-app',
  'computer-use-get-app-state',
  'computer-use-launch-app',
  'computer-use-list-apps',
  'computer-use-request-accessibility',
  'computer-use-scroll',
  'computer-use-set-value',
  'computer-use-status',
  'computer-use-stop',
  'computer-use-type-text',
]);
const MESSAGE_TOOLS = new Set(['broadcast-message', 'check-messages', 'send-message']);
const AGENT_TOOLS = new Set(['create-agent', 'list-agents', 'register-agent', 'set-status']);
const WORKSPACE_TOOLS = new Set(['create-worktree', 'list-repos', 'list-worktrees']);

export function presentClawTool(
  context: CodexToolPresentationContext,
  translate: Translate,
): CodexToolPresentation | undefined {
  const tool = clawMcpToolName(context.kind, context.metadata);
  const icon = tool ? clawToolIcon(tool) : undefined;
  if (!icon) return undefined;

  const title = presentClawToolTitle({
    descriptor: context.descriptor,
    toolCall: context.toolCall,
    translate,
  });
  return {
    icon,
    ...(title ? { title } : {}),
  };
}

export function provideClawToolPresentation(translate: Translate): void {
  provideCodexToolPresentation((context) => presentClawTool(context, translate));
}

function clawToolIcon(tool: string): ToolIcon | undefined {
  if (BROWSER_TOOLS.has(tool)) return icons.browser;
  if (COMPUTER_USE_TOOLS.has(tool)) return icons.computerUse;
  if (MESSAGE_TOOLS.has(tool)) return icons.messages;
  if (AGENT_TOOLS.has(tool)) return icons.agents;
  if (WORKSPACE_TOOLS.has(tool)) return icons.workspace;
  if (tool === 'display-markdown') return icons.markdown;
  if (tool === 'mark-work-item-completed') return icons.workItem;
  return undefined;
}
