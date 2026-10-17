import {defineConfig} from 'tsdown';

export default defineConfig({
  /* eslint-disable @typescript-eslint/naming-convention -- output paths */
  entry: {
    index: 'src/index.ts',
    'gaits/index': 'src/gaits/index.ts',
    'ik/index': 'src/ik/index.ts',
    'svg/index': 'src/svg/index.ts',
  },
  /* eslint-enable @typescript-eslint/naming-convention */
  outDir: 'lib',
  format: 'esm',
  dts: true,
  sourcemap: true,
  target: 'es2022',
  clean: true,
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
  deps: {
    neverBundle: [/^@canvas-commons\//],
  },
});
