import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const helperAppName = 'Codex Claw Computer Use.app';
const helperExecutableName = 'computer-use-pilot';
const timeoutMs = 30_000;
const defaultIdleTtlMs = 10_000;

export const computerUseCommands = [
  'status',
  'request_accessibility',
  'list_apps',
  'find_apps',
  'launch_app',
  'focus_app',
  'get_app_state',
  'click',
  'type_text',
  'set_value',
  'scroll',
] as const;

export type ComputerUseCommand = (typeof computerUseCommands)[number];

export type ComputerUseStatus = {
  accessibilityTrusted: boolean;
  available: boolean;
  error?: string;
  helperAppPath?: string;
  helperPath?: string;
  platform: NodeJS.Platform;
};

type ComputerUseErrorCode = 'client_error' | 'permission_denied' | 'timeout' | 'tool_unavailable';

export type ComputerUseResult =
  | { ok: true; result: unknown }
  | { error: string; errorCode: ComputerUseErrorCode; ok: false };

type AppStateContext = {
  appIdentities: Set<string>;
  pilotPath: string;
  traversalArguments: Record<string, unknown>;
};

export type ComputerUseOptions = {
  appPath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
  pilotPath?: string;
  /** Testable override; production keeps the visual session alive for ten seconds after its last action. */
  idleTtlMs?: number;
};

let livePilot: PersistentPilot | null = null;
let lastAppStateContext: AppStateContext | null = null;

export async function getComputerUseStatus(options: ComputerUseOptions): Promise<ComputerUseStatus> {
  if (options.platform !== 'darwin') {
    return unavailableStatus(options, 'Computer Use is currently available only on macOS.');
  }

  const helperPath = resolveComputerUsePilotPath(options);
  if (!helperPath) {
    return unavailableStatus(options, 'Computer Use helper is not built. Run npm run build:computer-use.', resolveComputerUseHelperAppPath(options));
  }

  const response = await executeComputerUseCommand({ command: 'status', arguments: {}, options });
  if (!response.ok) {
    return unavailableStatus(options, response.error, helperAppPathFromPilotPath(helperPath), helperPath);
  }

  const result = record(response.result);
  return {
    accessibilityTrusted: result?.accessibilityTrusted === true,
    available: true,
    helperAppPath: helperAppPathFromPilotPath(helperPath),
    helperPath,
    platform: options.platform,
  };
}

export async function requestComputerUseAccessibility(options: ComputerUseOptions): Promise<ComputerUseStatus> {
  await executeComputerUseCommand({
    command: 'request_accessibility',
    arguments: { openSettings: true, prompt: true },
    options,
  });
  return getComputerUseStatus(options);
}

export async function executeComputerUseCommand(input: {
  command: ComputerUseCommand;
  arguments: Record<string, unknown>;
  options: ComputerUseOptions;
}): Promise<ComputerUseResult> {
  if (input.options.platform !== 'darwin') {
    return failure('tool_unavailable', 'Computer Use is currently available only on macOS.');
  }

  const pilotPath = resolveComputerUsePilotPath(input.options);
  if (!pilotPath) {
    return failure('tool_unavailable', 'Computer Use helper is not built. Run npm run build:computer-use.');
  }

  if (input.command === 'get_app_state') lastAppStateContext = null;
  const arguments_ = argumentsWithAppStateContext(input.command, input.arguments, pilotPath);
  const response = await runPilotRequest(pilotPath, {
    arguments: arguments_,
    command: input.command,
    id: crypto.randomUUID(),
  }, input.options.idleTtlMs ?? defaultIdleTtlMs);
  if (response.ok && input.command === 'get_app_state') {
    lastAppStateContext = appStateContext(pilotPath, input.arguments, response.result);
  }
  return response;
}

/** Ends the shared helper during Electron shutdown (and in desktop tests). */
export function stopComputerUseHelper(): void {
  livePilot?.stop();
  livePilot = null;
  lastAppStateContext = null;
}

