import {toMatchImageSnapshot} from 'jest-image-snapshot';
import {Page} from 'playwright';
import {fileURLToPath} from 'url';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {browserName, getSharedBrowser} from './app';
import {openScene, renderFrame} from './helpers/render';
import {testFrames} from './testFrames';

expect.extend({toMatchImageSnapshot});

// Only Firefox renders the committed baselines; other browsers compare
// against local ones of their own.
const Browser = browserName();
const SnapshotsDir =
  Browser === 'firefox'
    ? undefined
    : fileURLToPath(
        new URL(`./__image_snapshots__/${Browser}`, import.meta.url),
      );

// Chromium builds without proprietary codecs can't decode these, unlike the
// Firefox that renders the committed baselines.
const RequiredVideo = new Map([
  ['media-video', 'video/mp4; codecs="avc1.42E01E"'],
]);

async function canPlay(type: string): Promise<boolean> {
  const page = await (await getSharedBrowser()).newPage();
  try {
    return await page.evaluate(
      type => document.createElement('video').canPlayType(type) !== '',
      type,
    );
  } finally {
    await page.close();
  }
}

const Unplayable = new Set<string>();
for (const [sceneName, type] of RequiredVideo) {
  if (!(await canPlay(type))) {
    console.warn(`Skipping ${sceneName}: ${Browser} can't play ${type}.`);
    Unplayable.add(sceneName);
  }
}

for (const [sceneName, frames] of Object.entries(testFrames)) {
  describe.skipIf(Unplayable.has(sceneName))(sceneName, () => {
    let page: Page;

    beforeAll(async () => {
      page = await openScene(sceneName);
    });

    afterAll(async () => {
      await page?.close();
    });

    test.each(frames)('frame $label', async ({frame, label}) => {
      const buffer = await renderFrame(page, sceneName, frame);
      expect(buffer).toMatchImageSnapshot({
        customSnapshotIdentifier: `${sceneName}-${label}`,
        customSnapshotsDir: SnapshotsDir,
      });
    });
  });
}
