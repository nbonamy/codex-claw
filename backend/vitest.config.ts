import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/claude/**'],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
