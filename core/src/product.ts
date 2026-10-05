import product from './product.json';

export { product };

/** Accept the previous CLI name while an installed or remote daemon is upgraded. */
export function parseDaemonVersion(output: string): string | null {
  const match = /^(\S+)\s+(.+)$/u.exec(output.trim());
  return match && (match[1] === product.daemonName || match[1] === 'daemon')
    ? match[2].trim() || null
    : null;
}
