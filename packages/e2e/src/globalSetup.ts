import * as path from 'path';
import {BrowserServer as PlaywrightBrowserServer} from 'playwright';
import {fileURLToPath} from 'url';
import {createServer, ViteDevServer} from 'vite';
import type {TestProject} from 'vitest/node';
import {
  BrowserName,
  browserType,
  launchBrowserServer,
  resolveBrowserName,
} from './browser';

const Root = fileURLToPath(new URL('.', import.meta.url));

let ViteServer: ViteDevServer | null = null;
let BrowserServer: PlaywrightBrowserServer | null = null;

export async function setup(project: TestProject) {
  const browserName = resolveBrowserName();
  const browser = browserType(browserName);
  const [server, browserServer] = await Promise.all([
    createServer({
      root: Root,
      configFile: path.resolve(Root, '../vite.config.ts'),
    }).then(s => s.listen()),
    launchBrowserServer(browserName),
  ]);

  ViteServer = server;
  BrowserServer = browserServer;

  const port = server.config.server.port!;
  const wsEndpoint = browserServer.wsEndpoint();

  // Dev-server dependency optimization triggers a full reload when it
  // lands. Without a warm-up, that reload fires inside the first real
  // test, which can drop dynamic state like the player's `src` attribute.
  const warm = await browser.connect(wsEndpoint);
  const warmPage = await warm.newPage();
  await warmPage.goto(`http://localhost:${port}/`);
  // This first navigation also pays the one-time cold optimization of the
  // pre-bundled deps (mathjax and yoga are large)
  await warmPage.waitForSelector('main', {timeout: 45000});
  await warmPage.close();
  await warm.close();

  project.provide('vitePort', port);
  project.provide('browserWsEndpoint', wsEndpoint);
  project.provide('browserName', browserName);
}

export async function teardown() {
  await Promise.all([ViteServer?.close(), BrowserServer?.close()]);
}

declare module 'vitest' {
  export interface ProvidedContext {
    vitePort: number;
    browserWsEndpoint: string;
    browserName: BrowserName;
  }
}
