import path from 'path';
import type {Plugin} from 'vite';

export interface EchartsPluginOptions {
  /**
   * Absolute path to the echarts source root directory.
   * Must contain `src/echarts.all.ts`.
   */
  echartsRoot: string;
  /**
   * Absolute path to the zrender source root directory.
   * Must contain `src/zrender.ts`.
   */
  zrenderRoot: string;
}

export default function echartsPlugin(options: EchartsPluginOptions): Plugin {
  const {echartsRoot, zrenderRoot} = options;
  return {
    name: '@motion-canvas/echarts',
    config() {
      return {
        resolve: {
          alias: [
            {find: /^zrender\//, replacement: zrenderRoot + '/'},
            {
              find: /^zrender$/,
              replacement: path.join(zrenderRoot, 'src/zrender'),
            },
            {
              find: /^echarts$/,
              replacement: path.join(echartsRoot, 'src/echarts.all'),
            },
            {find: /^echarts\//, replacement: echartsRoot + '/'},
          ],
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        define: {__DEV__: 'false'},
        optimizeDeps: {
          include: ['echarts'],
          esbuildOptions: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            define: {__DEV__: 'false'},
            tsconfigRaw: {
              compilerOptions: {
                useDefineForClassFields: false,
              },
            },
          },
        },
      };
    },
  };
}
