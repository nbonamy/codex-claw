export type AutomationSchedulerOptions = {
  intervalMs?: number;
  runAutomations: () => Promise<void>;
  onError?: (error: unknown) => void;
};

const DEFAULT_AUTOMATION_INTERVAL_MS = 1 * 60 * 1000;

export class AutomationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly options: AutomationSchedulerOptions) {}

  start(): void {
    this.stop();
    void this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, this.options.intervalMs ?? DEFAULT_AUTOMATION_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async check(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.options.runAutomations();
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.running = false;
    }
  }
}
