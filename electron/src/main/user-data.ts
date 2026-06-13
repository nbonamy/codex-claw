import { app } from 'electron';
import path from 'node:path';

export function defaultUserDataPath(): string {
  if (app?.getPath) {
    try {
      return app.getPath('userData');
    } catch {
      return path.join(process.cwd(), '.codex-claw-test');
    }
  }

  return path.join(process.cwd(), '.codex-claw-test');
}
