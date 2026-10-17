// @vitest-environment node
import path from 'node:path';
import type {Plugin, UserConfig} from 'vite';
import {describe, expect, it} from 'vitest';
import echartsSource from './vite';

const Roots = {
  echartsRoot: path.resolve('/checkouts/echarts'),
  zrenderRoot: path.resolve('/checkouts/zrender'),
};

function hook<T>(value: T | {handler: T} | undefined): T {
  if (value === undefined) {
    throw new Error('Missing hook.');
  }
  return typeof value === 'object' && value !== null && 'handler' in value
    ? value.handler
    : value;
}

async function transform(plugin: Plugin, code: string, id: string) {
  const handler = hook(plugin.transform);
  const result = await Reflect.apply(handler, {}, [code, id]);
  return typeof result === 'object' && result !== null && 'code' in result
    ? String(result.code)
    : null;
}

describe('echartsSource', () => {
  it('aliases echarts and zrender to their sources', () => {
    const plugin = echartsSource(Roots);
    const config: UserConfig = Reflect.apply(hook(plugin.config), {}, [
      {},
      {command: 'serve', mode: 'development'},
    ]);

    const aliases = config.resolve?.alias;
    expect(Array.isArray(aliases)).toBe(true);
    const resolve = (id: string) => {
      for (const alias of Array.isArray(aliases) ? aliases : []) {
        if (typeof alias.find !== 'string' && alias.find.test(id)) {
          return id.replace(alias.find, alias.replacement);
        }
      }
      return id;
    };
    expect(resolve('echarts')).toBe(
      path.join(Roots.echartsRoot, 'src/echarts.all'),
    );
    expect(resolve('zrender')).toBe(
      path.join(Roots.zrenderRoot, 'src/zrender'),
    );
    expect(resolve('zrender/src/core/util')).toBe(
      Roots.zrenderRoot + '/src/core/util',
    );
    expect(config.define).toEqual({['__DEV__']: 'false'});
    expect(config.optimizeDeps?.include).toContain('echarts');
  });

  it('compiles sources without define semantics for class fields', async () => {
    const plugin = echartsSource(Roots);
    const source = `
      class Model { type: string; }
      Model.prototype.type = 'model';
      export const type = new Model().type;
    `;

    const code = await transform(
      plugin,
      source,
      path.join(Roots.echartsRoot, 'src/model/Model.ts'),
    );
    expect(code).not.toBeNull();
    expect(code).toMatch(/class Model \{\s*\}/);

    const module = await import(
      `data:text/javascript,${encodeURIComponent(code ?? '')}`
    );
    expect(module.type).toBe('model');
  });

  it('leaves other files alone', async () => {
    const plugin = echartsSource(Roots);
    expect(
      await transform(plugin, 'class A { a: number; }', '/project/src/a.ts'),
    ).toBeNull();
  });
});
