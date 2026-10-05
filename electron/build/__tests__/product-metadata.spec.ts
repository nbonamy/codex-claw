import { describe, expect, it, vi } from 'vitest';
import { desktopMetadata } from '../product-metadata';

vi.mock('@workspace/core/product', () => ({
  product: { name: 'Example', appId: 'org.example.desktop', protocolScheme: 'example' },
}));

describe('macOS Info.plist', () => {
  it('provides branded permissions and registers the product deep-link scheme', () => {
    expect(desktopMetadata).toStrictEqual({
      NSLocalNetworkUsageDescription: 'Example connects to development services and repositories on your local network.',
      NSMicrophoneUsageDescription: 'Example uses the microphone to transcribe your voice into composer text.',
      ITSAppUsesNonExemptEncryption: false,
      LSMultipleInstancesProhibited: true,
      CFBundleURLTypes: [{ CFBundleURLName: 'org.example.desktop.deep-link', CFBundleURLSchemes: ['example'] }],
    });
  });
});
