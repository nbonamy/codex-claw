import type { AppshotHotkey } from '@codex-claw/shared/contracts';
import autolib, { type Autolib, type KeyMonitorEvent } from 'autolib';

const modifierPairs: Record<Exclude<AppshotHotkey, 'none'>, readonly [number, number]> = {
  command: [55, 54],
  option: [58, 61],
  shift: [56, 60],
};

export type AppshotsKeyMonitorOptions = {
  nativeMonitor?: Pick<Autolib, 'startKeyMonitor' | 'stopKeyMonitor'>;
  platform?: NodeJS.Platform;
};

export class AppshotsKeyMonitor {
  private readonly nativeMonitor: Pick<Autolib, 'startKeyMonitor' | 'stopKeyMonitor'>;
  private readonly platform: NodeJS.Platform;
  private hotkey: AppshotHotkey = 'none';
  private onTrigger: (() => void) | null = null;
  private running = false;
  private readonly heldKeys = new Set<number>();
  private triggered = false;

  constructor(options: AppshotsKeyMonitorOptions = {}) {
    this.nativeMonitor = options.nativeMonitor ?? autolib;
    this.platform = options.platform ?? process.platform;
  }

  start(hotkey: AppshotHotkey, onTrigger: () => void): boolean {
    this.stop();
    this.hotkey = hotkey;
    this.onTrigger = onTrigger;
    if (this.platform !== 'darwin' || hotkey === 'none') return true;

    const result = this.nativeMonitor.startKeyMonitor((event) => this.handleEvent(event));
    this.running = result === 0;
    return this.running;
  }

  stop(): void {
    if (this.running) this.nativeMonitor.stopKeyMonitor();
    this.running = false;
    this.hotkey = 'none';
    this.onTrigger = null;
    this.heldKeys.clear();
    this.triggered = false;
  }

  private handleEvent(event: KeyMonitorEvent): void {
    if (event.type !== 'flagsChanged' || this.hotkey === 'none') return;
    const pair = modifierPairs[this.hotkey];
    if (!pair.includes(event.keyCode)) return;

    if (this.heldKeys.has(event.keyCode)) {
      this.heldKeys.delete(event.keyCode);
    } else {
      this.heldKeys.add(event.keyCode);
    }

    const chordHeld = pair.every((keyCode) => this.heldKeys.has(keyCode));
    if (chordHeld && !this.triggered) {
      this.triggered = true;
      this.onTrigger?.();
    } else if (!chordHeld) {
      this.triggered = false;
    }
  }
}
