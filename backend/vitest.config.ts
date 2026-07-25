import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/test/globalSetup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Integration files share one PostgreSQL database. Serial files prevent a
    // suite's teardown from deleting another suite's fixtures.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/**/*.d.ts', 'src/types/**/*.ts', 'src/test/**/*.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
});
