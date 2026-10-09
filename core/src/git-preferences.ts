export const pullStrategies = ['git-config', 'merge', 'rebase', 'ff-only'] as const;
export const updateStrategies = ['merge', 'rebase'] as const;
export const integrationStrategies = ['merge', 'squash', 'rebase-ff', 'ff-only'] as const;
export type GitPullStrategy = typeof pullStrategies[number];
export type GitUpdateStrategy = typeof updateStrategies[number];
export type GitIntegrationStrategy = typeof integrationStrategies[number];
export type GitWorkflowPreferences = {
  pull: GitPullStrategy;
  update: GitUpdateStrategy;
  integration: GitIntegrationStrategy;
};
export type GitRepositoryPreferences = Partial<GitWorkflowPreferences> & { baseBranch?: string };
export type GitSettings = { defaults: GitWorkflowPreferences; repositories: Record<string, GitRepositoryPreferences> };
export const defaultGitPreferences: GitWorkflowPreferences = { pull: 'git-config', update: 'merge', integration: 'merge' };
export const legacyGitPreferences: GitWorkflowPreferences = { pull: 'merge', update: 'merge', integration: 'merge' };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeGitRepositoryPreferences(value: unknown): GitRepositoryPreferences {
  const input = record(value);
  return {
    ...(pullStrategies.includes(input.pull as GitPullStrategy) ? { pull: input.pull as GitPullStrategy } : {}),
    ...(updateStrategies.includes(input.update as GitUpdateStrategy) ? { update: input.update as GitUpdateStrategy } : {}),
    ...(integrationStrategies.includes(input.integration as GitIntegrationStrategy) ? { integration: input.integration as GitIntegrationStrategy } : {}),
    ...(typeof input.baseBranch === 'string' && input.baseBranch.trim() ? { baseBranch: input.baseBranch.trim() } : {}),
  };
}

export function normalizeGitSettings(value: unknown): GitSettings {
  const input = record(value);
  const { baseBranch: _base, ...defaults } = normalizeGitRepositoryPreferences(input.defaults);
  return {
    defaults: { ...defaultGitPreferences, ...defaults },
    repositories: Object.fromEntries(Object.entries(record(input.repositories)).map(([key, override]) => [key, normalizeGitRepositoryPreferences(override)])),
  };
}

export function resolveGitPreferences(settings: GitSettings, repositoryKey: string, choice: GitRepositoryPreferences = {}): GitRepositoryPreferences & GitWorkflowPreferences {
  return { ...settings.defaults, ...settings.repositories[repositoryKey], ...choice };
}
