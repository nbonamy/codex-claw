import type { AppCommand } from '@codex-claw/core/contracts';

export const codexClawDeepLinkScheme = 'codex-claw';
const codexClawDeepLinkProtocol = `${codexClawDeepLinkScheme}:`;
const MAX_DEEP_LINK_PROMPT_LENGTH = 100_000;

export function appCommandFromDeepLink(value: string): AppCommand | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== codexClawDeepLinkProtocol
    || url.username
    || url.password
    || url.port
    || url.hash
  ) {
    return null;
  }

  const prompt = url.searchParams.get('prompt');
  if (prompt !== null && prompt.length > MAX_DEEP_LINK_PROMPT_LENGTH) return null;
  const submitParam = url.searchParams.get('submit');
  if (submitParam !== null && submitParam !== 'true' && submitParam !== 'false') return null;
  const submit = submitParam !== 'false';
  if (url.hostname === 'new' && (url.pathname === '' || url.pathname === '/')) {
    return prompt === null ? null : { type: 'open-agent-composer', prompt, submit };
  }
  if (url.hostname !== 'agents') return null;
  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (pathSegments.length !== 1) return null;
  let agentId: string;
  try {
    agentId = decodeURIComponent(pathSegments[0]!).trim();
  } catch {
    return null;
  }
  if (!agentId || agentId.includes('/')) return null;
  return {
    type: 'open-agent-composer',
    agentId,
    ...(prompt === null ? {} : { prompt, submit }),
  };
}

export function deepLinksFromArgv(argv: readonly string[]): string[] {
  return argv.filter((value) => value.startsWith(`${codexClawDeepLinkProtocol}//`));
}
