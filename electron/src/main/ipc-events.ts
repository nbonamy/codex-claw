import type { AppCommand, MainToRendererEvent } from '@codex-claw/core/contracts';
import { ipcChannels, type CodexClawIpcEvents } from '@codex-claw/core/ipc';
import { sendIpcEvent, type IpcEventSender } from '@codex-app-sdk/electron';

export function sendRendererEvent(sender: IpcEventSender, event: MainToRendererEvent): void {
  sendIpcEvent<CodexClawIpcEvents, typeof ipcChannels.event>(sender, ipcChannels.event, event);
}

export function sendAppCommand(sender: IpcEventSender, command: AppCommand): void {
  sendIpcEvent<CodexClawIpcEvents, typeof ipcChannels.appCommand>(sender, ipcChannels.appCommand, command);
}
