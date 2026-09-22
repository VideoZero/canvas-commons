import markdownLiterals from '@motion-canvas/internal/vite/markdown-literals';
import path from 'path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [markdownLiterals()],
  resolve: {
    // The prebuilt libs break under node ESM (circular imports); run the
    // tests against the sources like the vite configs do.
    alias: [
      {
        find: /@motion-canvas\/2d(\/lib)?$/,
        replacement: path.resolve(__dirname, 'vitest-2d-shim.ts'),
      },
      {
        find: /@motion-canvas\/core(\/lib)?$/,
        replacement: path.resolve(__dirname, '../core/src'),
      },
      {
        find: /^@motion-canvas\/core\/lib\//,
        replacement: path.resolve(__dirname, '../core/src') + '/',
      },
    ],
  },
  test: {
    include: ['./src/**/*.test.*'],
    environment: 'jsdom',
  },
});
