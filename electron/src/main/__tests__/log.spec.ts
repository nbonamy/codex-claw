import { describe, expect, it } from 'vitest';
import { normalizeRendererConsoleMessage } from '../log';

describe('main logging', () => {
  it('redacts sensitive renderer values and bounds message size', () => {
    const message = `prompt=secret ${'x'.repeat(5_000)}`;
    const normalized = normalizeRendererConsoleMessage(message);

    expect(normalized).toContain('prompt=[redacted]');
    expect(normalized?.length).toBe(4_000);
  });

  it('drops noisy browser security diagnostics', () => {
    expect(normalizeRendererConsoleMessage('Electron Security Warning: test')).toBeNull();
    expect(normalizeRendererConsoleMessage('Third-party cookie will be blocked')).toBeNull();
  });
});
