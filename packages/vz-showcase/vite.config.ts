import canvasCommons from '@canvas-commons/vite-plugin';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const Here = path.dirname(fileURLToPath(import.meta.url));
const Packages = path.resolve(Here, '..');
const Stub = path.resolve(Here, 'src/stubs/missing.ts');

/**
 * Packages that only exist on some branches. When a package (or its build) is
 * missing from this checkout, its imports resolve to an empty stub so the same
 * scenes build on canvas-commons main and show a placeholder instead.
 */
const Optional: Record<string, string[]> = {
  three: ['.'],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'd3-geo': ['.'],
  echarts: ['.'],
  shiki: ['.'],
  rig: ['.', './svg', './ik', './gaits', './characters'],
};

function entry(pkg: string, subpath: string): string | null {
  const manifest = path.join(Packages, pkg, 'package.json');
  if (!fs.existsSync(manifest)) return null;
  const json = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
    exports?: Record<string, string | {default?: string}>;
  };
  const target = json.exports?.[subpath];
  const file = typeof target === 'string' ? target : target?.default;
  if (!file) return null;
  const resolved = path.join(Packages, pkg, file);
  return fs.existsSync(resolved) ? resolved : null;
}

const Alias: {find: RegExp; replacement: string}[] = [];
const Available: string[] = [];
for (const [pkg, subpaths] of Object.entries(Optional)) {
  for (const subpath of subpaths) {
    const name = `@canvas-commons/${pkg}${subpath === '.' ? '' : subpath.slice(1)}`;
    const file = entry(pkg, subpath);
    if (file && subpath === '.') Available.push(pkg);
    Alias.push({
      find: new RegExp(`^${name.replace(/[/.]/g, '\\$&')}$`),
      replacement: file ?? Stub,
    });
  }
}

export default defineConfig({
  plugins: [
    canvasCommons({
      project: ['./src/projects/*.ts'],
    }),
  ],
  define: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __VZ_OPTIONAL_PACKAGES__: JSON.stringify(Available),
  },
  resolve: {alias: Alias},
  server: {
    fs: {allow: [Packages, path.resolve(Packages, '..')]},
  },
});
