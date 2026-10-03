import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ClaudeAuthentication } from '@codex-claw/core/contracts';
import { withDiscoveredRuntimePath } from '@codex-claw/core/runtime-discovery';
import { claudeConfigDirectoryOverride } from './config-directory';

const run = promisify(execFile);

/** Return only safe account metadata, never credential material or raw CLI output. */
export async function getLocalClaudeAuthentication(): Promise<ClaudeAuthentication> {
  const configDirectory = claudeConfigDirectoryOverride();
  let stdout: string;
  try {
    ({ stdout } = await run(process.env.CODEX_CLAW_CLAUDE_COMMAND || 'claude', ['auth', 'status', '--json'], {
      env: withDiscoveredRuntimePath({ CLAUDE_CONFIG_DIR: configDirectory }),
      timeout: 15_000,
      maxBuffer: 64 * 1024,
      encoding: 'utf8',
    }));
  } catch (error) {
    // Claude returns exit 1 with a valid signed-out status. Other failures must
    // not turn into a successful connection or expose raw process output.
    const failure = error as { code?: unknown; stdout?: unknown };
    if (failure.code !== 1 || typeof failure.stdout !== 'string') {
      throw new Error('Could not check Claude Code authentication. Make sure Claude Code is installed.');
    }
    stdout = failure.stdout;
  }
  let status: unknown;
  try { status = JSON.parse(stdout); } catch { /* Report only a safe error. */ }
  if (!status || typeof status !== 'object' || !('loggedIn' in status) || typeof status.loggedIn !== 'boolean') {
    throw new Error('Claude Code returned an invalid authentication status.');
  }
  const metadata = status as Record<string, unknown>;
  const account = !status.loggedIn ? undefined : metadata.authMethod === 'claude.ai'
    ? { type: 'subscription' as const,
      ...(typeof metadata.email === 'string' ? { email: metadata.email } : {}),
      ...(typeof metadata.subscriptionType === 'string' ? { subscription: metadata.subscriptionType } : {}),
    }
    : metadata.authMethod === 'api_key' ? { type: 'apiKey' as const } : undefined;
  return { loggedIn: status.loggedIn, configDirectory: configDirectory ?? null, ...(account ? { account } : {}) };
}
