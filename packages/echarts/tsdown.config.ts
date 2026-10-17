import {defineConfig} from 'tsdown';

const Common = defineConfig({
  outDir: 'lib',
  format: 'esm',
  dts: true,
  sourcemap: true,
  target: 'es2022',
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
  deps: {
    neverBundle: [/^@canvas-commons\//, /^echarts(\/|$)/, /^vite$/],
  },
});

export default defineConfig([
  {...Common, clean: true, entry: ['src/index.ts']},
  {...Common, entry: ['src/vite.ts'], platform: 'node'},
]);
