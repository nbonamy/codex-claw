import path from 'node:path';
import { resolveRuntimeExecutable, withDiscoveredRuntimePath } from '@workspace/core/runtime-discovery';
import { backendHomeDir } from '../state';

export const acpVersion = '1.3.0';

function runtimeDirectory(): string { return path.join(backendHomeDir(), 'antigravity', acpVersion); }
export function antigravityHome(): string { return process.env.GEMINI_HOME || path.join(backendHomeDir(), 'antigravity-home'); }

export function resolveAcpRuntime(): { command: string; harness: string; args: string[] } | null {
  const command = process.env.APP_ANTIGRAVITY_COMMAND
    ? resolveRuntimeExecutable(process.env.APP_ANTIGRAVITY_COMMAND)
    : resolveRuntimeExecutable('agy_acp_server.par') ?? resolveRuntimeExecutable(path.join(runtimeDirectory(), 'agy_acp_server.par'));
  if (!command) return null;
  const harness = resolveRuntimeExecutable(process.env.ANTIGRAVITY_HARNESS_PATH || path.join(path.dirname(command), 'localharness_external'));
  return harness ? { command, harness, args: process.platform === 'linux' ? ['--uid='] : [] } : null;
}

export function acpEnvironment(home: string, harness: string, temp: string): NodeJS.ProcessEnv {
  const env = { ...withDiscoveredRuntimePath(undefined) };
  for (const key of Object.keys(env)) {
    if (/^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_|GOOGLE_GENAI_|AGY_ACP_)/.test(key)) delete env[key];
  }
  return { ...env, GEMINI_HOME: home, ANTIGRAVITY_HARNESS_PATH: harness,
    AGY_ACP_FORCE_FILE_STORAGE: '1', PYTHONUNBUFFERED: '1', TMPDIR: temp };
}
