import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['./src/**/*.test.*'],
    environment: 'jsdom',
    setupFiles: ['geometry-polyfill'],
    server: {deps: {inline: ['@chenglou/pretext']}},
  },
});
