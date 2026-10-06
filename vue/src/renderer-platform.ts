export type RendererPlatform = 'macos' | 'windows' | 'other';

export function rendererPlatform(navigatorPlatform: string, userAgent = ''): RendererPlatform {
  if (navigatorPlatform.startsWith('Mac') || userAgent.includes('Macintosh')) return 'macos';
  if (navigatorPlatform.startsWith('Win') || userAgent.includes('Windows')) return 'windows';
  return 'other';
}

export function applyRendererPlatform(
  root: HTMLElement,
  navigatorPlatform: string,
  userAgent = '',
): void {
  root.dataset.platform = rendererPlatform(navigatorPlatform, userAgent);
}
