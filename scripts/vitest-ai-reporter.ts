import { DotReporter } from 'vitest/node';

export default class AiReporter extends DotReporter {
  onTestCaseReady() {}

  onTestCaseResult() {}

  onTestRunEnd(...args: Parameters<DotReporter['onTestRunEnd']>) {
    super.onTestRunEnd(...args);
    console.log('[TESTS:DONE]');
  }
}
