import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexProcessTransport } from '../process-transport';

const spawnMock = vi.hoisted(() => vi.fn());
const execFileSyncMock = vi.hoisted(() => vi.fn(() => {
  throw new Error('shell unavailable');
}));
const logMainMock = vi.hoisted(() => vi.fn());
const warnMainMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  spawn: spawnMock,
  default: {
    execFileSync: execFileSyncMock,
    spawn: spawnMock,
  },
}));

vi.mock('../../log', () => ({
  logMain: logMainMock,
  warnMain: warnMainMock,
}));

type FakeChild = EventEmitter & {
  stdin: { write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
};

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = { write: vi.fn() };
  child.stdout = new EventEmitter() as FakeChild['stdout'];
  child.stdout.setEncoding = vi.fn();
  child.stderr = new EventEmitter() as FakeChild['stderr'];
  child.stderr.setEncoding = vi.fn();
  child.kill = vi.fn();
  return child;
}

describe('CodexProcessTransport', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    execFileSyncMock.mockReset();
    logMainMock.mockReset();
    warnMainMock.mockReset();
    execFileSyncMock.mockImplementation(() => {
      throw new Error('shell unavailable');
    });
  });

  it('inherits the user Codex home by default and writes JSONL requests', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new CodexProcessTransport({
      env: {
        PATH: '/usr/bin',
        TEST_FLAG: '1',
      },
      runtimeDiscovery: {
        execFileSync: vi.fn(() => {
          throw new Error('shell unavailable');
        }),
        existsSync: vi.fn(() => false),
        pathDelimiter: ':',
        platform: 'darwin',
      },
    });

    await transport.start();
    transport.send({ id: 1, method: 'initialize', params: {} });

    expect(spawnMock).toHaveBeenCalledWith('codex', ['app-server', '--listen', 'stdio://'], expect.objectContaining({
      env: expect.objectContaining({
        PATH: '/usr/bin',
        TEST_FLAG: '1',
      }),
      stdio: 'pipe',
    }));
    expect(spawnMock.mock.calls[0][2].env.CODEX_HOME).toBe(process.env.CODEX_HOME);
    expect(child.stdin.write).toHaveBeenCalledWith('{"id":1,"method":"initialize","params":{}}\n');
    expect(logMainMock).toHaveBeenCalledWith('codex-process', 'starting app-server', {
      command: 'codex',
      args: ['app-server', '--listen', 'stdio://'],
    });
  });

  it('sets CODEX_HOME only when Codex Claw requests an override', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new CodexProcessTransport({ codexHome: '/tmp/codex-claw-home' });

    await transport.start();

    expect(spawnMock.mock.calls[0][2].env).toMatchObject({
      CODEX_HOME: '/tmp/codex-claw-home',
    });
  });

  it('uses a configured Codex executable when provided', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new CodexProcessTransport({ command: ' /opt/homebrew/bin/codex ' });

    await transport.start();

    expect(spawnMock.mock.calls[0][0]).toBe('/opt/homebrew/bin/codex');
  });

  it('delegates GUI executable discovery to the SDK transport', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new CodexProcessTransport({
      env: { PATH: '/usr/bin' },
      runtimeDiscovery: {
        execFileSync: vi.fn(() => {
          throw new Error('shell unavailable');
        }),
        existsSync: vi.fn((filePath: string) => [
          '/opt/homebrew/bin',
          '/opt/homebrew/bin/codex',
        ].includes(filePath)),
        homedir: () => '/Users/tester',
        pathDelimiter: ':',
        platform: 'darwin',
      },
    });

    await transport.start();

    expect(spawnMock.mock.calls[0][0]).toBe('/opt/homebrew/bin/codex');
  });

  it('passes config overrides before the app-server subcommand', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new CodexProcessTransport({
      configOverrides: [
        'features.apply_patch_streaming_events=true',
      ],
    });

    await transport.start();

    expect(spawnMock.mock.calls[0][1]).toStrictEqual([
      '-c',
      'features.apply_patch_streaming_events=true',
      'app-server',
      '--listen',
      'stdio://',
    ]);
  });
});
