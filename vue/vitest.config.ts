import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

const logicTestFiles = [
  'src/__tests__/async-catalog-cache.spec.ts',
  'src/__tests__/collaboration-message.spec.ts',
  'src/__tests__/i18n-contract.spec.ts',
  'src/__tests__/localized-error-message.spec.ts',
  'src/__tests__/tool-presentation.spec.ts',
  'src/__tests__/tool-title-presenter.spec.ts',
  'src/components/__tests__/cockpit-agent-layout.spec.ts',
  'src/components/__tests__/image-annotation.spec.ts',
  'src/components/__tests__/repository-session-context.spec.ts',
  'src/components/__tests__/use-chat-text-annotations.spec.ts',
  'src/components/__tests__/use-repository-session-menu.spec.ts',
  'src/components/__tests__/use-work-item-routing.spec.ts',
  'src/components/__tests__/use-workspace-previews.spec.ts',
  'src/shared/__tests__/use-debounced-save.spec.ts',
  'src/shared/confetti/__tests__/canvas-celebration.spec.ts',
  'src/theme/__tests__/themes.spec.ts',
];

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@codex-claw/core': path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    environment: 'jsdom',
    css: {
      // Opt in only components with valuable runtime CSS assertions.
      include: [/SourcePreviewPanel\.vue/, /CodeReviewPanel\.vue/, /MissionShipBoard\.vue/, /MissionImplementationBoard\.css/, /MissionImplementationTicketCard\.vue/, /base\.css/],
    },
    pool: 'vmThreads',
    vmMemoryLimit: '2GB',
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node',
          include: logicTestFiles,
          setupFiles: [],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          include: ['src/**/*.spec.ts'],
          exclude: logicTestFiles,
          setupFiles: [path.resolve(__dirname, 'src/test/setup.ts')],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/bootstrap.ts',
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/test/**',
      ],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 90,
      },
    },
  },
});
