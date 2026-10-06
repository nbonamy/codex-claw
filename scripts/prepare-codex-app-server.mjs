import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareWindowsCodex } from './windows-codex.mjs';
import {
  hasExpectedExecutableArchitecture,
  resolveInstalledExecutable,
  selectCodexReleaseTarget,
} from './runtime-artifacts.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(rootDir, 'codex-app-server-release.json');
const outputDir = path.join(rootDir, 'electron', 'resources', 'codex');
const outputPath = path.join(outputDir, 'codex');
const codeModeHostOutputPath = path.join(outputDir, 'codex-code-mode-host');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const installerUrl = 'https://releases.openai.com/codex/install.sh';

const target = selectCodexReleaseTarget(config, process.platform, process.arch);
if (target.platform === 'win32') {
  const executable = await prepareWindowsCodex({ config, arch: target.arch, outputDir });
  console.log(`[prepare-codex-app-server] hosted Codex ${config.version} at ${path.relative(rootDir, executable)}`);
} else if (hasExpectedRelease(outputPath, codeModeHostOutputPath)) {
  console.log(
    `[prepare-codex-app-server] Codex ${config.version} is already hosted at ${path.relative(rootDir, outputPath)}`,
  );
} else {
  await installRelease();

  console.log(
    `[prepare-codex-app-server] hosted Codex ${config.version} at ${path.relative(rootDir, outputPath)}`,
  );
}

async function installRelease() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-app-server-'));
  const installerPath = path.join(tempDir, 'install.sh');
  const installBinDir = path.join(tempDir, 'bin');
  const installHomeDir = path.join(tempDir, 'home');
  const installerUserHome = path.join(tempDir, 'user-home');
  const temporaryOutputPath = path.join(outputDir, `.codex-${process.pid}.tmp`);
  const temporaryCodeModeHostOutputPath = path.join(
    outputDir,
    `.codex-code-mode-host-${process.pid}.tmp`,
  );

  try {
    run('curl', [
      '--fail',
      '--location',
      '--retry', '3',
      '--silent',
      '--show-error',
      '--output', installerPath,
      installerUrl,
    ]);
    fs.mkdirSync(installBinDir, { recursive: true });
    fs.mkdirSync(installerUserHome, { recursive: true });
    run('sh', [installerPath], {
      ...process.env,
      CODEX_HOME: installHomeDir,
      CODEX_INSTALL_DIR: installBinDir,
      CODEX_NON_INTERACTIVE: '1',
      CODEX_RELEASE: config.version,
      HOME: installerUserHome,
      PATH: [installBinDir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
      SHELL: '/bin/sh',
    });

    const installedPath = resolveInstalledExecutable('codex', installBinDir, installHomeDir);
    const installedCodeModeHostPath = resolveInstalledExecutable(
      'codex-code-mode-host',
      installBinDir,
      installHomeDir,
    );
    if (!hasExpectedRelease(installedPath, installedCodeModeHostPath)) {
      throw new Error(`OpenAI's installer did not provide Codex ${config.version}.`);
    }

    fs.mkdirSync(outputDir, { recursive: true });
    fs.copyFileSync(installedPath, temporaryOutputPath);
    fs.copyFileSync(installedCodeModeHostPath, temporaryCodeModeHostOutputPath);
    fs.chmodSync(temporaryOutputPath, 0o755);
    fs.chmodSync(temporaryCodeModeHostOutputPath, 0o755);
    if (!hasExpectedRelease(temporaryOutputPath, temporaryCodeModeHostOutputPath)) {
      throw new Error(`Copied Codex ${config.version} failed validation.`);
    }
    fs.renameSync(temporaryCodeModeHostOutputPath, codeModeHostOutputPath);
    fs.renameSync(temporaryOutputPath, outputPath);
  } finally {
    fs.rmSync(temporaryOutputPath, { force: true });
    fs.rmSync(temporaryCodeModeHostOutputPath, { force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function verifyDarwinSignature(filePath) {
  execFileSync('codesign', ['--verify', '--strict', '--verbose=2', filePath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function hasExpectedRelease(filePath, codeModeHostPath) {
  try {
    if (!fs.statSync(filePath).isFile() || !fs.statSync(codeModeHostPath).isFile()) {
      return false;
    }
    const version = execFileSync(filePath, ['--version'], { encoding: 'utf8' }).trim();
    if (version !== `codex-cli ${config.version}`) {
      return false;
    }
    for (const executablePath of [filePath, codeModeHostPath]) {
      if (!hasExpectedArchitecture(executablePath)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasExpectedArchitecture(executablePath) {
  return hasExpectedExecutableArchitecture(executablePath, target, { verifyDarwinSignature });
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'no status'}.`);
  }
}
