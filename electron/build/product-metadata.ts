import { product } from '@workspace/core/product';

export const desktopMetadata = {
  NSLocalNetworkUsageDescription: `${product.name} connects to development services and repositories on your local network.`,
  NSMicrophoneUsageDescription: `${product.name} uses the microphone to transcribe your voice into composer text.`,
  ITSAppUsesNonExemptEncryption: false,
  LSMultipleInstancesProhibited: true,
  CFBundleURLTypes: [{
    CFBundleURLName: `${product.appId}.deep-link`,
    CFBundleURLSchemes: [product.protocolScheme],
  }],
};
