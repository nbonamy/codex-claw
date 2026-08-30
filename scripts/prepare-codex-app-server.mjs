import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(rootDir, 'codex-app-server-release.json');
const outputDir = path.join(rootDir, 'electron', 'resources', 'codex');
const outputPath = path.join(outputDir, 'codex');
const codeModeHostOutputPath = path.join(outputDir, 'codex-code-mode-host');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const installerUrl = 'https://releases.openai.com/codex/install.sh';

validateConfig(config);

if (process.platform !== config.platform || process.arch !== config.arch) {
  throw new Error(
    `Bundled Codex ${config.version} targets ${config.platform}/${config.arch}; `
      + `this build is ${process.platform}/${process.arch}.`,
  );
}

if (hasExpectedRelease(outputPath, codeModeHostOutputPath)) {
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-claw-app-server-'));
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

    const installedPath = fs.realpathSync(path.join(installBinDir, 'codex'));
    const installedCodeModeHostPath = fs.realpathSync(
      path.join(installBinDir, 'codex-code-mode-host'),
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

function validateConfig(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid bundled Codex release configuration.');
  }
  if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(value.version)) {
    throw new Error('Bundled Codex version must be a semantic version.');
  }
  if (value.platform !== 'darwin' || value.arch !== 'arm64') {
    throw new Error('Bundled Codex release must currently target darwin/arm64.');
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
      const architectures = execFileSync('lipo', ['-archs', executablePath], { encoding: 'utf8' })
        .trim()
        .split(/\s+/);
      if (!architectures.includes(config.arch)) {
        return false;
      }
      verifyDarwinSignature(executablePath);
    }
    return true;
  } catch {
    return false;
  }
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
