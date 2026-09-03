import type { SpokenAnnouncementRequest } from '@codex-claw/core/contracts';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../log', () => ({ warnMain: vi.fn() }));

import {
  NativeSpokenAnnouncementEngine,
  SpokenAnnouncementQueue,
  createRuntimeSpokenAnnouncementQueue,
  resolveSpokenAnnouncementHelperPath,
  type SpokenAnnouncementEngine,
  type SpokenAnnouncementPlayback,
} from '../spoken-announcements';

class FakeEngine implements SpokenAnnouncementEngine {
  readonly available = true;
  readonly requests: SpokenAnnouncementRequest[] = [];
  readonly playbacks: Array<SpokenAnnouncementPlayback & { finish: () => void }> = [];

  speak(request: SpokenAnnouncementRequest, settled: () => void): SpokenAnnouncementPlayback {
    this.requests.push(request);
    const playback = { cancel: vi.fn(settled), finish: settled };
    this.playbacks.push(playback);
    return playback;
  }
}

const request = (agentId: string, phase: 'start' | 'finish', text = 'On it.'): SpokenAnnouncementRequest => ({
  agentId,
  phase,
  text,
});

describe('SpokenAnnouncementQueue', () => {
  it('serializes agents and coalesces pending work to the latest request', () => {
    const engine = new FakeEngine();
    const queue = new SpokenAnnouncementQueue(engine);

    expect(queue.queue(request('a', 'start'))).toStrictEqual({ queued: true });
    expect(queue.queue(request('b', 'start'))).toStrictEqual({ queued: true });
    expect(queue.queue(request('c', 'finish', 'Done.'))).toStrictEqual({ queued: true });
    expect(engine.requests.map(({ agentId }) => agentId)).toStrictEqual(['a']);

    engine.playbacks[0]?.finish();
    expect(engine.requests.map(({ agentId }) => agentId)).toStrictEqual(['a', 'c']);
  });

  it('cancels a running start phrase when the same agent finishes', () => {
    const engine = new FakeEngine();
    const queue = new SpokenAnnouncementQueue(engine);

    queue.queue(request('a', 'start'));
    expect(queue.queue(request('a', 'finish', 'All done.'))).toStrictEqual({ queued: true });

    expect(engine.playbacks[0]?.cancel).toHaveBeenCalledOnce();
    expect(engine.requests.map(({ phase }) => phase)).toStrictEqual(['start', 'finish']);
  });

  it('rate limits repeated phases and never displaces a pending finish with a start', () => {
    let now = 10_000;
    const engine = new FakeEngine();
    const queue = new SpokenAnnouncementQueue(engine, { now: () => now, rateLimitMs: 2_000 });

    queue.queue(request('a', 'start'));
    expect(queue.queue(request('a', 'start', 'Still on it.'))).toStrictEqual({ queued: false, reason: 'rateLimited' });
    queue.queue(request('b', 'finish'));
    expect(queue.queue(request('c', 'start'))).toStrictEqual({ queued: false, reason: 'superseded' });
    engine.playbacks[0]?.finish();
    engine.playbacks[1]?.finish();
    now += 2_000;
    expect(queue.queue(request('a', 'start'))).toStrictEqual({ queued: true });
  });

  it('rejects requests when the native engine is unavailable', () => {
    const queue = new SpokenAnnouncementQueue({ available: false, speak: vi.fn() });
    expect(queue.queue(request('a', 'start'))).toStrictEqual({ queued: false, reason: 'unsupported' });
  });

  it('recovers from synchronous engine failure, bounds rate-limit state, and disposes playback', () => {
    const failing = new SpokenAnnouncementQueue({
      available: true,
      speak: vi.fn(() => { throw new Error('spawn failed'); }),
    });
    expect(failing.queue(request('failed', 'start'))).toStrictEqual({ queued: true });
    expect(failing.queue(request('next', 'finish'))).toStrictEqual({ queued: true });

    const engine = new FakeEngine();
    const queue = new SpokenAnnouncementQueue(engine, { rateLimitMs: 60_000 });
    queue.queue(request('active', 'start'));
    for (let index = 0; index < 70; index += 1) {
      queue.queue(request(`agent-${index}`, 'start'));
    }
    queue.dispose();
    expect(engine.playbacks[0]?.cancel).toHaveBeenCalledOnce();
  });
});

