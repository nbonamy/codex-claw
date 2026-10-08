/** Local emulators only. Coordinates always refer to the returned screenshot pixels. */
export type MobileDevice = {
  id: string;
  platform: 'ios' | 'android';
  name: string;
  state: 'booted' | 'shutdown';
  owner?: string;
};
export type MobileAttachment = { id: string; device: MobileDevice };
export type MobileFrame = {
  attachmentId: string;
  data: string;
  mimeType: 'image/png';
  /** Screenshot pixels per device point (Android input uses pixels). */
  scale: number;
  width: number;
  height: number;
};
export type MobileCatalog = {
  devices: MobileDevice[];
  setup: { platform: 'ios' | 'android'; message: string; url: string }[];
};
export type MobileAction =
  | { action: 'tap'; x: number; y: number; width: number; height: number }
  | {
      action: 'swipe';
      x: number;
      y: number;
      toX: number;
      toY: number;
      width: number;
      height: number;
      durationMs: number;
    }
  | { action: 'text'; text: string }
  | { action: 'button'; button: 'home' | 'back' | 'enter' | 'backspace' }
  | { action: 'launch'; appId: string };
export type MobileRequest =
  | { action: 'list' }
  | { action: 'status' }
  | { action: 'attach'; deviceId: string }
  | { action: 'detach'; attachmentId: string }
  | { action: 'screenshot'; attachmentId: string }
  | { action: 'inspect'; attachmentId: string }
  | (MobileAction & { attachmentId: string });
export type MobileResult = {
  catalog?: MobileCatalog;
  attachment: MobileAttachment | null;
  frame?: MobileFrame;
  inspection?: { kind: 'accessibility' | 'screenshot'; text: string };
};
