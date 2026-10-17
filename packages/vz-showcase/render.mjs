#!/usr/bin/env node
// Render showcase projects headlessly to mp4, the way packages/e2e renders its
// scenes: a vite dev server with the canvas-commons plugin, the editor opened
// in Playwright's Chromium, and the image-sequence exporter writing PNG frames
// through the plugin, which ffmpeg then encodes.
//
// Usage: node render.mjs --out <dir> [project ...]
//   Without projects, every project in src/projects is rendered.
//   Writes <out>/<project>.mp4 and <out>/<project>.log.json (logged
//   warnings and errors). When the render fails, the frames rendered so far
//   are kept and a red "scene failed" card with the error is appended.
//
// Environment: CHROMIUM_PATH (default /opt/pw-browsers/chromium),
//   FFMPEG (default: ffmpeg on PATH), KEEP_FRAMES=1 to keep the PNG frames.
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let out = path.join(here, 'output', '_videos');
const projects = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = path.resolve(args[++i]);
  else projects.push(args[i]);
}
if (projects.length === 0) {
  for (const file of fs.readdirSync(path.join(here, 'src/projects'))) {
    if (file.endsWith('.ts')) projects.push(file.slice(0, -3));
  }
}
fs.mkdirSync(out, {recursive: true});

const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const framesRoot = path.join(here, 'output');

const server = await createServer({
  root: here,
  configFile: path.join(here, 'vite.config.ts'),
  logLevel: 'warn',
  server: {port: 0, strictPort: false},
}).then(s => s.listen());
const base = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function open(name) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    page.on('pageerror', e => console.warn(`[${name}] pageerror: ${e}`));
    try {
      await page.goto(`${base}src/projects/${name}`);
      await page.waitForSelector('main', {timeout: 60000});
      await page.waitForFunction(
        () => !!window.commons && window.commons.player.playback.duration > 0,
        undefined,
        {timeout: 120000},
      );
      // Let vite settle any late dependency optimization (which reloads).
      await page.waitForTimeout(1500);
      await page.waitForFunction(
        () => !!window.commons && window.commons.player.playback.duration > 0,
        undefined,
        {timeout: 120000},
      );
      return page;
    } catch (e) {
      last = e;
      await page.close();
    }
  }
  throw last;
}

function errorCard(name, frames, message, target) {
  const pngs = fs
    .readdirSync(frames)
    .filter(f => f.endsWith('.png'))
    .sort();
  const text = path.join(frames, 'error.txt');
  const wrapped = `SCENE FAILED\n\n${message}`
    .split('\n')
    .flatMap(line => line.match(/.{1,60}(\s|$)|\S+/g) ?? [''])
    .slice(0, 12)
    .join('\n')
    .replace(/%/g, '%%');
  fs.writeFileSync(text, wrapped);
  const input = pngs.length
    ? ['-loop', '1', '-i', path.join(frames, pngs.at(-1))]
    : ['-f', 'lavfi', '-i', 'color=c=0x0f1419:s=960x540'];
  execFileSync(ffmpeg, [
    '-loglevel',
    'error',
    '-y',
    ...input,
    '-t',
    '3',
    '-r',
    '30',
    '-vf',
    `scale=960:540,drawbox=c=black@0.75:t=fill,drawtext=fontfile=${font}:textfile=${text}:fontcolor=0xf85149:fontsize=24:line_spacing=8:x=(w-tw)/2:y=(h-th)/2`,
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    target,
  ]);
  console.log(`[${name}] appended failure card`);
}

async function renderOnce(name) {
  let page;
  try {
    page = await open(name);
  } catch (e) {
    return {status: 1, logs: [{level: 'error', message: `browser: ${e}`}]};
  }
  const result = await page
    .evaluate(async name => {
      const logs = [];
      const off = window.commons.project.logger.onLogged.subscribe(p => {
        if (['warn', 'error'].includes(p.level ?? 'info')) {
          logs.push({level: p.level, message: String(p.message)});
        }
      });
      await document.fonts.ready;
      const settings = window.commons.meta.getFullRenderingSettings();
      let status;
      const finished = new Promise(resolve => {
        const unsubscribe = window.commons.renderer.onFinished.subscribe(r => {
          unsubscribe();
          resolve(r);
        });
      });
      try {
        await window.commons.renderer.render({
          ...settings,
          name,
          fps: 30,
          resolutionScale: 1,
          exporter: {
            name: '@canvas-commons/core/image-sequence',
            options: {
              fileType: 'image/png',
              quality: 100,
              groupByScene: false,
            },
          },
        });
        status = await finished;
      } catch (e) {
        logs.push({level: 'error', message: String(e)});
      }
      off();
      return {status: status ?? null, logs};
    }, name)
    .catch(e => ({
      status: 1,
      logs: [{level: 'error', message: `browser: ${e.message}`}],
    }));
  await page.close().catch(() => {});
  return result;
}

try {
  for (const name of projects) {
    const started = Date.now();
    const frames = path.join(framesRoot, name);
    fs.rmSync(frames, {recursive: true, force: true});
    let result = await renderOnce(name);
    // A crashed tab (e.g. memory pressure on a busy machine) gets one retry.
    if (result.logs[0]?.message.startsWith('browser:')) {
      console.warn(`[${name}] ${result.logs[0].message}, retrying`);
      fs.rmSync(frames, {recursive: true, force: true});
      result = await renderOnce(name);
    }

    fs.mkdirSync(frames, {recursive: true});
    const pngs = fs.readdirSync(frames).filter(f => f.endsWith('.png'));
    const failed =
      result.status === 1 ||
      pngs.length === 0 ||
      result.logs.some(l => l.level === 'error');
    fs.writeFileSync(
      path.join(out, `${name}.log.json`),
      JSON.stringify({...result, frames: pngs.length, failed}, null, 2),
    );

    const target = path.join(out, `${name}.mp4`);
    const main = path.join(frames, 'main.mp4');
    const parts = [];
    if (pngs.length) {
      execFileSync(ffmpeg, [
        '-loglevel',
        'error',
        '-y',
        '-framerate',
        '30',
        '-pattern_type',
        'glob',
        '-i',
        path.join(frames, '*.png'),
        '-vf',
        'scale=960:540',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-crf',
        '20',
        main,
      ]);
      parts.push(main);
    }
    if (failed && result.status === 1) {
      const message =
        result.logs.filter(l => l.level === 'error').at(-1)?.message ??
        'render failed';
      const card = path.join(frames, 'failed.mp4');
      errorCard(name, frames, message, card);
      parts.push(card);
    }
    if (parts.length === 1) {
      fs.copyFileSync(parts[0], target);
    } else {
      const list = path.join(frames, 'parts.txt');
      fs.writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
      execFileSync(ffmpeg, [
        '-loglevel',
        'error',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-c',
        'copy',
        target,
      ]);
    }
    console.log(
      `[${name}] ${pngs.length} frames, status ${result.status}, ${
        result.logs.length
      } warnings/errors, ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    if (!process.env.KEEP_FRAMES) {
      fs.rmSync(frames, {recursive: true, force: true});
    }
  }
} finally {
  await browser.close();
  await server.close();
}
