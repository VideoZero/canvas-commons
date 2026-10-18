# canvas-commons pull request branches

Every VideoZero change ported to canvas-commons lives on its own `cc/*` branch
in `VideoZero/motion-canvas`, each a candidate pull request to
[canvas-commons](https://github.com/canvas-commons/canvas-commons). Unless
noted, a branch is based on canvas-commons `main` at `cbdf1987`. `videozero-cc`
merges all of them plus this package.

Before submitting, read the canvas-commons
[AI policy](https://github.com/canvas-commons/.github/blob/main/AI_POLICY.md)
yourself: it asks for an accepted issue before a PR, and for an `Assisted-by:`
trailer instead of a `Co-Authored-By:` trailer naming a model. The commits here
still carry `Co-Authored-By`/`Claude-Session` trailers and have to be reworded
before they go upstream.

Each branch has a before/after clip rendered by `packages/vz-showcase` (branch
`vz/showcase`, `render.sh`).

## Stacks

Submit the base first; the stacked branch's PR then only shows its own commits.

- `cc/svg-rendering` ← `cc/css-gradient`
- `cc/svg-rendering` ← `cc/build-animation` (also carries a cherry-pick of
  `cc/zero-length-curves`; drop it once that one is merged)
- `cc/view-chain` ← `cc/three`
- `cc/layout-flip-fixes` ← `cc/ignored-position-warning`
- `cc/layout-reorder` ← `cc/layout-animation-docs`

## Branches

| Branch                        | Kind    | What it does                                                                                                                                                            |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cc/layout-flip-fixes`        | fix     | Flex children keep their size during animated add/insert/remove and `editLayout`; `thawLayout` animates; cancelled layout tweens release the lock                       |
| `cc/zero-length-curves`       | fix     | An empty curve draws no cap dot                                                                                                                                         |
| `cc/camera`                   | fix     | `followCurve*` in scene space; shared camera scenes drawn by the right camera                                                                                           |
| `cc/media`                    | fix     | Null-origin asset URLs, no hash on data/blob URLs, failed media not pooled, a missing image or video no longer fails the scene                                          |
| `cc/ffmpeg`                   | fix     | Frames reach FFmpeg in order; the export ends after the last frame                                                                                                      |
| `cc/shaders`                  | fix     | Linear shader texture sampling; shader props accept signals                                                                                                             |
| `cc/resource-cache`           | fix     | `ResourceCache`; a missing Icon is fetched and logged once                                                                                                              |
| `cc/latex`                    | fix+    | Brace-balanced `{{…}}` fragments, size tweens keep explicit sizes, fragment shape/box queries, `eagerValidation`                                                        |
| `cc/svg-rendering`            | fix+    | Unmeasurable SVGs (Safari), stylesheet paint, `<use>` styles, dash parsing, `SVG.defaultMorpher`                                                                        |
| `cc/css-gradient`             | feature | CSS gradient strings for fill/stroke; SVG gradients                                                                                                                     |
| `cc/build-animation`          | feature | `build()`/`unbuild()` on curves, SVG and Latex; rough shapes clip to start/end                                                                                          |
| `cc/text-animations`          | feature | `Txt.split('line')`, `splitPieces()`, `splitText()` (`followStyle`) and text entrance/exit helpers                                                                      |
| `cc/text-center`              | feature | `Txt.textCenter` (`line`/`cap`/`ink`)                                                                                                                                   |
| `cc/text-wrap-balance`        | feature | `textWrap="balance"`                                                                                                                                                    |
| `cc/text-smoothing`           | feature | `Txt.smooth`/`Txt.defaultSmooth`: sub-pixel smooth text (Chromium snaps glyphs vertically to whole pixels)                                                              |
| `cc/txt-line-overlap-warning` | feature | Opt-in warning when a Txt's lines overlap                                                                                                                               |
| `cc/text-fix-regressions`     | tests+  | Regression tests for spaced/RTL text; opt-in `Txt.centerLetterSpacing`                                                                                                  |
| `cc/font-resolver`            | feature | `setFontResolver`, `googleFontsResolver`; `Code` waits for its web font                                                                                                 |
| `cc/layout-reorder`           | feature | `Layout.reorder(order, duration?)`                                                                                                                                      |
| `cc/layout-animation-docs`    | docs    | "Animated layouts" section of the layouts guide, with the `layout-animations` and `layout-reorder` examples                                                             |
| `cc/line-align-children`      | feature | `Node.childrenToLocal()` hook; `Curve.alignChildren`/`rotateChildren`                                                                                                   |
| `cc/view-chain`               | feature | `Node.view()` through parents; layout stops at view boundaries                                                                                                          |
| `cc/transform3d`              | feature | `Transform3D` component                                                                                                                                                 |
| `cc/attribution`              | feature | Media attribution credits; video time clamped before metadata loads                                                                                                     |
| `cc/scene-playback`           | feature | `ScenePlayback` component; `DependencyContext.isolatePromises`                                                                                                          |
| `cc/scenes-recalculated`      | feature | `PlaybackStatus.onScenesRecalculated`                                                                                                                                   |
| `cc/entrance-warning`         | feature | Opt-in warning when a node is visible before its entrance                                                                                                               |
| `cc/ignored-position-warning` | feature | Opt-in warning when a layout child's `x`/`y`/`position` is ignored; layout animations restore children's `x`/`y`; `transitionTo` out of a layout keeps its end position |
| `cc/audio`                    | feature | Sound fades (preview and both exporters), `addAt`, fixed seek lead-in, NaN durations                                                                                    |
| `cc/easings`                  | feature | Expressive easings                                                                                                                                                      |
| `cc/e2e-chromium-fallback`    | tooling | e2e falls back to Chromium with its own git-ignored baselines                                                                                                           |
| `cc/ignore-ds-store`          | tooling | Ignore `.DS_Store`                                                                                                                                                      |
| `cc/three`                    | package | `@canvas-commons/three`                                                                                                                                                 |
| `cc/d3-geo`                   | package | `@canvas-commons/d3-geo`                                                                                                                                                |
| `cc/echarts`                  | package | `@canvas-commons/echarts` (two changesets; merge them before the PR)                                                                                                    |
| `cc/shiki`                    | package | `@canvas-commons/shiki`                                                                                                                                                 |
| `cc/rig`                      | package | `@canvas-commons/rig`                                                                                                                                                   |

The new packages touch the same root files (scripts, commitlint scopes,
AGENTS.md, the changeset `fixed` group, the lockfile), so whichever lands second
needs a trivial rebase.

## Checked

On every branch: build, typecheck, prettier, eslint, its package tests and
`pnpm docs:build`. On `videozero-cc`: all of that plus the full test suite and
the e2e suite in Chromium against baselines rendered on canvas-commons `main`
(identical). The Firefox e2e suite CI runs could not be run here.

## Open decisions

- `alignItems="baseline"` doesn't align text baselines in canvas-commons (Yoga
  has no baseline callback). VideoZero scenes relying on it render differently.
- Letter-spaced, shrink-wrapped text sits `letterSpacing / 2` off centre in
  canvas-commons by design (CSS); `Txt.centerLetterSpacing` is opt-in.
- `ArcSegment` scales its local radius but not `this.radius` for out-of-range
  radii (pre-existing upstream bug, not fixed).
- `ScenePlayback` renders inner frames asynchronously, so an export can show the
  previous inner frame (as in VideoZero).
