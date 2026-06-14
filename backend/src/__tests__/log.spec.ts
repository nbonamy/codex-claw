import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
let tempDir: string | null = null;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'codex-claw-log-'));
  vi.stubEnv('CODEX_CLAW_HOME', tempDir);
  vi.stubEnv('NODE_ENV', 'development');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  if (originalNodeEnv === undefined) {
    vi.unstubAllEnvs();
    delete process.env.NODE_ENV;
  } else {
    vi.unstubAllEnvs();
    process.env.NODE_ENV = originalNodeEnv;
  }
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('backend logging', () => {
  it('writes backend logs under CODEX_CLAW_HOME', async () => {
    const { backendLogFilePath, flushBackendLogs, logMain, warnMain } = await import('../log');

    logMain('mcp-http', 'listening', { url: 'http://127.0.0.1:1234/mcp' });
    warnMain('mcp-tool', 'error', { tool: 'send_message', message: 'failed' });
    await flushBackendLogs();

    expect(backendLogFilePath()).toBe(path.join(tempDir!, 'logs', 'clawd.log'));
    await expect(readFile(backendLogFilePath(), 'utf8')).resolves.toMatch(
      /INFO \[clawd:mcp-http\] listening {"url":"http:\/\/127\.0\.0\.1:1234\/mcp"}\n.*WARN \[clawd:mcp-tool\] error {"tool":"send_message","message":"failed"}/s,
    );
    expect(console.error).toHaveBeenCalledWith('[clawd:mcp-http] listening {"url":"http://127.0.0.1:1234/mcp"}');
    expect(console.warn).toHaveBeenCalledWith('[clawd:mcp-tool] error {"tool":"send_message","message":"failed"}');
  });
});
