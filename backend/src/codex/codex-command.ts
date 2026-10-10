import { resolveRuntimeLaunch } from '@workspace/core/runtime-discovery';

export function resolveCodexLaunch(
  configuredPath: string | undefined,
): ReturnType<typeof resolveRuntimeLaunch> {
  // Always pass a command: undefined lets SDK discovery select an app-private CLI.
  return resolveRuntimeLaunch(configuredPath?.trim() || 'codex');
}
