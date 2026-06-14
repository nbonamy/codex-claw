import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

let logWriteQueue = Promise.resolve();

export function logMain(area: string, message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const suffix = details ? ` ${safeJson(details)}` : '';
  writeLogLine('info', area, message, suffix);
}

export function warnMain(area: string, message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const suffix = details ? ` ${safeJson(details)}` : '';
  writeLogLine('warn', area, message, suffix);
}

export function backendLogFilePath(): string {
  const home = process.env.CODEX_CLAW_HOME?.trim() || path.join(homedir(), '.codex-claw');
  return path.join(home, 'logs', 'clawd.log');
}

export async function flushBackendLogs(): Promise<void> {
  await logWriteQueue;
}

function writeLogLine(level: 'info' | 'warn', area: string, message: string, suffix: string): void {
  const line = `[clawd:${area}] ${message}${suffix}`;
  const timestampedLine = `${new Date().toISOString()} ${level.toUpperCase()} ${line}\n`;
  if (level === 'warn') {
    console.warn(line);
  } else {
    console.error(line);
  }
  enqueueFileLog(timestampedLine);
}

function enqueueFileLog(line: string): void {
  logWriteQueue = logWriteQueue
    .then(async () => {
      const filePath = backendLogFilePath();
      await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      await appendFile(filePath, line, { encoding: 'utf8', mode: 0o600 });
    })
    .catch((error) => {
      process.stderr.write(`[clawd:log] failed to write log file ${error instanceof Error ? error.message : String(error)}\n`);
    });
}

function safeJson(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details);
  } catch {
    return JSON.stringify({ detail: 'unserializable' });
  }
}
