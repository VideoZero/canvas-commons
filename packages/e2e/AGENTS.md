# @canvas-commons/e2e

End-to-end tests that exercise the full pipeline: vite plugin, editor, renderer,
and player. Drives Playwright against a real Vite server and compares rendered
frames to checked-in snapshots with `jest-image-snapshot`.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm e2e:test          # vitest run inside this package
pnpm --filter @canvas-commons/e2e run dev    # vite dev server (rarely needed)
```

The suite shares a Vite server and headless Firefox across the entire run. A
scene render plus snapshot compare costs ~2–5s per frame after the first; the
first scene navigated to pays an extra ~3–10s for dep optimization depending on
what the scene imports (MathJax, CodeMirror, etc).

### Browser

The committed baselines are rendered by Firefox, which CI uses. When the Firefox
build Playwright expects isn't installed, the suite falls back to Chromium and
warns. Pick one explicitly with `E2E_BROWSER=firefox|chromium`, and point at a
browser installed outside Playwright's cache with `E2E_FIREFOX_EXECUTABLE` /
`E2E_CHROMIUM_EXECUTABLE`:

```bash
E2E_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm e2e:test
```

Chromium renders differently, so it compares against its own baselines in
`src/__image_snapshots__/chromium/`, which are git-ignored: the first run writes
them. To check a branch for rendering changes without Firefox, run the suite on
`main` first, then on the branch. Scenes whose video the browser can't decode
(H.264 in Chromium builds without proprietary codecs) are skipped.

### Running a subset

The full suite takes ~3–4 minutes. When you're iterating on one scene, pass
Vitest a filter so it only runs the relevant `describe` block. The shared
browser and Vite server still boot (~10s) but everything else is skipped.

```bash
# One scene (matches the `describe(sceneName)` block in scenes.test.ts):
pnpm --filter @canvas-commons/e2e test -t quickstart

# One file:
pnpm --filter @canvas-commons/e2e test src/player.test.ts

# A single frame:
pnpm --filter @canvas-commons/e2e test -t "quickstart > frame peak"
```

Always rerun the full suite before committing snapshot changes — filtered runs
won't catch knock-on regressions in other scenes.

### Regenerating snapshots for CI

Canvas rendering is not pixel-identical across operating systems — fonts, GPU
drivers, and color profiles all leak through. Snapshots committed from a Windows
or macOS dev machine will diff against the CI Linux+Firefox run.

To keep CI green, regenerate baselines inside the same container CI uses:

```bash
pnpm --filter @canvas-commons/e2e run test:docker
```

This builds a local image from `packages/e2e/Dockerfile.test` (Playwright's
Jammy image with Node 22 layered on, matching `.github/workflows/verify.yml`)
and runs `pnpm run e2e:test` inside it.

Requires Docker. First build pulls the Playwright image (~1.5 GB).

## Traps

**Image snapshots are checked into git.** If your change alters rendered output,
regenerate the affected snapshots and commit them. Don't regenerate everything
at once; verify each diff is intentional, especially anti-aliasing or sub-pixel
changes that can creep in across GPU/OS variations.

**This package depends on a working ffmpeg binary indirectly.** The render flow
goes through the vite plugin and may invoke `@canvas-commons/ffmpeg`. If exports
fail with binary-not-found errors, reinstall to fetch the correct platform
binary.

**The single Firefox is shared across tests.** Don't `browser.close()` in a test
— close the page only.

## Don't touch without thinking

- `src/__image_snapshots__/`: only update with intent. Diffs are the test
  signal.
- `src/globalSetup.ts`: the Vite/Playwright handshake and pre-warm. Removing the
  pre-warm reintroduces a reload-mid-test failure mode.
- `tests/projects/*.meta`: editor-authored; corrupting one breaks rendering for
  that scene.
- The pinned `playwright` version.

## Adding new scene coverage

The bias is **use existing examples as fixtures**:

1. Add a scene to `packages/examples/src/scenes/<name>.tsx` if no existing
   example exercises it.
2. Make sure it's registered in `packages/examples/vite.config.ts`.
3. Add a wrapper at `packages/e2e/tests/projects/<name>.ts`.
4. Add an entry to `src/testFrames.ts` with the frames you care about.
5. Run `pnpm e2e:test` to generate baselines; eyeball each PNG.
6. Commit scene + wrapper + baselines together.

## Used in the wild

Not consumed outside the repo. CI runs `pnpm e2e:test` as the final integration
check.

When a `core` or `2d` change affects rendering, the e2e suite is what catches
it. The expected workflow:

1. Make the change.
2. Run `pnpm e2e:test`. If snapshots fail, inspect the diff under
   `src/__image_snapshots__/` versus the rendered output in `output/`.
3. If the diff is intentional, regenerate the affected snapshots (delete the
   PNG, re-run) and commit them with a message explaining why they changed.
4. If the diff is unintentional, you've found a regression. Fix and re-run.
