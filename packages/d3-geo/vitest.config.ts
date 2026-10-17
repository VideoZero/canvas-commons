import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['geometry-polyfill', './src/__tests__/setup.ts'],
  },
});
