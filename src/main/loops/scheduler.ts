import { warnMain } from '../log';

export type LoopSchedulerOptions = {
  intervalMs?: number;
  runLoops: () => Promise<void>;
};

const DEFAULT_LOOP_INTERVAL_MS = 2 * 60 * 1000;

export class LoopScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly options: LoopSchedulerOptions) {}

  start(): void {
    this.stop();
    void this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, this.options.intervalMs ?? DEFAULT_LOOP_INTERVAL_MS);
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
      await this.options.runLoops();
    } catch (error) {
      warnMain('loops', 'scheduler check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
