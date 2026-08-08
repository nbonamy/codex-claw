import { describe, expect, it } from 'vitest';
import {
  assertCompatibleClawdHealth,
  clawdRuntimeFeaturesForHost,
  cloudClawdRuntimeFeatures,
  createClawdEnvironmentLaunchContract,
  electronClawdRuntimeFeatures,
  webClawdRuntimeFeatures,
} from '../clawd-launch';

describe('clawd environment launch contract', () => {
  it('describes an isolated authenticated Cloud runtime', () => {
    expect(createClawdEnvironmentLaunchContract({
      backendHome: ' /srv/claw/environments/env-1 ',
      command: ' node ',
      commandArgs: ['/app/clawd.mjs'],
      cwd: '/app',
      expectedVersion: ' 0.6.1 ',
      host: 'cloud',
    })).toStrictEqual({
      command: 'node',
      args: ['/app/clawd.mjs', '--stdio'],
      cwd: '/app',
      env: {
        CODEX_CLAW_HOME: '/srv/claw/environments/env-1',
        CODEX_CLAW_HOST: 'cloud',
      },
      paths: { codexHomeRelativeToBackendHome: 'codex-home' },
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
    expect(createClawdEnvironmentLaunchContract({
      backendHome: '/tmp/claw',
      command: 'clawd',
      expectedVersion: '0.6.1',
      host: 'web',
    })).not.toHaveProperty('cwd');
  });

  it.each([
    ['command', { command: ' ', backendHome: '/tmp/claw', expectedVersion: '0.6.1' }],
    ['backendHome', { command: 'clawd', backendHome: ' ', expectedVersion: '0.6.1' }],
    ['expectedVersion', { command: 'clawd', backendHome: '/tmp/claw', expectedVersion: ' ' }],
  ] as const)('rejects an empty %s', (name, values) => {
    expect(() => createClawdEnvironmentLaunchContract({ ...values, host: 'cloud' }))
      .toThrow(`clawd launch ${name} must be a non-empty string.`);
  });

  it('defines fail-closed runtime feature profiles', () => {
    expect(clawdRuntimeFeaturesForHost(undefined)).toBe(electronClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('electron')).toBe(electronClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('web')).toBe(webClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('cloud')).toBe(cloudClawdRuntimeFeatures);
    expect(clawdRuntimeFeaturesForHost('unexpected-host')).toBe(cloudClawdRuntimeFeatures);
    expect(cloudClawdRuntimeFeatures).toStrictEqual({ computerUse: false, embeddedBrowser: false });
  });

  it('requires exact clawd artifact compatibility', () => {
    const health = { ok: true as const, name: 'clawd' as const, version: '0.6.1', pid: 42 };
    expect(() => assertCompatibleClawdHealth(health, '0.6.1')).not.toThrow();
    expect(() => assertCompatibleClawdHealth(health, '0.7.0')).toThrow(
      'Incompatible clawd artifact: expected 0.7.0, received 0.6.1.',
    );
  });
});
