import type {
  SpokenAnnouncementQueueResult,
  SpokenAnnouncementRequest,
} from '@codex-claw/core/contracts';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { warnMain } from './log';

export type SpokenAnnouncementPlayback = {
  cancel: () => void;
};

export type SpokenAnnouncementEngine = {
  readonly available: boolean;
  speak: (
    request: SpokenAnnouncementRequest,
    settled: () => void,
  ) => SpokenAnnouncementPlayback;
};

type QueueOptions = {
  now?: () => number;
  rateLimitMs?: number;
};

type QueueItem = SpokenAnnouncementRequest & { id: number };

export class SpokenAnnouncementQueue {
  private active: (QueueItem & { playback: SpokenAnnouncementPlayback | null }) | null = null;
  private pending: QueueItem | null = null;
  private readonly recent = new Map<string, number>();
  private nextId = 1;
  private readonly now: () => number;
  private readonly rateLimitMs: number;

  constructor(
    private readonly engine: SpokenAnnouncementEngine,
    options: QueueOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.rateLimitMs = options.rateLimitMs ?? 2_000;
  }

  queue(request: SpokenAnnouncementRequest): SpokenAnnouncementQueueResult {
    if (!this.engine.available) return { queued: false, reason: 'unsupported' };

    const key = `${request.agentId}:${request.phase}`;
    const now = this.now();
    const lastQueuedAt = this.recent.get(key);
    if (lastQueuedAt !== undefined && now - lastQueuedAt < this.rateLimitMs) {
      return { queued: false, reason: 'rateLimited' };
    }

    const item = { ...request, id: this.nextId++ };
    if (!this.active) {
      this.markRecent(key, now);
      this.start(item);
      return { queued: true };
    }

    if (this.pending?.phase === 'finish' && item.phase === 'start') {
      return { queued: false, reason: 'superseded' };
    }

    this.pending = item;
    this.markRecent(key, now);
    if (this.active.agentId === item.agentId
      && this.active.phase === 'start'
      && item.phase === 'finish') {
      this.active.playback?.cancel();
    }
    return { queued: true };
  }

  dispose(): void {
    this.pending = null;
    this.active?.playback?.cancel();
    this.active = null;
  }

  private start(item: QueueItem): void {
    this.active = { ...item, playback: null };
    try {
      const playback = this.engine.speak(item, () => this.settle(item.id));
      if (this.active?.id === item.id) this.active.playback = playback;
    } catch {
      this.settle(item.id);
    }
  }

  private settle(id: number): void {
    if (this.active?.id !== id) return;
    this.active = null;
    const next = this.pending;
    this.pending = null;
    if (next) this.start(next);
  }

  private markRecent(key: string, now: number): void {
    this.recent.set(key, now);
    for (const [candidate, timestamp] of this.recent) {
      if (now - timestamp >= this.rateLimitMs) this.recent.delete(candidate);
    }
    while (this.recent.size > 64) {
      const oldest = this.recent.keys().next().value as string | undefined;
      this.recent.delete(oldest as string);
    }
  }
}

export type NativeSpokenAnnouncementOptions = {
  appPath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
};

type SpawnHelper = (path: string) => ChildProcessWithoutNullStreams;
type NativeEngineDeps = {
  existsSync?: (path: string) => boolean;
  spawnHelper?: SpawnHelper;
};

const drainHelperOutput = () => undefined;

export class NativeSpokenAnnouncementEngine implements SpokenAnnouncementEngine {
  readonly available: boolean;
  private readonly helperPath: string;

  constructor(
    options: NativeSpokenAnnouncementOptions,
    deps: NativeEngineDeps = {},
  ) {
    this.helperPath = resolveSpokenAnnouncementHelperPath(options);
    this.spawnHelper = deps.spawnHelper ?? ((helperPath) => spawn(helperPath, [], { stdio: 'pipe' }));
    this.available = options.platform === 'darwin' && (deps.existsSync ?? fs.existsSync)(this.helperPath);
  }

  private readonly spawnHelper: SpawnHelper;

  speak(request: SpokenAnnouncementRequest, settled: () => void): SpokenAnnouncementPlayback {
    if (!this.available) throw new Error('The native TTS helper is unavailable.');
    const child = this.spawnHelper(this.helperPath);
    let didSettle = false;
    const finish = () => {
      if (didSettle) return;
      didSettle = true;
      settled();
    };
    child.once('error', (error) => {
      warnMain('tts', 'native helper failed', { detail: error.message });
      finish();
    });
    child.once('close', finish);
    child.stdout.on('data', drainHelperOutput);
    child.stderr.on('data', drainHelperOutput);
    child.stdin.end(JSON.stringify({
      version: 1,
      id: `${request.agentId}:${request.phase}`,
      text: request.text,
      voice: request.voice,
    }));
    return {
      cancel: () => {
        if (!child.killed) child.kill('SIGTERM');
      },
    };
  }
}

export function resolveSpokenAnnouncementHelperPath(options: NativeSpokenAnnouncementOptions): string {
  if (options.isPackaged) {
    return path.join(options.resourcesPath, 'codex-claw-tts-helper');
  }
  return path.join(options.appPath, '.tts', 'codex-claw-tts-helper');
}

export function createRuntimeSpokenAnnouncementQueue(options: NativeSpokenAnnouncementOptions): SpokenAnnouncementQueue {
  return new SpokenAnnouncementQueue(new NativeSpokenAnnouncementEngine(options));
}
