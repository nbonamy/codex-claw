export type FirstRunOnboardingStage = 'providers' | 'github' | 'complete';

const firstRunOnboardingStageKey = 'app:firstRunOnboardingStage';

export function getFirstRunOnboardingStage(): FirstRunOnboardingStage | null {
  const stage = globalThis.sessionStorage?.getItem(firstRunOnboardingStageKey);
  return stage === 'providers' || stage === 'github' || stage === 'complete' ? stage : null;
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
