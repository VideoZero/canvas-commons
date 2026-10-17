import {describe, expect, test} from 'vitest';
import {resolveBrowserName} from './browser';

describe('resolveBrowserName', () => {
  const installed =
    (...names: string[]) =>
    (name: string) =>
      names.includes(name);

  test('prefers Firefox', () => {
    expect(
      resolveBrowserName(undefined, installed('firefox', 'chromium')),
    ).toBe('firefox');
  });

  test('falls back to Chromium when Firefox is missing', () => {
    expect(resolveBrowserName(undefined, installed('chromium'))).toBe(
      'chromium',
    );
  });

  test('keeps Firefox when neither is installed', () => {
    expect(resolveBrowserName(undefined, installed())).toBe('firefox');
  });

  test('follows E2E_BROWSER', () => {
    expect(resolveBrowserName('chromium', installed('firefox'))).toBe(
      'chromium',
    );
  });

  test('rejects an unknown browser', () => {
    expect(() => resolveBrowserName('webkit', installed())).toThrow(
      'E2E_BROWSER',
    );
  });
});
