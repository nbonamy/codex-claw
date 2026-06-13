import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { transcribeWithAppleSpeechAnalyzer } from '../apple-speech';

describe('transcribeWithAppleSpeechAnalyzer', () => {
  it('writes audio, invokes the Apple speech CLI, reads text, and cleans up', async () => {
    const fs = fakeFs('ship the feature\n');
    const spawn = fakeSpawn(0);

    const result = await transcribeWithAppleSpeechAnalyzer(Buffer.from('audio'), { locale: 'en-US' }, {
      assetsPath: '/app/assets',
      fs,
      spawn,
      tmpdir: () => '/tmp',
    });

    expect(result).toStrictEqual({ text: 'ship the feature' });
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/codex-claw-apple-stt-123/input.wav', Buffer.from('audio'));
    expect(spawn).toHaveBeenCalledWith('/app/assets/apple-speechanalyzer-cli', [
      '--input-audio-path',
      '/tmp/codex-claw-apple-stt-123/input.wav',
      '--output-txt-path',
      '/tmp/codex-claw-apple-stt-123/output.txt',
      '--locale',
      'en-US',
    ]);
    expect(fs.rm).toHaveBeenCalledWith('/tmp/codex-claw-apple-stt-123', { recursive: true, force: true });
  });

  it('returns a renderer-safe error when the CLI fails', async () => {
    const fs = fakeFs('');
    const spawn = fakeSpawn(2, 'permission denied');

    const result = await transcribeWithAppleSpeechAnalyzer(Buffer.from('audio'), {}, {
      assetsPath: '/app/assets',
      fs,
      spawn,
      tmpdir: () => '/tmp',
    });

    expect(result).toStrictEqual({
      text: '',
      error: 'Apple speech CLI exited with code 2: permission denied',
    });
    expect(fs.rm).toHaveBeenCalledWith('/tmp/codex-claw-apple-stt-123', { recursive: true, force: true });
  });
});

function fakeFs(output: string) {
  return {
    mkdtemp: vi.fn(async (prefix: string) => `${prefix}123`),
    readFile: vi.fn(async (filePath: string) => {
      expect(path.basename(filePath)).toBe('output.txt');
      return output;
    }),
    rm: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  };
}

function fakeSpawn(code: number, stderr = '') {
  return vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
    };
    child.stderr = new EventEmitter();

    queueMicrotask(() => {
      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr));
      }
      child.emit('exit', code);
    });

    return child;
  });
}
