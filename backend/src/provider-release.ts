import type { AgentBackend } from '@workspace/core/contracts';
import { backendDisplayName } from '@workspace/core/backend-driver';
import { releaseFeatures, type ReleaseFeature } from '@workspace/core/features';

const providerFeatures: Partial<Record<AgentBackend, ReleaseFeature>> = {
  antigravity: 'antigravity',
};

export function isProviderReleased(backend: AgentBackend): boolean {
  const feature = providerFeatures[backend];
  return feature === undefined || releaseFeatures[feature];
}

export function requireReleasedProvider(backend: AgentBackend): void {
  if (!isProviderReleased(backend)) throw new Error(`${backendDisplayName(backend)} is not available in this build.`);
}
