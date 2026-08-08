import { describe, expect, it } from 'vitest';
import {
  assertCompatibleClawdHealth,
  clawdRuntimeFeaturesForHost,
  createClawdEnvironmentLaunchContract,
  electronClawdRuntimeFeatures,
  restrictedClawdRuntimeFeatures,
  webClawdRuntimeFeatures,
} from '../clawd-launch';

describe('clawd environment launch contract', () => {
  it('describes an isolated authenticated managed runtime', () => {
    expect(createClawdEnvironmentLaunchContract({
      backendHome: ' /srv/claw/environments/env-1 ',
      codexHome: ' /srv/claw/users/user-1/.codex ',
      command: ' node ',
      commandArgs: ['/app/clawd.mjs'],
      cwd: '/app',
      expectedVersion: ' 0.6.1 ',
      host: 'managed',
    })).toStrictEqual({
      command: 'node',
      args: ['/app/clawd.mjs', '--stdio'],
      cwd: '/app',
      env: {
        CODEX_CLAW_HOME: '/srv/claw/environments/env-1',
        CODEX_CLAW_HOST: 'managed',
        CODEX_CLAW_CODEX_HOME: '/srv/claw/users/user-1/.codex',
      },
      codexHome: { kind: 'explicit', path: '/srv/claw/users/user-1/.codex' },
      artifact: {
        expectedVersion: '0.6.1',
        versionArgs: ['/app/clawd.mjs', '--version'],
      },
      readiness: {
        method: 'backend/health/get',
        expectedName: 'clawd',
        expectedVersion: '0.6.1',
      },
      shutdown: {
        closeStdin: true,
        signal: 'SIGTERM',
        timeoutMs: 5_000,
      },
    });
  });

  it('omits cwd when the host does not supply one', () => {
    const launch = createClawdEnvironmentLaunchContract({
      backendHome: '/tmp/claw',
      command: 'clawd',
      expectedVersion: '0.6.1',
      host: 'web',
    });
    expect(launch).not.toHaveProperty('cwd');
    expect(launch.codexHome).toStrictEqual({
      kind: 'backend-home-relative',
      relativePath: 'codex-home',
    });
    expect(launch.env).not.toHaveProperty('CODEX_CLAW_CODEX_HOME');
  });

  it.each([
    ['command', { command: ' ', backendHome: '/tmp/claw', expectedVersion: '0.6.1' }],
    ['backendHome', { command: 'clawd', backendHome: ' ', expectedVersion: '0.6.1' }],
    ['expectedVersion', { command: 'clawd', backendHome: '/tmp/claw', expectedVersion: ' ' }],
  ] as const)('rejects an empty %s', (name, values) => {
    expect(() => createClawdEnvironmentLaunchContract({ ...values, host: 'managed' }))
      .toThrow(`clawd launch ${name} must be a non-empty string.`);
  });

  it.each(['C:\\claw\\state', '\\\\server\\claw\\state'])(
    'accepts a cross-platform absolute backend home: %s',
    (backendHome) => {
      expect(createClawdEnvironmentLaunchContract({
        backendHome,
        command: 'clawd',
        expectedVersion: '0.6.1',
        host: 'managed',
      }).env.CODEX_CLAW_HOME).toBe(backendHome);
    },
  );

  it('rejects an empty explicit Codex home', () => {
    expect(() => createClawdEnvironmentLaunchContract({
      backendHome: '/tmp/claw',
      codexHome: ' ',
      command: 'clawd',
      expectedVersion: '0.6.1',
      host: 'managed',
    })).toThrow('clawd launch codexHome must be a non-empty string.');
  });

  it.each([
    ['backendHome', { backendHome: 'relative/state' }],
    ['codexHome', { codexHome: 'relative/.codex' }],
  ] as const)('rejects a relative %s', (name, override) => {
    expect(() => createClawdEnvironmentLaunchContract({
      backendHome: '/tmp/claw',
      command: 'clawd',
      expectedVersion: '0.6.1',
      host: 'managed',
      ...override,
    })).toThrow(`clawd launch ${name} must be an absolute path.`);
  });

  it('defines fail-closed runtime feature profiles', () => {
    expect(clawdRuntimeFeaturesForHost(undefined)).toBe(electronClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('electron')).toBe(electronClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('web')).toBe(webClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('managed')).toBe(restrictedClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('unexpected-host')).toBe(restrictedClawdRuntimeFeatures);
    expect(restrictedClawdRuntimeFeatures).toStrictEqual({
      codexResourceSharing: false,
      computerUse: false,
      embeddedBrowser: false,
    });
  });

  it('requires exact clawd artifact compatibility', () => {
    const health = { ok: true as const, name: 'clawd' as const, version: '0.6.1', pid: 42 };
    expect(() => assertCompatibleClawdHealth(health, '0.6.1')).not.toThrow();
    expect(() => assertCompatibleClawdHealth(health, '0.7.0')).toThrow(
      'Incompatible clawd artifact: expected 0.7.0, received 0.6.1.',
    );
  });
});
