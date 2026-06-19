import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG, MakerDMGConfig } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { signDarwinBinaries } from './build/sign-binaries';

import dotenv from 'dotenv';
dotenv.config({
  path: '../'
});

// macOS signing/notarization is release-only. Agents should set
// CODEX_CLAW_SKIP_SIGNING=1 for local package/build verification.
const skipMacSigning = Boolean(process.env.TEST) || process.env.CODEX_CLAW_SKIP_SIGNING === '1';

// osx special configuration
let osxPackagerConfig = {}
const isDarwin = process.platform == 'darwin';
const dmgOptions: MakerDMGConfig = {
  icon: './assets/icon.icns',
  // background: './assets/dmg_background.png',
  // additionalDMGOptions: {
  //   window: {
  //     size: { width: 658, height: 492 },
  //     position: { x: 500, y: 400 },
  //   }
  // }
}

if (isDarwin && !skipMacSigning) {
  osxPackagerConfig = {
    osxSign: {
      identity: process.env.IDENTIFY_DARWIN_CODE,
      // provisioningProfile: './build/Witsy_Darwin.provisionprofile',
      optionsForFile: () => { return {
        hardenedRuntime: true,
        entitlements: './build/Entitlements.darwin.plist',
        'entitlements-inherit': './build/Entitlements.darwin.plist',
      }; },
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icon',
    appBundleId: 'com.nabocorp.codex-claw',
    executableName: 'codex-claw',
    extraResource: ['assets/apple-speechanalyzer-cli', 'resources/clawd'],
    extendInfo: 'build/Info.plist',
    ...osxPackagerConfig,
    afterCopyExtraResources: [
      (buildPath: string, _electronVersion: string, platform: string, arch: string, callback: (error?: Error) => void) => {
        try {
          if (platform === 'darwin' && !skipMacSigning) {
            signDarwinBinaries(buildPath, arch);
          }
          callback();
        } catch (error) {
          callback(error instanceof Error ? error : new Error(String(error)));
        }
      },
    ],
  },
  makers: [
    new MakerZIP({}, ['darwin', 'win32', 'linux']),
    new MakerDMG(dmgOptions, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
