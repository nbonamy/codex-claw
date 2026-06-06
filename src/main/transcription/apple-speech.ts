import { spawn as nodeSpawn } from 'node:child_process';
import { promises as nodeFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type AppleSpeechTranscriptionOptions = {
  locale?: string;
  live?: boolean;
};

export type AppleSpeechTranscriptionResult = {
  text: string;
  error?: string;
};

type AppleSpeechFs = {
  mkdtemp(prefix: string): Promise<string>;
  readFile(filePath: string, encoding: BufferEncoding): Promise<string>;
  rm(filePath: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  writeFile(filePath: string, data: Buffer): Promise<void>;
};

type AppleSpeechChild = {
  stderr?: {
    on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  };
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number | null) => void): unknown;
};

type AppleSpeechSpawn = (command: string, args: string[]) => AppleSpeechChild;

type AppleSpeechTranscriptionDeps = {
  assetsPath?: string;
  fs?: AppleSpeechFs;
  spawn?: AppleSpeechSpawn;
  tmpdir?: () => string;
};

export async function transcribeWithAppleSpeechAnalyzer(
  audioData: Buffer,
  options: AppleSpeechTranscriptionOptions = {},
  deps: AppleSpeechTranscriptionDeps = {},
): Promise<AppleSpeechTranscriptionResult> {
  const fs = deps.fs ?? nodeFs;
  const spawn = deps.spawn ?? nodeSpawn;
  const tmpdir = deps.tmpdir ?? os.tmpdir;
  const cliPath = path.join(deps.assetsPath ?? defaultAssetsPath(), 'apple-speechanalyzer-cli');
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'codex-claw-apple-stt-'));
  const inputPath = path.join(tempDir, 'input.wav');
  const outputPath = path.join(tempDir, 'output.txt');

  try {
    await fs.writeFile(inputPath, audioData);
    await runAppleSpeechCli(spawn, cliPath, buildAppleSpeechArgs(inputPath, outputPath, options));
    const text = await fs.readFile(outputPath, 'utf8');

    return { text: text.trim() };
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function buildAppleSpeechArgs(
  inputPath: string,
  outputPath: string,
  options: AppleSpeechTranscriptionOptions,
): string[] {
  const args = [
    '--input-audio-path',
    inputPath,
    '--output-txt-path',
    outputPath,
  ];

  const locale = options.locale?.trim();
  if (locale) {
    args.push('--locale', locale);
  }

  if (options.live) {
    args.push('--live');
  }

  return args;
}

function runAppleSpeechCli(
  spawn: AppleSpeechSpawn,
  cliPath: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args);
    let stderr = '';

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error: Error) => {
      reject(new Error(`Failed to spawn Apple speech CLI: ${error.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Apple speech CLI exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function defaultAssetsPath(): string {
  if (process.resourcesPath && !process.resourcesPath.endsWith('.vite/build')) {
    return process.resourcesPath;
  }

  return path.resolve(process.cwd(), 'assets');
}
