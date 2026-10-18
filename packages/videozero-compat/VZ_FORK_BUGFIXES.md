# VZ fork bugs fixed in the canvas-commons port

Scope: the VideoZero motion-canvas fork at `f3818c6e` (branch `videozero` /
`claude/ecstatic-planck-121d2j`, `/home/user/motion-canvas`), checked against
the fixes on the `cc/*` branches and `videozero-cc`. All paths below are
relative to `/home/user/motion-canvas/packages/`, and line numbers are at
`f3818c6e`.

## How this was verified

`npm ci --ignore-scripts` was run in the VZ checkout, and `core` and `2d` were
built (`packages/*/lib` is gitignored, so the working tree is still clean). The
cc regression tests were adapted to the VZ API and run against the VZ sources
with a separate vitest harness:

- Harness: a separate vitest setup (kept outside the repo) (vitest config,
  `mock.ts`, 14 test files).
- Run it with:
  `cd /home/user/reports/vz-bugfix-tests && ESBUILD_BINARY_PATH=<linux esbuild 0.18.20> ./node_modules/.bin/vitest run arc attribution build echarts flip gradient latex media nullorigin rc.test rig shiki t3d`
  - `node_modules` is a symlink to the VZ install.
  - VZ's lockfile has no linux esbuild binary, so one has to be installed
    separately and passed in with `ESBUILD_BINARY_PATH`.
  - Run `icon.test.tsx -t "reports a missing"` on its own. The whole file loops
    on VZ.
- Result on VZ: **33 failed, 13 passed, 5 skipped**.
  - Every failure is one of the bugs below.
  - The passes are controls, or cases where VZ is not affected.
  - The skips need a browser layout or echarts 6.1, which jsdom and VZ's echarts
    6.0 don't have. Each skip carries a comment saying why.
- Bugs that need WebGL, a real canvas, ffmpeg or `getComputedStyle` on SVG were
  checked by reading the code. They are marked "code-verified" below.

## Summary (sorted by severity)

