import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeCliTransport } from '../cli-transport';

const spawnMock = vi.hoisted(() => vi.fn());
const execFileSyncMock = vi.hoisted(() => vi.fn(() => {
  throw new Error('shell unavailable');
}));

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  spawn: spawnMock,
  default: {
    execFileSync: execFileSyncMock,
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

describe('ClaudeCliTransport', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    execFileSyncMock.mockReset();
    execFileSyncMock.mockImplementation(() => {
      throw new Error('shell unavailable');
    });
    vi.unstubAllEnvs();
  });

  it('spawns Claude print mode with stream-json and parses JSONL output', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new ClaudeCliTransport({ env: { TEST_FLAG: '1' } });
    const messages: unknown[] = [];

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello',
      sessionId: 'claude-session-1',
      model: 'claude-sonnet-4-5',
      permissionMode: 'acceptEdits',
    }, (message) => messages.push(message));
    child.stdout.emit('data', '{"type":"system","subtype":"init","session_id":"claude-session-1"}\n');
    child.emit('exit', 0, null);
    await handle.done;

    expect(spawnMock).toHaveBeenCalledWith('claude', [
      '-p',
      'hello',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--resume',
      'claude-session-1',
      '--model',
      'claude-sonnet-4-5',
      '--permission-mode',
      'acceptEdits',
    ], expect.objectContaining({
      cwd: '/Users/nbonamy/src/codex-claw',
      env: expect.objectContaining({ TEST_FLAG: '1' }),
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    expect(messages).toStrictEqual([{ type: 'system', subtype: 'init', session_id: 'claude-session-1' }]);
  });

  it('passes prompt, appended system prompt, MCP config, and allowed tools as single argv entries', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new ClaudeCliTransport();
    const prompt = 'hello "quoted" $PATH\nand `ticks`';
    const appendSystemPrompt = 'Use Claw tools. Agent says: "hi" and $HOME stays literal.';

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt,
      appendSystemPrompt,
      mcpServerUrl: 'http://127.0.0.1:1234/mcp?agentId=agent-claude',
      allowedTools: ['mcp__codex_claw__*'],
    }, vi.fn());
    child.emit('exit', 0, null);
    await handle.done;

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[args.indexOf('-p') + 1]).toBe(prompt);
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe(appendSystemPrompt);
    expect(args[args.indexOf('--allowed-tools') + 1]).toBe('mcp__codex_claw__*');
    expect(JSON.parse(args[args.indexOf('--mcp-config') + 1])).toStrictEqual({
      mcpServers: {
        codex_claw: {
          type: 'http',
          url: 'http://127.0.0.1:1234/mcp?agentId=agent-claude',
        },
      },
    });
  });

  it('prepends common user binary folders so Electron can find Claude outside shell PATH', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new ClaudeCliTransport({
      env: { PATH: '/usr/bin' },
      runtimeDiscovery: {
        execFileSync: vi.fn(() => '/opt/homebrew/bin:/usr/bin'),
        existsSync: vi.fn((filePath: string) => [
          '/Users/nicolas/.local/bin',
          '/Users/nicolas/bin',
          '/opt/homebrew/bin',
          '/usr/local/bin',
        ].includes(filePath)),
        homedir: () => '/Users/nicolas',
        pathDelimiter: ':',
        platform: 'darwin',
      },
    });

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello',
    }, vi.fn());
    child.emit('exit', 0, null);
    await handle.done;

    expect(spawnMock.mock.calls[0][2].env.PATH.split(':')).toStrictEqual([
      '/usr/bin',
      '/opt/homebrew/bin',
      '/Users/nicolas/.local/bin',
      '/Users/nicolas/bin',
      '/usr/local/bin',
    ]);
  });

  it('does not leak Node inspector options into the Claude child process', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    vi.stubEnv('NODE_OPTIONS', '--inspect=0');
    const transport = new ClaudeCliTransport();

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello',
    }, vi.fn());
    child.emit('exit', 0, null);
    await handle.done;

    expect(spawnMock.mock.calls[0][2].env.NODE_OPTIONS).toBeUndefined();
  });

  it('allows the Claude command to be overridden with an environment variable', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    vi.stubEnv('CODEX_CLAW_CLAUDE_COMMAND', '/custom/bin/claude');
    const transport = new ClaudeCliTransport();

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello',
    }, vi.fn());
    child.emit('exit', 0, null);
    await handle.done;

    expect(spawnMock.mock.calls[0][0]).toBe('/custom/bin/claude');
  });

  it('rejects when Claude exits with an error and includes stderr', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new ClaudeCliTransport();

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello',
    }, vi.fn());
    child.stderr.emit('data', 'not authenticated');
    child.emit('exit', 1, null);

    await expect(handle.done).rejects.toThrow('Claude exited (1): not authenticated');
  });

  it('uses stdout as the exit detail when Claude fails without stderr', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new ClaudeCliTransport();

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello',
    }, vi.fn());
    child.stdout.emit('data', 'plain stdout failure\n');
    child.emit('exit', 1, null);

    await expect(handle.done).rejects.toThrow('Claude exited (1): plain stdout failure');
  });

  it('parses a final JSON object even when stdout has no trailing newline', async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);
    const transport = new ClaudeCliTransport();
    const messages: unknown[] = [];

    const handle = transport.startTurn({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello',
    }, (message) => messages.push(message));
    child.stdout.emit('data', '{"type":"result","subtype":"success","session_id":"claude-session-1"}');
    child.emit('exit', 0, null);
    await handle.done;

    expect(messages).toStrictEqual([{ type: 'result', subtype: 'success', session_id: 'claude-session-1' }]);
  });
});
