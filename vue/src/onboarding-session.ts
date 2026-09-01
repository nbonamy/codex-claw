export type FirstRunOnboardingStage = 'github' | 'complete';

const firstRunOnboardingStageKey = 'codexClaw:firstRunOnboardingStage';

export function getFirstRunOnboardingStage(): FirstRunOnboardingStage | null {
  const stage = globalThis.sessionStorage?.getItem(firstRunOnboardingStageKey);
  return stage === 'github' || stage === 'complete' ? stage : null;
}

export function setFirstRunOnboardingStage(stage: FirstRunOnboardingStage): void {
  globalThis.sessionStorage?.setItem(firstRunOnboardingStageKey, stage);
}

export function clearFirstRunOnboardingStage(): void {
  globalThis.sessionStorage?.removeItem(firstRunOnboardingStageKey);
}

export function isFirstRunOnboardingActive(): boolean {
  return getFirstRunOnboardingStage() !== null;
}
