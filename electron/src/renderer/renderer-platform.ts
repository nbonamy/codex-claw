export type RendererPlatform = 'macos' | 'other';

export function rendererPlatform(navigatorPlatform: string, userAgent = ''): RendererPlatform {
  return navigatorPlatform.startsWith('Mac') || userAgent.includes('Macintosh') ? 'macos' : 'other';
}

export function applyRendererPlatform(
  root: HTMLElement,
  navigatorPlatform: string,
  userAgent = '',
): void {
  root.dataset.platform = rendererPlatform(navigatorPlatform, userAgent);
}
