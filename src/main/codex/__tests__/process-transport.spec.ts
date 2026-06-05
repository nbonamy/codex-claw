import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexProcessTransport } from '../process-transport';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
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
  });

  it('inherits the user Codex home by default and writes JSONL requests', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new CodexProcessTransport({ env: { TEST_FLAG: '1' } });

    await transport.start();
    transport.send({ id: 1, method: 'initialize', params: {} });

    expect(spawnMock).toHaveBeenCalledWith('codex', ['app-server', '--listen', 'stdio://'], expect.objectContaining({
      env: expect.objectContaining({ TEST_FLAG: '1' }),
      stdio: 'pipe',
    }));
    expect(spawnMock.mock.calls[0][2].env.CODEX_HOME).toBe(process.env.CODEX_HOME);
    expect(child.stdin.write).toHaveBeenCalledWith('{"id":1,"method":"initialize","params":{}}\n');
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

  it('passes config overrides before the app-server subcommand', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new CodexProcessTransport({
      configOverrides: [
        'mcp_servers.codex_claw.url="http://127.0.0.1:1234/mcp"',
        'mcp_servers.codex_claw.default_tools_approval_mode="approve"',
      ],
    });

    await transport.start();

    expect(spawnMock.mock.calls[0][1]).toStrictEqual([
      '-c',
      'mcp_servers.codex_claw.url="http://127.0.0.1:1234/mcp"',
      '-c',
      'mcp_servers.codex_claw.default_tools_approval_mode="approve"',
      'app-server',
      '--listen',
      'stdio://',
    ]);
  });
});
