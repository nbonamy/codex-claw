declare module 'electron-squirrel-startup';
declare module '*.css';

declare module 'fix-webm-duration' {
  export default function fixWebmDuration(blob: Blob, duration: number): Promise<Blob>;
}

declare module 'webm-to-wav-converter' {
  export function getWaveBlob(blob: Blob, as32BitFloat?: boolean): Promise<Blob>;
}
