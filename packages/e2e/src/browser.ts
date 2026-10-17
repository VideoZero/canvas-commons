import {existsSync} from 'fs';
import {BrowserType, chromium, firefox} from 'playwright';

/**
 * Browsers the suite can drive. Firefox renders the committed snapshots, so it
 * stays the default.
 */
export const BrowserNames = ['firefox', 'chromium'] as const;
export type BrowserName = (typeof BrowserNames)[number];

const BrowserTypes: Record<BrowserName, BrowserType> = {firefox, chromium};

function isBrowserName(name: string): name is BrowserName {
  return (BrowserNames as readonly string[]).includes(name);
}

/**
 * Pick the browser from `E2E_BROWSER`, or fall back to Chromium when the
 * Firefox build Playwright expects isn't installed.
 */
export function resolveBrowserName(
  requested = process.env.E2E_BROWSER,
  isInstalled = (name: BrowserName) => existsSync(executablePath(name)),
): BrowserName {
  if (requested) {
    if (!isBrowserName(requested)) {
      throw new Error(
        `E2E_BROWSER must be one of ${BrowserNames.join(', ')}, got "${requested}".`,
      );
    }
    return requested;
  }

  if (isInstalled('firefox') || !isInstalled('chromium')) {
    return 'firefox';
  }
  console.warn(
    'Firefox is not installed for Playwright; running the e2e suite in ' +
      'Chromium. Its snapshots live in src/__image_snapshots__/chromium and ' +
      'are not committed.',
  );
  return 'chromium';
}

export function browserType(name: BrowserName): BrowserType {
  return BrowserTypes[name];
}

/**
 * Where the browser binary lives: `E2E_FIREFOX_EXECUTABLE` or
 * `E2E_CHROMIUM_EXECUTABLE` for a browser installed outside Playwright's
 * cache, otherwise Playwright's own build.
 */
export function executablePath(name: BrowserName): string {
  return (
    process.env[`E2E_${name.toUpperCase()}_EXECUTABLE`] ??
    BrowserTypes[name].executablePath()
  );
}

/**
 * Launch the browser as a server the test workers connect to.
 */
export function launchBrowserServer(name: BrowserName) {
  return browserType(name).launchServer({
    headless: true,
    executablePath: executablePath(name),
  });
}