export function isComputerUseCommand(value: unknown): value is ComputerUseCommand {
  return typeof value === 'string' && (computerUseCommands as readonly string[]).includes(value);
}

export function resolveComputerUsePilotPath(options: ComputerUseOptions): string | null {
  const candidates = [
    options.pilotPath,
    process.env.CODEX_CLAW_COMPUTER_USE_PILOT_PATH,
    options.isPackaged
      ? path.join(options.resourcesPath, helperAppName, 'Contents', 'MacOS', helperExecutableName)
      : undefined,
    path.resolve(options.appPath, '.computer-use', helperAppName, 'Contents', 'MacOS', helperExecutableName),
    path.resolve(process.cwd(), '.computer-use', helperAppName, 'Contents', 'MacOS', helperExecutableName),
    path.resolve(process.cwd(), 'electron', '.computer-use', helperAppName, 'Contents', 'MacOS', helperExecutableName),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find(isExecutable) ?? null;
}

export function resolveComputerUseHelperAppPath(options: ComputerUseOptions): string {
  return options.isPackaged
    ? path.join(options.resourcesPath, helperAppName)
    : path.resolve(options.appPath, '.computer-use', helperAppName);
}

function unavailableStatus(options: ComputerUseOptions, error: string, helperAppPath?: string, helperPath?: string): ComputerUseStatus {
  return {
    accessibilityTrusted: false,
    available: false,
    error,
    ...(helperAppPath ? { helperAppPath } : {}),
    ...(helperPath ? { helperPath } : {}),
    platform: options.platform,
  };
}

function runPilotRequest(pilotPath: string, request: Record<string, unknown>, idleTtlMs: number): Promise<ComputerUseResult> {
  if (!livePilot || livePilot.pilotPath !== pilotPath || livePilot.stopped) {
    livePilot?.stop();
    livePilot = new PersistentPilot(pilotPath, idleTtlMs, () => {
      livePilot = null;
    });
  }
  return livePilot.request(request);
}

function argumentsWithAppStateContext(
  command: ComputerUseCommand,
  arguments_: Record<string, unknown>,
  pilotPath: string,
): Record<string, unknown> {
  if (!['click', 'scroll', 'set_value'].includes(command) || !Number.isInteger(arguments_.element_index)) {
    return arguments_;
  }

  const context = lastAppStateContext;
  if (!context || context.pilotPath !== pilotPath || !targetsSameApp(context.appIdentities, arguments_)) {
    return arguments_;
  }

  return { ...context.traversalArguments, ...arguments_ };
}

function appStateContext(
  pilotPath: string,
  arguments_: Record<string, unknown>,
  result: unknown,
): AppStateContext {
  const traversalArguments = Object.fromEntries(
    ['maxDepth', 'maxNodes', 'rootElementIndex']
      .filter((key) => Object.hasOwn(arguments_, key))
      .map((key) => [key, arguments_[key]]),
  );
  const appIdentities = appIdentityValues(arguments_);
  const resultApp = record(record(result)?.app);
  if (resultApp) {
    for (const identity of appIdentityValues({
      app: resultApp.localizedName,
      bundleIdentifier: resultApp.bundleIdentifier,
      pid: resultApp.pid,
    })) {
      appIdentities.add(identity);
    }
  }
  return { appIdentities, pilotPath, traversalArguments };
}

function targetsSameApp(snapshotIdentities: Set<string>, arguments_: Record<string, unknown>): boolean {
  const actionIdentities = appIdentityValues(arguments_);
  if (actionIdentities.size === 0) return true;
  return [...actionIdentities].some((identity) => snapshotIdentities.has(identity));
}

function appIdentityValues(arguments_: Record<string, unknown>): Set<string> {
  const identities = new Set<string>();
  for (const key of ['app', 'bundleIdentifier', 'path', 'pid']) {
    const value = arguments_[key];
    if (typeof value === 'string' && value.length > 0) identities.add(`${key}:${value}`);
    if (key === 'pid' && typeof value === 'number' && Number.isInteger(value)) identities.add(`${key}:${value}`);
  }
  return identities;
}

class PersistentPilot {
  readonly pilotPath: string;
  stopped = false;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly idleTtlMs: number;
  private readonly onStopped: () => void;
  private readonly pending = new Map<string, { finish: (result: ComputerUseResult) => void; timeout: NodeJS.Timeout }>();
  private finished = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private stderr = '';
  private stdout = '';

  constructor(pilotPath: string, idleTtlMs: number, onStopped: () => void) {
    this.pilotPath = pilotPath;
    this.idleTtlMs = Math.max(1, idleTtlMs);
    this.onStopped = onStopped;
    this.child = spawn(pilotPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    this.child.on('error', (error) => this.finishAll(failure('client_error', error.message)));
    this.child.on('close', (code) => this.finishAll(failure('client_error', this.stderr.trim() || `Computer Use helper exited with code ${code ?? 'unknown'}.`)));
  }

  request(request: Record<string, unknown>): Promise<ComputerUseResult> {
    const id = typeof request.id === 'string' ? request.id : null;
    if (!id || this.stopped) return Promise.resolve(failure('client_error', 'Computer Use helper is not running.'));
    this.clearIdleTimer();
    return new Promise((resolve) => {
      const finish = (result: ComputerUseResult) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(id);
        this.scheduleIdleStop();
        resolve(result);
      };
      const timeout = setTimeout(() => finish(failure('timeout', 'Computer Use helper timed out.')), timeoutMs);
      this.pending.set(id, { finish, timeout });
      this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error) finish(failure('client_error', error.message));
      });
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearIdleTimer();
    this.child.stdin.end();
    this.child.kill();
    this.finishAll(failure('client_error', 'Computer Use helper stopped.'));
  }

  private handleStdout(chunk: string): void {
    this.stdout += chunk;
    let newline = this.stdout.indexOf('\n');
    while (newline >= 0) {
      const line = this.stdout.slice(0, newline);
      this.stdout = this.stdout.slice(newline + 1);
      const response = parseResponse(line);
      const id = responseId(line);
      if (id) this.pending.get(id)?.finish(response);
      newline = this.stdout.indexOf('\n');
    }
  }

  private scheduleIdleStop(): void {
    if (this.pending.size > 0 || this.stopped) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.stop(), this.idleTtlMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private finishAll(result: ComputerUseResult): void {
    if (this.finished) return;
    this.finished = true;
    this.stopped = true;
    this.clearIdleTimer();
    for (const { finish } of this.pending.values()) finish(result);
    this.onStopped();
  }
}

function responseId(line: string): string | null {
  try {
    const id = (JSON.parse(line) as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

function parseResponse(line: string): ComputerUseResult {
  try {
    const response = JSON.parse(line) as { error?: { code?: string; message?: string }; ok?: boolean; result?: unknown };
    if (response.ok) return { ok: true, result: response.result };
    return failure(normalizeErrorCode(response.error?.code), response.error?.message ?? 'Computer Use helper returned an error.');
  } catch (error) {
    return failure('client_error', error instanceof Error ? `Unable to parse Computer Use response: ${error.message}` : 'Unable to parse Computer Use response.');
  }
}

function normalizeErrorCode(code: string | undefined): ComputerUseErrorCode {
  if (code === 'accessibility_not_granted' || code === 'permission_denied') return 'permission_denied';
  if (code === 'timeout') return 'timeout';
  if (code === 'tool_unavailable') return 'tool_unavailable';
  return 'client_error';
}

function failure(errorCode: ComputerUseErrorCode, error: string): ComputerUseResult {
  return { error, errorCode, ok: false };
}

function isExecutable(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function helperAppPathFromPilotPath(pilotPath: string): string {
  return path.dirname(path.dirname(path.dirname(pilotPath)));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
