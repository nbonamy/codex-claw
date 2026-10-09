export const pullStrategies = ['git-config', 'merge', 'rebase', 'ff-only'] as const;
export const updateStrategies = ['merge', 'rebase'] as const;
export const integrationStrategies = ['merge', 'squash', 'rebase-ff', 'ff-only'] as const;
export type GitPullStrategy = typeof pullStrategies[number];
export type GitUpdateStrategy = typeof updateStrategies[number];
export type GitIntegrationStrategy = typeof integrationStrategies[number];
export type GitWorkflowPreferences = {
  pull: GitPullStrategy;
  update: GitUpdateStrategy;
};
export type GitSettings = GitWorkflowPreferences;
export const defaultGitPreferences: GitWorkflowPreferences = { pull: 'git-config', update: 'merge' };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeGitSettings(value: unknown): GitSettings {
  const input = record(value);
  return {
    pull: pullStrategies.includes(input.pull as GitPullStrategy) ? input.pull as GitPullStrategy : defaultGitPreferences.pull,
    update: updateStrategies.includes(input.update as GitUpdateStrategy) ? input.update as GitUpdateStrategy : defaultGitPreferences.update,
  };
}
