import type {
  BrowserWindow,
  MessageBoxOptions,
  MessageBoxReturnValue,
} from 'electron';
import type { DesktopUpdateStatus } from '@codex-claw/core/contracts';

type ManualUpdateCheckOptions = {
  getWindow: () => BrowserWindow | null;
  installUpdate: () => void;
  showMessageBox: (
    window: BrowserWindow | null,
    options: MessageBoxOptions,
  ) => Promise<MessageBoxReturnValue>;
};

export class ManualUpdateCheckController {
  private readonly getWindow: () => BrowserWindow | null;
  private readonly installUpdate: () => void;
  private readonly showMessageBox: (
    window: BrowserWindow | null,
    options: MessageBoxOptions,
  ) => Promise<MessageBoxReturnValue>;
  private waitingForResult = false;
  private promptOpen = false;

  constructor(options: ManualUpdateCheckOptions) {
    this.getWindow = options.getWindow;
    this.installUpdate = options.installUpdate;
    this.showMessageBox = options.showMessageBox;
  }

  begin(currentStatus: DesktopUpdateStatus): boolean {
    if (currentStatus.state === 'downloaded') {
      void this.promptInstall(currentStatus);
      return false;
    }

    if (currentStatus.state === 'disabled') {
      void this.showDisabledMessage();
      return false;
    }

    this.waitingForResult = true;
    return true;
  }

  cancel(): void {
    this.waitingForResult = false;
  }

  handleStatus(status: DesktopUpdateStatus): void {
    if (!this.waitingForResult) return;
    if (status.state === 'checking' || status.state === 'downloading') return;

    this.waitingForResult = false;
    if (status.state === 'downloaded') {
      void this.promptInstall(status);
      return;
    }
    if (status.state === 'error') {
      void this.showErrorMessage(status);
      return;
    }
    if (status.state === 'idle') void this.showUpToDateMessage();
  }

  private async promptInstall(status: DesktopUpdateStatus): Promise<void> {
    if (this.promptOpen) return;
    this.promptOpen = true;
    try {
      const result = await this.showMessageBox(this.getWindow(), {
        buttons: ['Install and Relaunch', 'Later'],
        cancelId: 1,
        defaultId: 0,
        detail: status.version
          ? `Codex Claw ${status.version} has been downloaded. Install and relaunch now?`
          : 'A Codex Claw update has been downloaded. Install and relaunch now?',
        message: 'Update ready to install',
        noLink: true,
        type: 'question',
      });
      if (result.response === 0) this.installUpdate();
    } finally {
      this.promptOpen = false;
    }
  }

  private async showDisabledMessage(): Promise<void> {
    await this.showMessageBox(this.getWindow(), {
      buttons: ['OK'],
      defaultId: 0,
      message: 'Update checks are not available',
      noLink: true,
      type: 'info',
    });
  }

  private async showErrorMessage(status: DesktopUpdateStatus): Promise<void> {
    await this.showMessageBox(this.getWindow(), {
      buttons: ['OK'],
      defaultId: 0,
      detail: status.error,
      message: 'Unable to check for updates',
      noLink: true,
      type: 'error',
    });
  }

  private async showUpToDateMessage(): Promise<void> {
    await this.showMessageBox(this.getWindow(), {
      buttons: ['OK'],
      defaultId: 0,
      detail: 'You are using the latest version of Codex Claw.',
      message: 'Codex Claw is up to date',
      noLink: true,
      type: 'info',
    });
  }
}
