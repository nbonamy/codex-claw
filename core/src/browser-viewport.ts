export const browserDevicePresets = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

export type BrowserViewportConfiguration = {
  preset: 'fit' | 'responsive' | 'custom' | keyof typeof browserDevicePresets;
  width?: number;
  height?: number;
};

export type BrowserViewportRequest = {
  agentId: string;
  browserId: string;
  requestId: string;
  viewport: BrowserViewportConfiguration;
};

export function parseBrowserViewport(input: Record<string, unknown>): BrowserViewportConfiguration {
  const { preset, width, height } = input;
  if (preset !== undefined) {
    if (width !== undefined || height !== undefined) throw new Error('Choose a preset or custom width and height, not both.');
    if (preset === 'fit' || preset === 'responsive') return { preset };
    if (preset === 'phone' || preset === 'tablet' || preset === 'desktop') return { preset, ...browserDevicePresets[preset] };
    throw new Error('Unknown browser viewport preset.');
  }
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 240 || width > 2000
    || typeof height !== 'number' || !Number.isInteger(height) || height < 320 || height > 2000) {
    throw new Error('Provide viewport width (240–2000) and height (320–2000) in CSS pixels.');
  }
  return { preset: 'custom', width, height };
}