| #   | Bug                                                                                                                                                                                                                                     | Severity                                                                 | Status                                            | Fix on cc                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Attribution sanitizer: single-quoted `href` containing `"` breaks out of the attribute                                                                                                                                                  | **security** (XSS if the host app `innerHTML`s `ParsedAttribution.html`) | reproduced                                        | cc/attribution `990a62f1`                                                |
| 10a | Transform3D crashes when WebGL is unavailable (`getContext('webgl')!`)                                                                                                                                                                  | crash                                                                    | reproduced                                        | cc/transform3d `8a1c3b43`                                                |
| 6d  | `Curve.build()` on a gradient or pattern fill throws `unknown format: [object Object]`                                                                                                                                                  | crash                                                                    | reproduced                                        | cc/build-animation `131203ca`                                            |
| 12a | `locomotion(rig, {speed: []})` throws                                                                                                                                                                                                   | crash                                                                    | reproduced                                        | cc/rig `6ce279f4`                                                        |
| 7c  | CSS gradient with an unparseable stop colour passes the parser and throws at draw time                                                                                                                                                  | crash                                                                    | reproduced                                        | cc/css-gradient `223a95df`                                               |
| 17a | `Img` with a relative `src` on a null-origin (sandboxed) page: `new URL(key)` throws, `image()` is `undefined`                                                                                                                          | crash/error                                                              | reproduced                                        | cc/media `ea4b7583`                                                      |
| 10b | Transform3D leaks one WebGL context per node instance (no `dispose`). Browsers drop the oldest after about 16, which can include the shared shader context                                                                              | visible (blank 3D or shader output in long sessions or many nodes)       | code-verified (+ test that `dispose` is missing)  | cc/transform3d `8a1c3b43`                                                |
| 3   | Missing Img/Video is evicted from the pool on error, so it is requested again and warned again on every recompute. A promise is pending every frame ("Tried to access an asynchronous property…"), and `render()` repeats 10× per frame | visible + perf (export does 10 failed requests per frame)                | reproduced (30 frames → 30 elements, 30 warnings) | cc/media `ae6f8810` (+`16ff258a`)                                        |
| 9   | `ResourceCache` keeps a rejected promise forever. A failed Icon logs an error and leaves a pending promise on every frame (10× per frame in `render`)                                                                                   | visible (log flood) / dev                                                | reproduced                                        | cc/resource-cache `753d7e1d`, `9cbe1fd5`                                 |
| 11a | Preview sound gain uses power (`10^(dB/10)`), export uses amplitude (`dB` in ffmpeg `volume`). Preview loudness differs from export (−6 dB: 0.25 vs 0.50)                                                                               | visible (audible)                                                        | code-verified                                     | cc/audio `68464ad1` (`decibelsToAmplitude`)                              |
| 11b | `Sound.fadeIn/fadeOut` only in preview; the FFmpeg export ignores them                                                                                                                                                                  | visible (audible, exports)                                               | code-verified                                     | cc/audio `68464ad1`                                                      |
| 7a  | `conic-gradient(from X)` is 90° off (starts at 3 o'clock instead of 12)                                                                                                                                                                 | visible                                                                  | reproduced                                        | cc/css-gradient `223a95df`                                               |
| 7b  | CSS gradient stop parsing: named colours outside a 24-name allowlist (`gold`, `coral`, `rebeccapurple` …) are taken as config and dropped. Two-position stops (`red 10% 30%`) lose a stop. Conic stops in `deg` are ignored             | visible                                                                  | reproduced                                        | cc/css-gradient `223a95df`                                               |
| 6a  | Curve with `start > end` and `end = 0` (reversed) is not drawn at all                                                                                                                                                                   | visible                                                                  | reproduced (control with same geometry draws)     | cc/build-animation `131203ca` (no early return)                          |
| 6b  | `Latex.build(d)` finishes after ≈ half of `d` (stagger uses `overlap` instead of `1-overlap`)                                                                                                                                           | visible                                                                  | reproduced (build(4) took 2.03 s)                 | cc/build-animation `131203ca`                                            |
| 6c  | `Latex.build` overwrites every glyph fill with `String(fill)`: drops the `currentColor` binding (later `tex.fill(...)` does nothing) and turns a gradient into `"[object Object]"`, so the glyphs go transparent                        | visible                                                                  | reproduced (raw fill is a string after build)     | cc/build-animation `131203ca`                                            |
| 6e  | `SVG.build/unbuild` fill `fill="none"` shapes with the SVG's fill, and hand back resolved values instead of the authored signals (loses `currentColor` binding)                                                                         | visible                                                                  | code-verified                                     | cc/build-animation `131203ca`                                            |
| 6f  | `Curve.build` restores the resolved fill value instead of the raw signal                                                                                                                                                                | visible                                                                  | reproduced                                        | cc/build-animation `131203ca`                                            |
| 6g  | Rough mode: path data ignores a later `start`/`end` change (non-reactive `isInitial()`)                                                                                                                                                 | visible (rough.js only)                                                  | reproduced (Line)                                 | cc/build-animation `8f02efed`                                            |
| 5a  | `EChart.theme(null)` after a theme is ignored                                                                                                                                                                                           | visible                                                                  | reproduced                                        | cc/echarts `9dddf771`                                                    |
| 5b  | Changing `devicePixelRatio`/`chartScale` recreates the chart from `initialOption`: later `setOption`s are lost and the intro animation replays                                                                                          | visible                                                                  | reproduced                                        | cc/echarts `9dddf771`                                                    |
| 5c  | `EChart.dispatchAction` before the chart's first draw/`setOption` is silently dropped                                                                                                                                                   | visible                                                                  | reproduced (control passes)                       | cc/echarts `9dddf771`                                                    |
| 13a | `tweenFlip` adds the parent-space delta to `translate`, which is applied after the node's own rotation and scale. Scaled or rotated nodes take a wrong path (scale 2 ⇒ twice the distance)                                              | visible (mid-animation)                                                  | reproduced (scale 1 passes, scale 2 fails)        | cc/layout-flip-fixes `441624df`; shim `/home/user/reports/AnimLayout.ts` |
| 13b | `tweenFlip` writes back resolved `desiredSize` instead of the raw `width`/`height` signals, so signal-bound sizes are frozen                                                                                                            | visible                                                                  | reproduced                                        | shim `AnimLayout.ts` (`restoreRaw`)                                      |
| 14a | Latex `tex`/`map` tween leaves `wrapper.scale` as a fixed value. Later `fontSize`/size changes no longer rescale the formula                                                                                                            | visible                                                                  | reproduced                                        | cc/latex `3d794a28`                                                      |
| 14b | Latex `splitFragments`: an unclosed `{{` silently drops the rest of the formula (`'a{{b'` → `['a']`)                                                                                                                                    | visible                                                                  | reproduced                                        | cc/latex `fc0e1532`                                                      |
| 15  | `ArcSegment` scales the local radius but not `this.radius` when the radius is too small. Profile drawing (`ellipse`) and `getPoint` use the wrong ellipse, and the caller's `Vector2` gets mutated                                      | visible (SVG/Path arcs with `start`/`end`/arrows/build)                  | reproduced                                        | cc/arc-segment-radius `3bdf7a15` (upstream bug, new branch)              |
| 2   | Attribution credit size divides by full world scale, which includes the view's resolution scale. The credit is half size at scale 2 and double at 0.5                                                                                   | visible (when resolutionScale ≠ 1)                                       | reproduced                                        | cc/attribution `990a62f1`                                                |
| 4a  | Shiki `initialize()` returns `true` while still loading (`null !== undefined`)                                                                                                                                                          | visible (unhighlighted frames possible)                                  | reproduced                                        | cc/shiki `bf43986f`                                                      |
| 4b  | Shiki highlights embedding grammars with `lang[0]`: HTML is highlighted as JavaScript                                                                                                                                                   | visible                                                                  | reproduced                                        | cc/shiki `bf43986f`                                                      |
| 4c  | Shiki `tokenize` returns `[]` while loading, and drops `\r` (not lossless)                                                                                                                                                              | visible (code tweens in the first frames)                                | reproduced                                        | cc/shiki `bf43986f`                                                      |
| 4d  | Shiki default `tokenizeTimeLimit` (500 ms) truncates lines under load                                                                                                                                                                   | visible (rare, load-dependent)                                           | reproduced (mocked clock)                         | cc/shiki `a797145d`                                                      |
| 12b | Rig `parseCharacterSvg` viewBox: leading space gives 5 numbers, and a short or malformed one gives `NaN`                                                                                                                                | visible                                                                  | reproduced                                        | cc/rig `423b589a`                                                        |
| 10c | Transform3D cast shadow `globalAlpha = shadowOpacity` (ignores node/parent opacity)                                                                                                                                                     | visible (shadow doesn't fade)                                            | code-verified                                     | cc/transform3d `8a1c3b43`                                                |
| 16  | ScenePlayback: exported frame shows the previous inner frame (async render not awaited)                                                                                                                                                 | visible (exports)                                                        | code-verified, known limitation                   | **not fixed** (documented in cc `671bed27`)                              |
| 5d  | EChart zrender clock: `_time` set before `anim.start()` overwrites it with `Date.now()`, so the first delta is about −1.8e12 ms                                                                                                         | low (only paused clips and `frame` listeners use delta)                  | code-verified                                     | cc/echarts `9dddf771`                                                    |
| 8   | SVG `stroke-dasharray="none"` → `null` → inherits the parent's dash                                                                                                                                                                     | low (edge case)                                                          | code-verified                                     | cc/svg-rendering `102b9ed0`                                              |
| 17b | `logGlslError`: `new URL(relative)` throws on null-origin pages and hides the real GLSL error                                                                                                                                           | dev-only                                                                 | code-verified                                     | cc/media `ea4b7583`                                                      |

**Not affected in VZ (no patch needed):**

- `"5, 3"` dash arrays → NaN, and `%` dashes (VZ filters empty tokens and uses
  `.some`).
- Rig part with a missing pivot reference (guarded by `this.joints[...]`).
- Latex `{{\frac{a}{b}}}` splitting (VZ `33bc3825` already counts braces;
  passes).
- Latex tween resetting explicit width/height (VZ `47e5ba24` tweens only
  automatic dimensions).
- Video `clampTime` NaN, `Code` web-font wait, camera `followCurve` space,
  shader signal props, linear shader sampling, ffmpeg frame order, failed media
  stopping the scene. VZ already has these fixes; the cc commits are ports of
  them.
- `textWrap: 'balance'` flicker: CC-only. VZ uses the browser's CSS
  `text-wrap: balance`.
- d3-geo collapsed polygons and the three gradient fill box: VZ had these right;
  they were lost in the port and restored on cc.

---

## 1. Attribution sanitizer XSS (security)

- **Symptom:**
  `sanitizeAttributionHtml('<a href=\'https://x/" onclick="alert(1)\'>J</a>')`
  returns `<a href="https://x/" onclick="alert(1)" target=…>`. The `"` inside a
  single-quoted href closes the attribute and injects a handler.
- **Trigger:** a `vz_attribution` URL param or a `registerAttribution()` credit
  whose `html` contains such a link. The output is documented as "sanitized HTML
  for rich display in the player UI", so any host that inserts it with
  `innerHTML` runs attacker JS.
  - The credit travels in asset URLs, which may come from stock or upload
    pipelines.
- **Where:** `2d/src/lib/utils/Attribution.ts:328-333`. `escapeText` does not
  escape `"`. Lines 370-377 interpolate the href into `href="…"`.
- **Fix ref:** cc/attribution `990a62f1`. The sanitizer escapes `"` as `&quot;`.
  Test: "does not let a link break out of its href".
- **Patch:**

  ```diff
  -      const safeHref = escapeText(href.trim());
  +      const safeHref = escapeText(href.trim()).replace(/"/g, '&quot;');
  ```

  Optionally also escape `"` in `escapeText` itself, for text nodes.

- **Verified:** `attribution.test.tsx` fails on VZ, with the exact output above.

## 2. Attribution credit size with resolution scale ≠ 1

- **Symptom:** the credit is 14 px tall in scene units only at
  `resolutionScale = 1`. At 2 it is half size (14 device px). At 0.5 it is
  double size, and the 20 % area rule hides it more often.
- **Trigger:** preview or export with a resolution scale other than 1. `Scene2D`
  sets `view.scale(resolutionScale)` at `2d/src/lib/scenes/Scene2D.ts:189`.
- **Where:** `2d/src/lib/utils/Attribution.ts:504-515`.
  `worldScale = hypot(localToWorld)` includes the view scale, so
  `drawScale / worldScale` cancels the resolution scale.
- **Fix ref:** cc/attribution `990a62f1`. It uses
  `view.worldToLocal().multiply(node.localToWorld())`.
- **Patch:** widen `AttributionNode.view()` to
  `{size(): {y: number}; worldToLocal(): DOMMatrix}`, then:

  ```diff
  -  const ltw = node?.localToWorld();
  +  const ltw = node
  +    ? node.view().worldToLocal().multiply(node.localToWorld())
  +    : undefined;
  ```

- **Verified:** "scales with the resolution of the view" fails on VZ (14 instead
  of 28). "reference size" passes.

## 3. Missing Img/Video requested and warned every frame

- **Symptom:** for a missing asset:
  - a new `<img>`/`<video>` and an HTTP request on every recompute;
  - one `console.warn` per attempt;
  - `GeneratorScene.render` redraws up to 10 times per frame
    (`core/src/scenes/GeneratorScene.ts:170-177`), each waiting for a failing
    request;
  - the scene logs "Tried to access an asynchronous property before the node was
    ready" (`GeneratorScene.ts:269-277`).
- **Trigger:** any Img/Video whose source 404s or is still being generated. The
  error handler deletes the pool entry, `collectPromise` resolves and marks the
  computed dirty, the next `image()` creates a new element, and the cycle
  repeats.
- **Where:**
  - `2d/src/lib/components/Img.ts:179-211` (evict at 186-188);
  - `2d/src/lib/components/Video.ts:182-225` (evict at 189-192).
- **Fix ref:** cc/media `ae6f8810` (on top of `16ff258a`). A failed element
  stays pooled, marked in a `WeakMap<element, assetHash>`, and is retried only
  when `view.assetHash()` changes. That happens on project reload or an assets
  HMR event, which keeps VZ's "ask again next load" intent. The warning moves
  into the error listener, so it fires once per load.
- **Patch (Img; Video is analogous with `${this.key}/${src}` and
  `readyState < 2`):**

  ```ts
  private static readonly failed = new WeakMap<HTMLImageElement, string>();
  // in image():
  const hash = this.view().assetHash();
  let image = Img.pool[key];
  const failedAt = image ? Img.failed.get(image) : undefined;
  if (!image || (failedAt !== undefined && failedAt !== hash)) {
    const created = document.createElement('img');
    created.crossOrigin = 'anonymous';
    created.addEventListener('error', () => {
      Img.failed.set(created, hash);
      console.warn(`[Img] failed to load ${src}; drawn blank`);
    });
    created.src = src;
    Img.pool[key] = image = created;
  }
  if (!image.complete && !Img.failed.has(image)) {
    // collectPromise resolving on load OR error (no warn here)
  }
  ```

- **Verified:** `media.test.tsx`. Over 30 frames VZ creates 30 images and 30
  videos, warns 30 times each, and has a pending promise after every frame.
  Expected: 1, 1, none.

## 4. Shiki highlighter

- **Where:** `shiki/src/ShikiHighlighter.ts`.
  - `initialize()` at 98-114: `handle.value` starts as `null`, so the second
    call returns `true` while loading.
  - `getLangName()` at 116-121 uses `lang[0]`. `@shikijs/langs/html` is
    `[javascript, css, html]`, so HTML is highlighted as JavaScript.
  - `tokenize()` at 172-183 returns `[]` while loading and rebuilds lines with
    `\n`, which drops `\r`.
  - `codeToTokens` calls have no `tokenizeTimeLimit`. Shiki's default of 500 ms
    emits the rest of a slow line as one uncoloured token.
- **Trigger:**
  - Code with `ShikiHighlighter`. Several `Code` nodes sharing one highlighter,
    or a highlighter first initialized outside the render pass, can draw plain
    code.
  - Any embedded-grammar language: html, markdown, jsx/tsx, …
  - Code tweens in the first frames see empty token lists.
  - Heavily loaded render machines truncate highlighting.
- **Fix ref:** cc/shiki `bf43986f` (initialize, main language = last entry,
  `defaultTokenize` fallback, lossless tokenize) and `a797145d`
  (`tokenizeTimeLimit: 0`).
- **Patch:**
  - Keep `private highlighter: HighlighterCore | null` and a
    `loading: Promise | null`.
  - `initialize()` returns `true` only when `highlighter` is set. Otherwise it
    does
    `this.loading ??= createHighlighterCore(...).then(h => (this.highlighter = h))`,
    then `collectPromise(this.loading)`, and returns `false`.
  - Use `langs[langs.length - 1].name`.
  - Pass `tokenizeTimeLimit: 0` to `codeToTokens`.
  - In `tokenize`, return `defaultTokenize(code)` (exported from
    `@motion-canvas/2d`) while loading, and fill the gaps between token offsets
    from `code`.
- **Verified:** all 5 adapted cc tests fail on VZ:
  - `initialize` returns `true` on the second call;
  - `tokenize` gives `''`;
  - the slow line gives `skipAhead` 3 instead of 2;
  - the CRLF text is lost;
  - HTML comments are coloured `#D73A49` (a JS keyword colour) instead of
    `#6A737D`.

## 5. ECharts

- **Where:** `echarts/src/EChart.ts`.
  - **5a:** `applyTheme` at 236-249 skips `setTheme` when the theme is `null`.
  - **5b:** at 146-167 a DPR or scale change disposes the chart and recreates
    it, re-applying only `initialOption` (225-227).
  - **5d:** `anim._time` is set at 194, then `anim.start()` at 214 resets it to
    `Date.now()`.
  - **5c:** `dispatchAction` at 335-341 is guarded by `if (this.chart)`, and the
    chart is created lazily.
- **Trigger:**
  - `chart.theme(null)` to go back to the default theme.
  - Tweening or setting `devicePixelRatio`/`chartScale` after `setOption` calls:
    the chart snaps back to the initial data and replays the intro.
  - Calling `dispatchAction({type:'highlight'…})` right after `view.add`.
- **Fix ref:** cc/echarts `9dddf771`.
  - It snapshots `getOption()` before recreating and re-applies it with
    `animation:false`, then restores `animation`.
  - `setTheme(theme === null ? {} : resolveTheme(theme))`.
  - `dispatchAction` uses `getChartInstance()`.
  - It sets `_time` after `_startLoop()`.
- **Patch:** the four changes above.
  - Remove `if (this.chart)` in `dispatchAction`.
  - In `getChartInstance`, before `dispose()`:
    `const previous = this.chart.getOption();`
  - After init:
    `chart.setOption({...previous, animation:false}); chart.setOption({animation: previous.animation ?? true});`
    Use `initialOption` only on first creation.
  - Move `anim._time = thread.time()*1000` after `anim.start()`.
- **Verified:** `echarts.test.tsx`. "keeps the option when the chart is
  recreated", "switches and resets themes" and "dispatches actions before the
  first draw" fail; the control passes. 5d is code-verified only. echarts only
  uses the frame delta for paused clips, so no render difference was observed.
  The "maps data coordinates" cc test is skipped: it needs echarts 6.1 and VZ
  pins 6.0.0.

## 6. Build animations (Curve / SVG / Latex) and rough clipping

- **6a, reversed curve hidden:** `2d/src/lib/components/Curve.ts:620-624`
  returns early when `drawEnd() <= 0`. With `start=0.8, end=0` the visible part
  is 0..0.8 (the profile swaps the two), but nothing is drawn. The empty-path
  case is already handled in `curveDrawingInfo` (374-388).
  - Patch: delete the early return in `drawShape`.
  - Verified: same geometry, `start 0/end 0.8` strokes and `start 0.8/end 0`
    does not.
- **6b, Latex.build too short:** `2d/src/lib/components/Latex.ts:196-198`.
  `sequence(perChild * overlap, …)` with `perChild = d / (n - overlap(n-1))`, so
  the total is about `d·(1+0.3(n-1))/(1+0.7(n-1))`.
  - Patch: `sequence(perChild * (1 - overlap), …)`.
  - Verified: `build(4)` on 10 glyphs takes 2.03 s.
- **6c, Latex.build overwrites glyph fill:** Latex.ts:187 and 200,
  `child.fill(String(child.fill() ?? this.fill() ?? '#ffffff'))`. This drops the
  `currentColor` binding to `tex.fill`, turns a gradient into
  `"[object Object]"` (transparent), and the build restores opacity to `1`
  rather than the original.
  - Patch: don't touch `fill`. Store `opacity()` as well as `scale()` and tween
    back to both.
  - Verified: the glyph fill raw value is a string after build.
- **6d, Curve.build crashes on gradient or pattern fill:** Curve.ts:344,
  `new Color(String(origFill))`.
  - Verified: `Error: unknown format: [object Object]`.
- **6f, Curve.build drops a signal fill:** Curve.ts:355, `this.fill(origFill)`
  restores the resolved value.
  - Verified: after `fill(signal)` + `build()`, changing the signal leaves the
    curve red.
- **Patch for 6d and 6f** (as in cc `131203ca`, `utils/fadeColor.ts`):

  ```ts
  const raw = this.fill.context.raw();
  const current = this.fill();
  const fade = current instanceof Color ? current
    : current instanceof Gradient ? midStopColor(current) : null; // pattern -> null
  const alpha = fade?.alpha() ?? 0;
  if (fade) this.fill(null);
  ... tween: if (fade && p > 0.7) this.fill(fade.alpha(alpha * easeOutSine((p-0.7)/0.3)));
  this.strokeProgress(1);
  if (fade) this.fill.context.setter(raw);
  ```

- **6e, SVG.build/unbuild:**
  - `2d/src/lib/components/SVG.ts:288` records `curve.fill()` (resolved).
  - Line 331: `authored.fill ?? containerFill` gives a `fill="none"` outline
    shape the SVG's fill.
  - Lines 394/405 write the resolved value back.
  - Trigger: `<SVG svg={…} fill="white"/>` with stroked outline paths: after
    `build()` they are filled. After any build, `svg.fill('red')` no longer
    recolours `currentColor` shapes.
  - Patch:
    - Record `curve.fill.context.raw()`, `stroke.context.raw()`, etc.
    - Compute `fade` from the resolved `curve.fill()` after restoring raw.
    - Never fall back to `containerFill`, since a `currentColor` shape already
      carries the bound signal.
    - Restore with `signal.context.setter(raw)`.
  - Status: code-verified. SVG parsing needs real `getComputedStyle`.
- **6g, rough path data not reactive:**
  - `Curve.ts:499` `if (this.drawEnd() < 1 || !this.start.isInitial())`.
  - `Curve.ts:590-599` `requiresProfile()`.
  - `Rect.ts:160`, `Circle.ts:234`, `Polygon.ts:216`.
  - `isInitial()` is not a dependency, so the `@computed getPathData` stays on
    the full path when `start` (or, for Rect/Circle, `end`) changes after the
    first draw.
  - Patch: add
    `protected isClipped() { return this.start() !== 0 || this.drawEnd() !== 1; }`
    and use it in `Curve/Rect/Circle/Polygon.getPathData`. Leave
    `requiresProfile()` for `getPath()`, which is not cached.
  - Fix ref: cc/build-animation `8f02efed`.
  - Verified: Line `start(0.5)` keeps `'M 0 0 L 100 0'`.
- **Fix ref (6a–6f):** cc/build-animation `131203ca` (tests in
  `components/__tests__/build.test.tsx`).

## 7. CSS gradients

- **7a, conic angle:** `2d/src/lib/utils/parseCSSGradient.ts:267`,
  `angle: fromAngleDeg·π/180`. CSS 0° is up, while canvas `createConicGradient`
  0 is +x.
  - Patch: `angle: ((fromAngleDeg - 90) * Math.PI) / 180`.
  - Verified: `conic-gradient(red, blue)` gives 0, expected −π/2.
- **7b, stop parsing:**
  - `looksLikeColor` (48-58) only knows the 24 names in `NAMED_COLORS` (60-65).
    Every leading token that isn't one of them is treated as config:
    - `linear-gradient(45deg, rebeccapurple, red)` → one stop (red);
    - `linear-gradient(gold, coral)` → no stops → `null` → `canvasStyleParser`
      warns and paints transparent.
  - `parseStop` (107-136) ignores a second position and anything except `%`.
    `red 10% 30%` loses a stop, and conic `blue 90deg` gets an evenly spread
    offset.
  - Trigger: agent-written `fill="linear-gradient(...)"` with ordinary CSS
    colour names.
  - Patch:
    - Only `parts[0]` may be config (`to …`, an angle, `from …`, `at …`,
      `circle`/`ellipse`/`closest-*`/`farthest-*`).
    - Validate each stop with `try { new Color(c) }`.
    - Port the stop parser (two positions, `deg`/`turn` for conic) from cc
      `223a95df`.
- **7c, invalid stop crash:** an unknown stop colour goes into the `Gradient`.
  `Gradient.canvasGradient` (`partials/Gradient.ts:273`) calls `new Color(...)`
  at draw time and throws, despite the "never throws" comment in
  `CanvasUtils.ts:16-20`.
  - Patch: validate stops in `parseCSSGradient`. Drop invalid ones; return
    `null` if fewer than one stays.
- **Fix ref:** cc/css-gradient `223a95df`. Note that CC's `canvasStyleParser`
  throws on invalid colours, while VZ deliberately warns and paints transparent.
  Keep VZ's behaviour.
- **Verified:** `gradient.test.ts`, 6 of 6 fail on VZ.

## 8. SVG dash arrays

- VZ already fixed `"5, 3"` → NaN and the `%` check:
  `2d/src/lib/components/SVG.ts:993-1006`.
- Remaining edge case: `value === 'none'` returns `null`, so the child falls
  back to `inheritedStyle.lineDash`. A child with an explicit
  `stroke-dasharray="none"` under a dashed `<g>` ends up dashed.
- Patch: `if (value === 'none') return [];` (cc/svg-rendering `102b9ed0`).
- Low severity. Code-verified; needs browser `getComputedStyle`.

## 9. ResourceCache keeps a rejected promise / Icon error flood

- **Where:**
  - `2d/src/lib/utils/ResourceCache.ts:48-55`: there is no rejection handler, so
    `pending` keeps the rejected promise.
  - `2d/src/lib/components/Icon.ts:109-120` and `139-153`: every recompute calls
    `fetchIconSvg`, gets the same rejected promise, logs `Error fetching icon …`
    (151), and bumps `cacheVersion`, which invalidates `iconSvg` again.
- **Trigger:** an unknown icon name or an offline Iconify. The result is one
  error log per recompute (up to 10 per rendered frame) and a pending promise on
  every frame. A transient failure is never retried until reload.
- **Fix ref:** cc/resource-cache `753d7e1d` ("forgets a failed fetch") and
  `9cbe1fd5` (cache the placeholder for a failed icon, log once).
- **Patch:**
  - `ResourceCache`: `.catch(e => { this.pending.delete(key); throw e; })`.
  - `Icon.fetchIconSvg`: catch inside the fetch callback and return
    `PLACEHOLDER_SVG` there, so the placeholder is cached for that key and the
    error is logged once:

    ```ts
    const logger = useLogger();
    return Icon.cache.request(key, async () => {
      try {
        /* fetch */
      } catch (e) {
        logger.error(`Error fetching icon ${iconId}: ${e}`);
        return PLACEHOLDER_SVG;
      }
    });
    ```
- **Verified:**
  - `rc.test.ts` "forgets a failed fetch" fails.
  - `icon.test.tsx -t "reports a missing"`: 1 fetch, 6 errors over 6 frames, and
    a promise still pending.

## 10. Transform3D

- **Where:** `2d/src/lib/components/Transform3D.ts`.
  - 384-388: `canvas.getContext('webgl', …)!`, then `compileShader(gl, …)`
    throws `Cannot read properties of null` (10a).
  - 543: `getContext('2d')!`.
  - No `dispose()`, so the GL program, buffers, texture and context are never
    released. `Scene2D.reset` (`scenes/Scene2D.ts:64`) disposes nodes and
    recreates them, so every reset, seek-back or replay creates new contexts
    (10b).
  - 682: `context.globalAlpha = shadowOpacity` overrides the inherited alpha
    (10c).
- **Trigger:**
  - Headless or GPU-less rendering, or a browser that refuses WebGL, crashes the
    scene.
  - Long editing sessions, or more than about 16 Transform3D nodes alive at
    once, hit the browser's context cap ("Too many active WebGL contexts. Oldest
    context will be lost"). This blanks earlier nodes and can take down the
    shared context used by shaders.
  - Fading a parent of a Transform3D leaves its shadow at full strength.
- **Fix ref:** cc/transform3d `8a1c3b43`. `createTarget()` returns `null` and
  logs a warning when no context is available, and `draw` then falls back to
  `drawChildren`. `dispose()` deletes resources and calls
  `WEBGL_lose_context.loseContext()`. It uses `globalAlpha *= shadowOpacity`.
- **Patch:** the three changes above:
  - null-check both contexts in the `if (!this.gl)` branch and fall back to
    `this.drawChildren(context)`;
  - add `public override dispose()`;
  - change `=` to `*=` at line 682.
- **Verified:**
  - 10a reproduced: `t3d.test.tsx` gets `TypeError … reading 'VERTEX_SHADER'` at
    `Transform3D.ts:391`.
  - 10b: test confirms there is no own `dispose`.
  - 10c: code-verified.

## 11. Audio gain and fades

- **Where:**
  - `core/src/media/AudioManager.ts:45`: `Math.pow(10, gain / 10)` (power).
  - `ffmpeg/server/FFmpegExporterServer.ts:113-118`: `volume=${gain}dB`
    (amplitude), and no fade filter at all. `fadeIn`/`fadeOut` exist only in
    `AudioManager.updateEnvelope` (54-73).
- **Trigger:** any `sound.gain` ≠ 0. At −6 dB the preview plays at 0.25 and the
  export at 0.50. Any `fadeIn`/`fadeOut` is heard in preview but not in the
  exported MP4. This applies when VZ exports through the ffmpeg exporter.
- **Fix ref:** cc/audio `68464ad1`:
  - `decibelsToAmplitude` (`10^(dB/20)`) for preview;
  - `fadeExpression()` plus an ffprobe duration for a
    `volume='max(0,min(1,(t+from)/fadeIn,(len-(t+from))/fadeOut))':eval=frame`
    filter in the exporter.
- **Patch:** `Math.pow(10, (sound.gain ?? 0) / 20)`. Then copy `fadeExpression`,
  `probeDuration` and the
  `filters.push({filter:'volume', options:{volume:`'${fade}'`, eval:'frame'}})`
  block from `68464ad1`.
- This changes preview loudness (louder for negative dB), so expect user-visible
  differences in existing projects. The export was already correct.
- Code-verified; no test (needs Web Audio and ffmpeg).

## 12. Rig

- **12a:** `rig/src/characters/locomotion.ts:37-38`, `targetSpeedAt` reads
  `keys[0].t` with no length check.
  - Patch: `if (keys.length === 0) return 0;`.
  - Verified: `TypeError … reading 't'`.
- **12b:** `rig/src/svg/parse.ts:66-67`, `vbAttr.split(/[\s,]+/).map(Number)`.
  - `" 0 0 200 300"` gives `[0,0,0,200,300]`, so the art is sized `0×200` and
    misplaced.
  - `"0 0 200"` gives `NaN` sizes.
  - Patch: trim, require exactly 4 finite numbers, else `[0,0,100,100]`
    (`parseViewBox` in cc/rig `423b589a`).
  - Verified.
- **Not affected:** a part with a missing pivot reference. `buildSvgParts` skips
  parts whose `pivotRef` has no joint (`skeleton/rig.ts:143`), and joints exist
  only for defined reference points.

## 13. tweenFlip / FlipState

- **13a:** `2d/src/lib/components/Layout.ts:661-674`. The delta is converted
  into the parent frame and added to `translate`. `translate` is applied after
  the node's own rotation and scale (`localToParent`, 965-971), so a node with
  scale 2 moves twice as far mid-animation, and a rotated node moves sideways.
  The end state is correct because the translate is restored.
  - Patch:
    `node.translate(origTranslates[i].add(desiredLocal.sub(actualLocal).transform(node.localToParent().inverse())))`.
    `Vector2.transform` applies only the linear part.
  - Verified: rendered x mid-flip is 50 for scale 1 and 0 for scale 2 (expected
    50).
- **13b:** 614 records `desiredSize()` (resolved), and 696-697 write it back, so
  `width={() => …}` becomes a constant after the flip.
  - Patch: record `node.width.context.raw()` and `height.context.raw()` before
    locking, then restore with `context.setter(raw)`, or `reset()` when
    `undefined`.
  - Verified: the raw width after the flip is the number 40, not a function.
- **Fix ref:** cc/layout-flip-fixes `441624df` (thawLayout translate mapping)
  and the tested compat shim `/home/user/reports/AnimLayout.ts` (`place()` /
  `restoreRaw()`).

## 14. Latex tweens and fragments

- **14a:** `2d/src/lib/components/Latex.ts:835`,
  `this.wrapper.scale(targetScale, time, …)`, replaces the
  `wrapper.scale(this.wrapperScale)` binding set in `SVG` constructor
  (`SVG.ts:208`). Nothing rebinds it after `tweenTex` (686-697) or `map`
  (811-819). After any `tex(…, d)` or `map()`, changing `fontSize`, `width` or
  `height` resizes the node box but not the formula.
  - Patch: add `this.wrapper.scale(this.wrapperScale);` after
    `this.wrapper.children(this.documentNodes)` in both methods.
  - Fix ref: cc/latex `3d794a28`.
  - Verified: `wrapper.scale.context.raw()` is an object, not a function.
- **14b:** `Latex.ts:127-166`. When no closing `}}` is found, the inner loop
  runs to the end, and `i = j` drops the text after `{{`. `'a{{b'` parses as
  `['a']`, so a typo silently removes the rest of the formula.
  - Patch: if the loop ends without a close, `result.push(input.slice(start))`.
  - Fix ref: cc/latex `fc0e1532`.
  - Verified.
- **Not affected:** `{{\frac{a}{b}}}` and escaped braces both pass. Explicit
  width/height are kept, because `tweenTexSize` (824-866) only tweens and resets
  the automatic dimensions.

## 15. ArcSegment out-of-range radius (upstream; fixed on `cc/arc-segment-radius` `3bdf7a15`)

- **Where:** `2d/src/lib/curves/ArcSegment.ts:35-50`.
  - `this.radius` is set before the SVG radius correction (`L > 1`), which then
    scales the caller's `radius` vector in place.
  - `center` uses the corrected radius, but `getAnglePosition` (114-118), `draw`
    / `context.ellipse` (140-149) and `toSVGCommands` (186) use the uncorrected
    `this.radius`.
- **Trigger:** SVG or `Path` arcs whose radius is smaller than half the chord.
  These are common in icon and exported SVG data.
  - Profile-based drawing is affected: `start`/`end`, arrows, `build()`, and
    `getPointAtPercentage` (labels, camera follow).
  - The arc is drawn as a small ellipse around the right centre, so the shape
    breaks apart.
  - Plain `Path2D` drawing of the full path is fine.
- **Patch:**

  ```diff
  -    this.radius = new Vector2(Math.abs(radius.x), Math.abs(radius.y));
  +    radius = new Vector2(Math.abs(radius.x), Math.abs(radius.y));
       ...
       if (L > 1) {
         const Lsqrt = Math.sqrt(L);
         radius.x = Lsqrt * radius.x;
         radius.y = Lsqrt * radius.y;
       }
  +    this.radius = radius;
  ```

  This also stops mutating the caller's vector. The same bug exists on cc/main
  and `videozero-cc`, so it should go to canvas-commons too.

- **Verified:** `arc.test.ts`. An arc (0,0)→(100,0) with r=10 has its midpoint
  at y=−10; expected ±50.

## 16. ScenePlayback export shows the previous inner frame (known limitation)

- **Where:** `2d/src/lib/components/ScenePlayback.ts:386-410`. `requestFrame`
  renders inside `withIsolatedPromises` and is not awaited. `renderedFrame()`
  (413-434) returns whatever the offscreen canvas holds.
- **Effect:**
  - Each exported frame N shows inner frame N−1, or an older one if rendering is
    slow.
  - The first frame is blank.
  - Requests made while a render is in flight are dropped.
- **Status:** present in VZ and in cc `1df06ff6`, documented as "until a frame
  is ready, the previous one is shown" (`671bed27`). No fix exists.
- **Suggested patch (untested):** have `requestFrame` return its promise and
  `DependencyContext.collectPromise()` it in `renderedFrame()` when
  `targetFrame !== lastRenderedFrame`. The outer `GeneratorScene.render` loop
  (up to 10 iterations) then waits for the inner frame before the exporter grabs
  the canvas.

## 17. Other VZ bugs found in the cc fixes

- **17a, Img on null-origin pages:** `2d/src/lib/components/Img.ts:161`.
  - On a sandboxed (`origin === "null"`) page, `new URL(key)` is used without a
    base, so any relative `src` (`/assets/x.png`, Vite asset imports,
    `/cors-proxy/…` from `viaProxy`) throws `Invalid URL`. The computed swallows
    it and logs it, so `image()` returns `undefined` and drawing fails.
  - The code comment at 162-164 shows VZ does run sandboxed.
  - Fix ref: cc/media `ea4b7583` (`resolveAssetUrl`:
    `try { new URL(key, origin === 'null' ? undefined : origin) } catch { return {key, src: key}; }`).
  - Verified: `nullorigin.test.tsx`.
- **17b, `logGlslError` on null-origin pages:**
  `core/src/app/SharedWebGLContext.ts:154`. Same `new URL(relative)` pattern, so
  a shader compile error turns into an `Invalid URL` exception and the GLSL
  message is lost.
  - Dev-only.
  - Fix ref: cc/media `ea4b7583` (try/catch, keep the raw url).
- Also in the reports and already covered above: 14b (Latex unclosed `{{`) and
  7b/7c (gradient stop parsing).
