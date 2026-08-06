declare module 'autolib' {
  export type KeyMonitorEvent = {
    type: 'down' | 'up' | 'flagsChanged';
    keyCode: number;
    flags: number;
    isRepeat: boolean;
  };

  export type Autolib = {
    getForemostProcessId(): number | null;
    isKeyMonitorRunning(): boolean;
    startKeyMonitor(callback: (event: KeyMonitorEvent) => void): number;
    stopKeyMonitor(): number;
  };

  const autolib: Autolib;
  export default autolib;
}
