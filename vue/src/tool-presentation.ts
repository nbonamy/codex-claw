import {
  provideCodexToolPresentation,
  type CodexToolPresentation,
  type CodexToolPresentationContext,
  type CodexToolTitlePresenterContext,
} from '@codex-app-sdk/vue';
import {
  IconBrowser as BrowserIcon,
  IconDeviceDesktop as DeviceDesktopIcon,
  IconGitBranch as GitBranchIcon,
  IconMarkdown as MarkdownIcon,
  IconMessage as MessageIcon,
  IconMessageReport as MessageReportIcon,
  IconSquareCheck as SquareCheck,
  IconTargetArrow as TargetArrowIcon,
  IconSitemap as SitemapIcon,
  IconUsers as UsersIcon,
} from '@tabler/icons-vue';
import { clawMcpToolName, presentClawToolTitle } from './tool-title-presenter';

type Translate = CodexToolTitlePresenterContext['translate'];
type ToolIcon = Exclude<CodexToolPresentation['icon'], null | undefined>;
type AgentNameResolver = (identifier: string) => string | undefined;

// The linked SDK and Claw resolve Vue through separate package roots during
// typechecking, while Vite dedupes them at runtime. Keep that cast at this one
// host boundary instead of leaking it through the resolver.
const icons = {
  agents: UsersIcon as unknown as ToolIcon,
  browser: BrowserIcon as unknown as ToolIcon,
  computerUse: DeviceDesktopIcon as unknown as ToolIcon,
  markdown: MarkdownIcon as unknown as ToolIcon,
  messages: MessageIcon as unknown as ToolIcon,
  review: MessageReportIcon as unknown as ToolIcon,
  workItem: SquareCheck as unknown as ToolIcon,
  mission: TargetArrowIcon as unknown as ToolIcon,
  design: SitemapIcon as unknown as ToolIcon,
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
  'computer-use-dismiss',
  'computer-use-drag',
  'computer-use-find-apps',
  'computer-use-focus-app',
  'computer-use-get-app-state',
  'computer-use-guide',
  'computer-use-launch-app',
  'computer-use-list-apps',
  'computer-use-list-windows',
  'computer-use-paste',
  'computer-use-perform-secondary-action',
  'computer-use-press-key',
  'computer-use-request-accessibility',
  'computer-use-request-screen-recording',
  'computer-use-scroll',
  'computer-use-select-text',
  'computer-use-screenshot',
  'computer-use-set-value',
  'computer-use-status',
  'computer-use-stop',
  'computer-use-type-text',
]);
const MESSAGE_TOOLS = new Set(['broadcast-message', 'check-messages', 'send-message']);
const REVIEW_TOOLS = new Set(['mark-finding-complete', 'report-finding', 'update-finding']);
const DESIGN_TOOLS = new Set(['suggest-design-diagrams', 'add-design-diagram', 'get-design-diagram', 'replace-design-diagram']);
const AGENT_TOOLS = new Set(['create-agent', 'finish-turn', 'toggle-thread-flag', 'list-agents', 'register-agent', 'set-status']);
const WORKSPACE_TOOLS = new Set(['attach-mission-repository', 'create-worktree', 'list-repos', 'list-worktrees']);

export function presentClawTool(
  context: CodexToolPresentationContext,
  translate: Translate,
  resolveAgentName?: AgentNameResolver,
): CodexToolPresentation | undefined {
  const tool = clawMcpToolName(context.kind, context.metadata);
  const icon = tool ? clawToolIcon(tool) : undefined;
  if (!icon) return undefined;

  const title = presentClawToolTitle({
    descriptor: context.descriptor,
    toolCall: context.toolCall,
    translate,
  }, resolveAgentName);
  return {
    icon,
    ...(title ? { title } : {}),
  };
}

export function provideClawToolPresentation(translate: Translate, resolveAgentName?: AgentNameResolver): void {
  provideCodexToolPresentation((context) => presentClawTool(context, translate, resolveAgentName));
}

function clawToolIcon(tool: string): ToolIcon | undefined {
  if (BROWSER_TOOLS.has(tool)) return icons.browser;
  if (COMPUTER_USE_TOOLS.has(tool)) return icons.computerUse;
  if (MESSAGE_TOOLS.has(tool)) return icons.messages;
  if (REVIEW_TOOLS.has(tool)) return icons.review;
  if (DESIGN_TOOLS.has(tool)) return icons.design;
  if (AGENT_TOOLS.has(tool)) return icons.agents;
  if (WORKSPACE_TOOLS.has(tool)) return icons.workspace;
  if (tool === 'display-markdown' || tool === 'list-mission-artifacts' || tool === 'read-mission-artifact') return icons.markdown;
  if (tool === 'set-mission-title') return icons.mission;
  if (tool === 'update-work-item' || tool === 'write-mission-artifact' || tool === 'submit-mission-result' || tool === 'upsert-mission-ticket') return icons.workItem;
  return undefined;
}
