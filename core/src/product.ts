import product from './product.json';

export { product };

/** Claude reserves `workspace`; keep the existing Codex session namespace. */
export function appMcpServerName(backend: 'codex' | 'claude'): string {
  return backend === 'claude' ? product.mcpServerName : 'workspace';
}

/** Recognize current tools and retained conversations using the old namespace. */
export function isAppMcpServerName(value: unknown): boolean {
  return value === product.mcpServerName || value === 'workspace';
}

/** Accept the previous CLI name while an installed or remote daemon is upgraded. */
export function parseDaemonVersion(output: string): string | null {
  const match = /^(\S+)\s+(.+)$/u.exec(output.trim());
  return match && (match[1] === product.daemonName || match[1] === 'daemon')
    ? match[2].trim() || null
    : null;
}
