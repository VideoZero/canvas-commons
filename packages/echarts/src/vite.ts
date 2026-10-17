import path from 'node:path';
import type {Plugin} from 'vite';
import {transformWithOxc} from 'vite';

export interface EChartsSourcePluginOptions {
  /**
   * Absolute path to an echarts checkout containing `src/echarts.all.ts`.
   */
  echartsRoot: string;
  /**
   * Absolute path to a zrender checkout containing `src/zrender.ts`.
   */
  zrenderRoot: string;
}

/* eslint-disable @typescript-eslint/naming-convention -- echarts globals */
const Define = {__DEV__: 'false'};
/* eslint-enable @typescript-eslint/naming-convention */

const ClassFieldsWithoutDefine = {
  assumptions: {setPublicClassFields: true},
  typescript: {removeClassFieldsWithoutInitializer: true},
};

/**
 * Resolve `echarts` and `zrender` to TypeScript source checkouts.
 *
 * @remarks
 * Only needed to debug or patch ECharts itself; the published `echarts`
 * package works without it. The sources rely on the `__DEV__` global and on
 * `useDefineForClassFields: false`, both of which this plugin provides for the
 * dev server's dependency optimizer and for builds.
 *
 * @param options - The locations of the source checkouts.
 *
 * @example
 * ```ts
 * import canvasCommons from '@canvas-commons/vite-plugin';
 * import echartsSource from '@canvas-commons/echarts/vite';
 * import {defineConfig} from 'vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     canvasCommons(),
 *     echartsSource({
 *       echartsRoot: '/path/to/echarts',
 *       zrenderRoot: '/path/to/zrender',
 *     }),
 *   ],
 * });
 * ```
 */
export default function echartsSource(
  options: EChartsSourcePluginOptions,
): Plugin {
  const roots = [options.echartsRoot, options.zrenderRoot].map(
    root => path.resolve(root, 'src') + path.sep,
  );
  const isSource = (id: string) =>
    /\.ts$/.test(id) && roots.some(root => id.startsWith(root));

  return {
    name: '@canvas-commons/echarts:source',
    enforce: 'pre',
    config() {
      return {
        resolve: {
          alias: [
            {
              find: /^zrender$/,
              replacement: path.join(options.zrenderRoot, 'src/zrender'),
            },
            {find: /^zrender\//, replacement: options.zrenderRoot + '/'},
            {
              find: /^echarts$/,
              replacement: path.join(options.echartsRoot, 'src/echarts.all'),
            },
            {find: /^echarts\//, replacement: options.echartsRoot + '/'},
          ],
        },
        define: Define,
        optimizeDeps: {
          include: ['echarts'],
          rolldownOptions: {
            transform: {...ClassFieldsWithoutDefine, define: Define},
          },
        },
      };
    },
    async transform(code, id) {
      if (!isSource(id)) {
        return null;
      }
      const result = await transformWithOxc(code, id, {
        ...ClassFieldsWithoutDefine,
        lang: 'ts',
        sourcemap: true,
      });
      return {code: result.code, map: result.map};
    },
  };
}
