import {Browser, Page} from 'playwright';
import {inject} from 'vitest';
import {BrowserName, browserType} from './browser';

let BrowserPromise: Promise<Browser> | null = null;
let BrowserWsEndpointOverride: string | null = null;
let VitePortOverride: number | null = null;
let BrowserNameOverride: BrowserName | null = null;

/**
 * Point the shared browser and dev server at instances the caller manages, for
 * render scripts that run outside a vitest worker and cannot use `inject()`.
 */
export function useStandaloneServer(
  vitePort: number,
  browserWsEndpoint: string,
  browser: BrowserName = 'firefox',
): void {
  VitePortOverride = vitePort;
  BrowserWsEndpointOverride = browserWsEndpoint;
  BrowserNameOverride = browser;
}

/**
 * The browser the suite renders in, chosen once by the global setup.
 */
export function browserName(): BrowserName {
  return BrowserNameOverride ?? inject('browserName');
}

export interface PageOptions {
  /**
   * Path to navigate to on the dev server. Defaults to `'/'`, which loads
   * the project selection screen in a multi-project package and the editor
   * directly in a single-project one.
   */
  path?: string;
  /**
   * Selector to wait for after navigation. Defaults to `'main'`, which both
   * the editor and the project selection screen render into.
   */
  waitFor?: string;
}

export async function getSharedBrowser(): Promise<Browser> {
  BrowserPromise ??= browserType(browserName()).connect(
    BrowserWsEndpointOverride ?? inject('browserWsEndpoint'),
  );
  return BrowserPromise;
}

export function baseUrl(): string {
  return `http://localhost:${VitePortOverride ?? inject('vitePort')}`;
}

export async function newPage(options: PageOptions = {}): Promise<Page> {
  const {path: targetPath = '/', waitFor = 'main'} = options;
  const browser = await getSharedBrowser();
  const page = await browser.newPage();
  await page.goto(`${baseUrl()}${targetPath}`);
  await page.waitForSelector(waitFor);
  return page;
}