describe('NativeSpokenAnnouncementEngine', () => {
  it('uses unpacked and development helper paths deterministically', () => {
    expect(resolveSpokenAnnouncementHelperPath({
      appPath: '/repo/electron',
      isPackaged: false,
      platform: 'darwin',
      resourcesPath: '/unused',
    })).toBe('/repo/electron/.tts/codex-claw-tts-helper');
    expect(resolveSpokenAnnouncementHelperPath({
      appPath: '/unused',
      isPackaged: true,
      platform: 'darwin',
      resourcesPath: '/App/Contents/Resources',
    })).toBe('/App/Contents/Resources/codex-claw-tts-helper');
  });

  it('writes one bounded JSON request and settles once on helper exit', () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      killed: false,
      kill: vi.fn(function (this: { killed: boolean }) { this.killed = true; return true; }),
    });
    let written = '';
    child.stdin.on('data', (chunk) => { written += chunk.toString(); });
    const settled = vi.fn();
    const engine = new NativeSpokenAnnouncementEngine({
      appPath: '/repo/electron',
      isPackaged: false,
      platform: 'darwin',
      resourcesPath: '/unused',
    }, {
      existsSync: () => true,
      spawnHelper: vi.fn(() => child as never),
    });

    const playback = engine.speak(request('agent-a', 'finish', 'Done.'), settled);
    expect(JSON.parse(written)).toStrictEqual({
      version: 1,
      id: 'agent-a:finish',
      text: 'Done.',
    });
    playback.cancel();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.stdout.write('completed');
    child.stderr.write('diagnostic');
    child.emit('close', 0);
    child.emit('close', 0);
    expect(settled).toHaveBeenCalledOnce();
  });

  it('reports platform/helper availability and settles helper errors once', () => {
    const linuxQueue = createRuntimeSpokenAnnouncementQueue({
      appPath: '/repo/electron',
      isPackaged: false,
      platform: 'linux',
      resourcesPath: '/unused',
    });
    expect(linuxQueue.queue(request('agent-a', 'start'))).toStrictEqual({
      queued: false,
      reason: 'unsupported',
    });

    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      killed: true,
      kill: vi.fn(),
    });
    const settled = vi.fn();
    const engine = new NativeSpokenAnnouncementEngine({
      appPath: '/repo/electron',
      isPackaged: false,
      platform: 'darwin',
      resourcesPath: '/unused',
    }, {
      existsSync: () => true,
      spawnHelper: () => child as never,
    });
    const playback = engine.speak(request('agent-a', 'start'), settled);
    playback.cancel();
    expect(child.kill).not.toHaveBeenCalled();
    child.emit('error', new Error('native crash'));
    child.emit('close', 1);
    expect(settled).toHaveBeenCalledOnce();

    const unavailable = new NativeSpokenAnnouncementEngine({
      appPath: '/repo/electron', isPackaged: false, platform: 'darwin', resourcesPath: '/unused',
    }, { existsSync: () => false });
    expect(() => unavailable.speak(request('agent-a', 'start'), vi.fn()))
      .toThrowError('The native TTS helper is unavailable.');
  });

  it('settles when the default helper spawn cannot launch', async () => {
    const engine = new NativeSpokenAnnouncementEngine({
      appPath: '/definitely-missing-codex-claw',
      isPackaged: false,
      platform: 'darwin',
      resourcesPath: '/unused',
    }, { existsSync: () => true });

    await new Promise<void>((resolve) => {
      engine.speak(request('agent-a', 'start'), resolve);
    });
  });
});
