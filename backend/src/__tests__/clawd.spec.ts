import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../clawd';

describe('clawd entrypoint', () => {
  const originalExitCode = process.exitCode;
  const originalStderrWrite = process.stderr.write;

  afterEach(() => {
    process.exitCode = originalExitCode;
    process.stderr.write = originalStderrWrite;
  });

  it('rejects --state-dir so CODEX_CLAW_HOME is the only state-home override', async () => {
    const writes: string[] = [];
    process.exitCode = undefined;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    await main(['--stdio', '--state-dir', '/tmp/codex-claw']);

    expect(process.exitCode).toBe(1);
    expect(writes.join('')).toContain('Unsupported option: --state-dir');
    expect(writes.join('')).toContain('CODEX_CLAW_HOME');
  });
});
