import { resolveRuntimeExecutable } from '@workspace/core/runtime-discovery';

export function resolveCodexCommand(
  configuredPath: string | undefined,
): string {
  const explicit = configuredPath?.trim();
  if (explicit) {
    return explicit;
  }

  // Always pass a command: undefined lets SDK discovery select an app-private CLI.
  return resolveRuntimeExecutable('codex') ?? 'codex';
}
