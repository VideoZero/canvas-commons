# Migrating from the VideoZero fork to `videozero-cc`

This guide moves a project from the VideoZero fork of Motion Canvas
(`@motion-canvas/*`, branch `videozero`, last commit `f3818c6e`) to
`videozero-cc`: Canvas Commons with all VideoZero ports merged, plus the private
compatibility package `@videozero/compat`.

The compatibility package covers **only the VideoZero shorthands** (`AnimTxt`,
`AnimLayout`, `HStack`/`VStack`), **VideoZero defaults** that Canvas Commons
exposes as public settings (`applyVideoZeroDefaults`) and the ones kept by a
subclass (`AnimLatex`). Every other difference is a breaking change, listed
below with the fix.

Contents:

1. [Packages and imports](#1-packages-and-imports)
2. [VideoZero defaults](#2-videozero-defaults)
3. [Text animations: `AnimTxt`](#3-text-animations-animtxt)
4. [Layout animations: `AnimLayout`](#4-layout-animations-animlayout)
5. [Canvas Commons breaking changes](#5-canvas-commons-breaking-changes)
6. [VideoZero breaking changes and behaviour differences](#6-videozero-breaking-changes-and-behaviour-differences)
7. [Codemod checklist](#7-codemod-checklist)

## 1. Packages and imports

| VideoZero                    | videozero-cc                  |
| ---------------------------- | ----------------------------- |
| `@motion-canvas/core`        | `@canvas-commons/core`        |
| `@motion-canvas/2d`          | `@canvas-commons/2d`          |
| `@motion-canvas/ui`          | `@canvas-commons/editor`      |
| `@motion-canvas/vite-plugin` | `@canvas-commons/vite-plugin` |
| `@motion-canvas/ffmpeg`      | `@canvas-commons/ffmpeg`      |
| `@motion-canvas/player`      | `@canvas-commons/player`      |
| `@motion-canvas/create`      | `@canvas-commons/create`      |
| `@motion-canvas/three`       | `@canvas-commons/three`       |
| `@motion-canvas/rig`         | `@canvas-commons/rig`         |
| `@motion-canvas/d3-geo`      | `@canvas-commons/d3-geo`      |
| `@motion-canvas/echarts`     | `@canvas-commons/echarts`     |
| `@motion-canvas/shiki`       | `@canvas-commons/shiki`       |
| `@motion-canvas/internal`    | removed                       |
| —                            | `@videozero/compat` (new)     |
| —                            | `@canvas-commons/webcodecs`   |
| —                            | `@canvas-commons/fiddle`      |

```diff
- import {Txt, Layout, makeScene2D} from '@motion-canvas/2d';
- import {all, waitFor} from '@motion-canvas/core';
+ import {Txt, Layout, makeScene2D} from '@canvas-commons/2d';
+ import {all, waitFor} from '@canvas-commons/core';
+ import {AnimTxt, AnimLayout} from '@videozero/compat';
```

- **Vite plugin**: `import motionCanvas from '@motion-canvas/vite-plugin'` →
  `import canvasCommons from '@canvas-commons/vite-plugin'`
  (`plugins: [canvasCommons()]`). It supports Vite 4, 5, 7 and 8.
- **Editor**: `@motion-canvas/ui` is `@canvas-commons/editor`
  (`makeEditorPlugin`, `./style.css` unchanged).
- **Subpath imports are gone.** Import everything from the package root:
  `@motion-canvas/core/lib/...`, `@motion-canvas/core/scenes`,
  `@motion-canvas/2d/lib/components`, `@motion-canvas/2d/components` →
  `@canvas-commons/core` / `@canvas-commons/2d`. Remaining subpaths:
  `@canvas-commons/2d/jsx-runtime`, `/jsx-dev-runtime`, `/editor`,
  `/tsconfig.project.json`, `@canvas-commons/ffmpeg/client|server`,
  `@canvas-commons/echarts/vite`,
  `@canvas-commons/rig/{characters,gaits,ik,svg}`.
- **tsconfig / JSX**: `"jsxImportSource": "@canvas-commons/2d"` and
  `"extends": "@canvas-commons/2d/tsconfig.project.json"`.
- **Node.js 20.19 or newer** is required.
- **Internal names**: custom elements, CSS classes, globals and log prefixes
  `motion-canvas-*` are `canvas-commons-*` (e.g. the player element and the
  three.js renderer canvas).
- **ECharts**: the Vite plugin moved to `@canvas-commons/echarts/vite`, and its
  options type `EchartsPluginOptions` is `EChartsSourcePluginOptions`.
- **d3-geo**: stricter types (`GeoObject` for features passed to the map).
- **three**: the VideoZero host extension `TextGeometry.loadFont` is gone; load
  fonts with three.js' `FontLoader` and pass the font.

## 2. VideoZero defaults

VideoZero changed several defaults of Motion Canvas. Canvas Commons keeps its
own, so a scene that relied on the VideoZero ones renders differently. Call
`applyVideoZeroDefaults()` once, before scenes create nodes (top of
`project.ts`), and `applyVideoZeroViewDefaults(view)` at the start of every
scene:

```ts
// project.ts
import {applyVideoZeroDefaults} from '@videozero/compat';
applyVideoZeroDefaults();
```

```tsx
// scenes/example.tsx
export default makeScene2D(function* (view) {
  applyVideoZeroViewDefaults(view);
  // ...
});
```

`applyVideoZeroDefaults()` returns a function restoring the previous values
(useful in tests). Importing the package never changes a default.

| VideoZero default                                                           | Canvas Commons default               | Covered by                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Txt.defaultTextCenter = 'cap'`                                             | `'line'`                             | `applyVideoZeroDefaults()`                                                                                                                                                     |
| Letter-spaced text centred on its ink (trailing spacing split evenly)       | ink starts at the aligned edge (CSS) | `applyVideoZeroDefaults()` sets `Txt.defaultCenterLetterSpacing = true`                                                                                                        |
| `strokeFirst` `true` on shapes (VideoZero's renderer)                       | `false`                              | `applyVideoZeroDefaults()` (sets the `strokeFirst` metadata default of `Shape`, so every shape, `Txt` included)                                                                |
| `lineJoin: 'round'` on `Txt`                                                | `'miter'`                            | `applyVideoZeroDefaults()` for **`AnimTxt` only** (`AnimTxt.defaultLineJoin`). A plain `Txt` stays `'miter'`: use `AnimTxt` or pass `lineJoin="round"`                         |
| Tight line height warning on (`Layout.warnTightLineHeight`)                 | off (`Txt.warnTightLineHeight`)      | `applyVideoZeroDefaults()` sets `Txt.warnTightLineHeight = true`                                                                                                               |
| Visible-before-entrance warning on (validation runs)                        | off                                  | `applyVideoZeroDefaults()` sets `Node.warnVisibleBeforeEntrance = true`                                                                                                        |
| Ignored-position warning on (`Layout.warnIgnoredPosition`, validation runs) | off                                  | `applyVideoZeroDefaults()` sets `Layout.warnIgnoredPosition = true`                                                                                                            |
| Attribution query parameter `vz_attribution`                                | `attribution`                        | `applyVideoZeroDefaults()` (`configureAttribution({queryParam: 'vz_attribution'})`)                                                                                            |
| Attribution font: rounded stack (`ui-rounded, "SF Pro Rounded", …`)         | `sans-serif`                         | `applyVideoZeroDefaults()`                                                                                                                                                     |
| Default font `Inter, system-ui, sans-serif`                                 | `Roboto`                             | `applyVideoZeroViewDefaults(view)` sets `fontFamily` on the view, which every node inherits. Nodes with `layout={false}` don't inherit: set it on them                         |
| `Latex` fragment box padding `8` (`getFragmentBBox(id)` etc.)               | `0`                                  | `AnimLatex`: `<Latex>` → `<AnimLatex>` (`createRef<AnimLatex>()`). Or pass it: `latex.getFragmentBBox(id, 8)`, `getLocalFragmentBBox(id, 8)`, `getAbsoluteFragmentBBox(id, 8)` |
| `Txt.defaultSmooth = true` (sub-pixel smoothing)                            | `Txt.defaultSmooth = false`          | `applyVideoZeroDefaults()` sets `Txt.defaultSmooth = true`, so every `Txt` (not only `AnimTxt`) paints with `smooth` on                                                        |
| Numeric `lineHeight <= 4` is a multiplier (`1.2` → `120%`)                  | numbers are pixels                   | **not covered**. Write `lineHeight="120%"` (or pixels). `Txt.warnTightLineHeight` reports the forgotten ones                                                                   |
| Literal `\n` (backslash, n) in text is a line break                         | drawn as `\n`                        | **not covered**. Use a real newline: `text={'a\nb'}` or a template literal                                                                                                     |
| `Txt.fonts` / `fontRegistry` alias map (`fontFamily="warmPlayful"`)         | gone                                 | **not covered**. Keep a map in your code and resolve it: `fontFamily={Fonts.warmPlayful}`. For loading undeclared web fonts use `setFontResolver(googleFontsResolver())`       |
| `textWrap` default `false`                                                  | `true` (width-bounded text wraps)    | **not covered**. Pass `textWrap={false}` where text must not wrap                                                                                                              |
| `roundPx` utility                                                           | gone                                 | `const roundPx = (n: number) => Math.round(n * 2) / 2;`                                                                                                                        |

## 3. Text animations: `AnimTxt`

VideoZero added its text helpers to `Txt` itself. In `videozero-cc` they live on
`AnimTxt extends Txt`, with the same names, positional parameters and defaults.
Replace the element for every text animated with a helper:

```diff
- const title = createRef<Txt>();
- view.add(<Txt ref={title} text="Hello" opacity={0} />);
+ const title = createRef<AnimTxt>();
+ view.add(<AnimTxt ref={title} text="Hello" opacity={0} />);
  yield* title().fadeUp();
```

### Helpers

Every helper is a generator, used with `yield*`. Defaults are the VideoZero
ones; `tf` is the timing function, `h` the height of the tallest character (the
line height), `w` the width of the character's line.

| Entrance                                         | Effect                                                              | Built on                                        |
| ------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------- |
| `typewriter(_d = 1.5, stagger = 0.04)`           | characters appear one after another (`_d` unused, as in VideoZero)  | `textTypewriter`                                |
| `fadeUp(d = 0.5, s = 0.03, tf = easeOutCubic)`   | fade in (0.8 d) while rising `0.3 h`                                | `textFadeIn` (`Direction.Top`)                  |
| `fadeDown(d = 0.5, s = 0.03, tf)`                | fade in while dropping `0.3 h`                                      | `textFadeIn` (`Direction.Bottom`)               |
| `fadeLeft(d = 0.5, s = 0.03, tf)`                | fade in while moving left `0.1 w`                                   | `splitText`, custom loop                        |
| `fadeRight(d = 0.5, s = 0.03, tf)`               | fade in while moving right `0.1 w`                                  | `splitText`, custom loop                        |
| `motionUp(d = 0.5, s = 0.03, tf)`                | rise `h` into place, opacity 1 in 0.15 s                            | `splitText`, custom loop                        |
| `motionDown(d = 0.5, s = 0.03, tf)`              | drop `h` into place, opacity 1 in 0.15 s                            | `splitText`, custom loop                        |
| `scaleIn(d = 0.5, s = 0.08, tf = easeOutBack)`   | grow from 0, opacity in 0.4 d                                       | `textScaleIn`                                   |
| `bounceIn(d = 0.5, s = 0.03, tf = easeOutBack)`  | drop `h` into place with overshoot, opacity 1 in 0.15 s             | `splitText`, custom loop                        |
| `revealUp/Down/Left/Right(d = 0.6, tf)`          | all characters slide in from behind their line's mask at once       | `textRevealIn` (`by: 'grapheme'`, `stagger: 0`) |
| `wordByWord(d = 0.4, s = 0.1, tf)`               | words fade in (full d) one after another, rising `0.2 h`            | `splitText`, custom loop                        |
| `lineByLine(d = 0.5, s = 0.15, tf)`              | lines slide up `h` from behind their mask one after another         | `splitText` (clipped), custom loop              |
| `trackingIn(d = 0.7, spread = 0.4, tf)`          | close in on the mean `x` of all characters while fading in          | `splitText`, custom loop                        |
| `waveIn(d = 2, tf)`                              | fade in on a settling sine wave                                     | `splitText`, custom loop                        |
| `rotateIn(d = 0.5, s = 0.04, tf = easeOutCubic)` | spin from 90° and grow from 0.5                                     | `textScaleIn`                                   |
| `scramble(d = 2, tf)`                            | random characters resolve into the text                             | `splitText`, custom loop                        |
| `outline(_d = 0.5, s = 0.04)`                    | outlines in the fill color, then filled                             | `splitText`, custom loop                        |
| `neon(d = 0.5, s = 0.06, tf = easeOutSine)`      | fade in with a growing glow (`shadowBlur` 0 → 20 in the fill color) | `splitText`, custom loop                        |
| `shadowIn(d = 0.5, s = 0.03, tf)`                | rise `0.4 h` with a soft shadow                                     | `splitText`, custom loop                        |

| Exit                                          | Effect                                     | Built on                           |
| --------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| `fadeOut(d = 0.35, tf = easeInCubic)`         | fade all characters out                    | `textFadeOut`                      |
| `fadeOutUp(d = 0.35, s = 0, tf)`              | fade out while rising `0.15 h`             | `textFadeOut` (`Direction.Top`)    |
| `fadeOutDown(d = 0.35, s = 0, tf)`            | fade out while dropping `0.15 h`           | `textFadeOut` (`Direction.Bottom`) |
| `scaleOut(d = 0.3, tf)`                       | fade out while shrinking to 0.8            | `textScaleOut`                     |
| `revealOutUp(d = 0.35, tf)` / `revealOutDown` | slide `h` up/down (not clipped), then hide | `splitText`, custom loop           |
| `trackingOut(d = 0.35, spread = 0.2, tf)`     | close in on the middle while fading out    | `splitText`, custom loop           |
| `swapOut(d = 0.3, tf)`                        | fade out (0.8 d) while rising `h`          | `splitText`, custom loop           |

### Manual splitting

| VideoZero                                                          | `AnimTxt`                                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `txt.split(clip = false, clipPadding = 4)`                         | `txt.splitChars(clip = false, clipPadding = 4)` — `split()` is the Canvas Commons method returning standalone pieces |
| `txt.unsplit()`                                                    | `txt.unsplit()` (also ends the split an entrance left)                                                               |
| `txt.chars: TxtChar[]`                                             | `txt.chars: Txt[]` (read-only getter; filled after an entrance, as in VideoZero)                                     |
| `txt.words: TxtChar[][]`                                           | `txt.words: Txt[][]` (whitespace splits words; so does a line break)                                                 |
| `txt.lineChars(i)`                                                 | `txt.lineChars(i)`                                                                                                   |
| `txt.lineWidths`                                                   | `txt.lineWidths` (without the clip padding)                                                                          |
| `txt.maxCharHeight`                                                | `txt.maxCharHeight`                                                                                                  |
| `txt.saveX()` / `txt.saveY()`                                      | `txt.saveX()` / `txt.saveY()`                                                                                        |
| `txt.isSplit` (protected)                                          | `txt.isSplit` (public getter); `txt.splitResult` gives the underlying `TextSplit`                                    |
| `TxtChar.charLineWidth`                                            | `lineWidth` of the piece                                                                                             |
| `TxtChar.charShadowColor` / `charShadowBlur`                       | `shadowColor` / `shadowBlur` of the piece                                                                            |
| `smooth`, `Txt.defaultSmooth`, `enableSmooth()`, `disableSmooth()` | same methods; `AnimTxt.defaultSmooth` is `Txt.defaultSmooth`; `smooth` is a signal (see below)                       |

`smooth` is now the `smooth` signal of every `Txt` (inherited by nested text and
copied to split pieces): read it with `txt.smooth()` and write
`txt.smooth(false)` or `smooth={false}` instead of `txt.smooth = false`.

```diff
- title().split();
+ title().splitChars();
  yield* sequence(0.05, ...title().chars.map(c => c.scale(1.3, 0.2).to(1, 0.2)));
  title().unsplit();
```

### Behaviour differences

- **Entrances leave the text split, as in VideoZero.** The pieces stay drawn in
  place of the text until the next exit, text change, `unsplit()` or
  `splitChars()`, so the last frame of the entrance stays on screen: swapping
  the pieces back to the source would make ligatures (`fi`, `fl`, `ff`) and
  kerning pairs jump by a pixel or two in one frame. `chars`, `words`,
  `lineChars()` and the other split getters work after an entrance; call
  `unsplit()` to draw the text itself again (at the opacity its pieces had), for
  example before applying `filters`, `shadow*` or `cache` to it, which don't
  reach the pieces. A new entrance replaces the split.
- **The split is drawn by sibling nodes.** While split, the source has `opacity`
  `0` and the pieces are standalone `Txt` nodes mounted right after the source
  (or after its outermost `Txt` ancestor), in a container that follows the
  source's transform. Code that walks `view.children()` during a helper sees
  that container. `filters`, `shadow*` and `cache` of the source are not
  transferred to the pieces.
- **While split, the node itself is at `opacity` `0`**: the pieces' container
  carries the visible opacity (the opacity the node had, or `1` when it started
  at `0`; VideoZero always set `1`). Tweening `opacity` of a split node or
  removing it from the scene doesn't fade the pieces: use an exit or `unsplit()`
  first. Pieces of a node removed from the scene are not drawn.
- **Exits** animate the current split (the entrance's, or one made with
  `splitChars()`), and end with the node at `opacity` `0` and no split, as in
  VideoZero. `fadeOut`, `fadeOutUp`, `fadeOutDown` and `scaleOut` split anew
  when the current split is clipped (`revealUp…`, `lineByLine`), which looks the
  same. A canceled helper removes its split (an entrance shows the node, an exit
  hides it).
- **An entrance on a split node** replaces the split, as VideoZero re-split for
  every entrance.
- **Changing or tweening the text** removes the split (VideoZero fix
  `25000cc3`), and counts as newly shown content for the visible-before-entrance
  warning.
- **`neon()` and `shadowIn()`** keep their final glow/shadow by setting
  `shadowColor`/`shadowBlur` on the text when they end (VideoZero kept them on
  the still-split characters).
- **`scramble()`** draws from the scene's random generator (`useRandom()`), so
  every render shows the same characters (VideoZero used `Math.random`).
- **Headless** (no 2D canvas, e.g. jsdom without a mock): nothing can be split;
  entrances fade the node in and exits fade it out over the duration.
- **`TxtChar` is gone**, and `TxtLeaf` extends `Node` (no styling of its own).
- **Ligatures, letter spacing and right-to-left text** are placed exactly where
  the source draws them (VideoZero fixes `fecd9351`, `fcc7450a`, `fa08c9d3` are
  covered by Canvas Commons' text pipeline). A letter-spaced text whose width
  shrink-wraps its content draws its ink `letterSpacing / 2` further left than
  VideoZero did (the Canvas Commons advance contract).
- **Entrance warning**: with `Node.warnVisibleBeforeEntrance` on, every
  `AnimTxt` entrance warns (once per node) when the text has been visible for
  more than 0.1 s, as VideoZero did. Blank and split text never warn.

### Without `AnimTxt`

The Canvas Commons equivalents, for new code or plain `Txt` nodes:

```ts
import {Direction} from '@canvas-commons/core';
import {
  textFadeIn,
  textFadeOut,
  textRevealIn,
  splitText,
} from '@canvas-commons/2d';

yield * textFadeIn(txt, {direction: Direction.Top}); // ≈ fadeUp()
yield * textRevealIn(txt, {by: 'line', stagger: 0.15}); // ≈ lineByLine()
yield * textFadeOut(txt, {direction: Direction.Top}); // ≈ fadeOutUp() (0.3 h instead of 0.15 h)
```

These entrances also leave `txt` split; `getTextSplit(txt)` returns the split
(`pieces`, `homes`, `lines`, …) and `getTextSplit(txt)?.restore()` draws the
text itself again.

## 4. Layout animations: `AnimLayout`

Replace `<Layout>` with `<AnimLayout>` on containers that use the VideoZero FLIP
shorthands:

```diff
- <Layout ref={list} layout gap={20}>…</Layout>
+ <AnimLayout ref={list} layout gap={20}>…</AnimLayout>
```

| VideoZero (`Layout`)                        | `AnimLayout` | Canvas Commons equivalent                                             |
| ------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `addAnimated(node, d, tf = easeInOutCubic)` | same         | `layout.add(node, d, tf)`                                             |
| `insertAnimated(node, index, d, tf)`        | same         | `layout.insert(node, index, d, tf)`                                   |
| `removeAnimated(child, d, tf)` (on parent)  | same         | `child.remove(d, tf)` (on the child)                                  |
| `reorderAnimated(order, d, tf)`             | same         | `layout.reorder(order, d, tf)`                                        |
| `recordFlipState(recursive = true)`         | same         | —                                                                     |
| `tweenFlip(from, d, tf)`                    | same         | `layout.editLayout(d, l => …, tf)` for changes made inside a callback |
| `lockSize()` / `releaseSize()`              | same         | `lockLayout()` / `releaseLayout()`                                    |
| `layoutRoot()`                              | same         | —                                                                     |

### `HStack` and `VStack`

`HStack` and `VStack` come from the compatibility package; Canvas Commons has no
stack components. They are a `Layout` with `layout` on and `direction` `'row'` /
`'column'`, so `<HStack gap={20}>` is
`<Layout layout direction="row" gap={20}>`. Change the import:

```diff
- import {HStack, VStack} from '@motion-canvas/2d';
+ import {HStack, VStack} from '@videozero/compat';
```

The editor's scene tree shows them with the generic node icon.

### Behaviour differences

- `FlipState` entries are `{computedSize, absolutePosition}`; `desiredSize` is
  gone. `tweenFlip` restores the raw `width`/`height` the nodes had when it
  started (VideoZero restored the recorded `desiredSize`).
- `insertAnimated`/`addAnimated` scale a wrapper around the inserted node
  instead of the node itself; the node's own `scale` is never touched.
- `removeAnimated` keeps the child in place inside the layout while its slot
  collapses, instead of moving it to the view.
- Arrays mixing `Layout` and non-`Layout` nodes: non-`Layout` nodes are inserted
  instantly.
- Fixed, with tests: `basis={0}` items no longer collapse during the animation
  (VideoZero `ff6bda6d`), reparented nodes and nodes under rotated or scaled
  ancestors move on a straight line in world space (`ec19ce66`), canceling an
  animation releases every lock and restores `translate` and sizes. Grown and
  stretched children keep their flex size during `add`, `insert`, `remove` and
  `editLayout`; `thawLayout` animates instead of snapping. `transitionTo` into a
  parent without layout keeps the node where it landed, and layout animations
  leave the `x`/`y` of laid-out children as they were.

## 5. Canvas Commons breaking changes

These come from Canvas Commons itself (see its `docs/migration` pages) and apply
to every Motion Canvas project:

- **`offset` is `anchor`**: `<Rect offset={[-1, -1]} />` →
  `<Rect anchor={[-1, -1]} />`, `offsetX`/`offsetY` → `anchorX`/`anchorY`,
  `node.offset` → `node.anchor` (`moveOffset()` keeps its name).
- **`relativeTo`** returns coordinates in the other node's local space. For the
  old result use `node.position.abs().sub(other.position.abs())`.
- **Layout is computed by Yoga**, not the browser's DOM: `View2D.shadowRoot`,
  `Layout.element` and `Layout.styles` are gone (`Layout.yogaNode`,
  `getDomContainer()` for SVG/arc measuring). `FlexBasis` drops `content`,
  `min-content`, `max-content`, `fit-content`; `LengthLimit` drops `max-content`
  and `min-content`. Small layout differences against browser flexbox are
  possible.
- **Text** uses Canvas Commons' own pipeline (Pretext-derived). `TxtLeaf`
  extends `Node`; styling a `<TxtLeaf>` directly no longer applies — style the
  parent `<Txt>` or nest `<Txt>`. `textWrap` defaults to `true`, so a
  width-bounded `<Txt>` wraps. Line breaking, kerning and centering can differ
  by a pixel or so.
- **`CodeBlock` is removed**: use `Code` (with `LezerHighlighter` or the
  `ShikiHighlighter` of `@canvas-commons/shiki`).
- **Subpath imports are gone** (see [section 1](#1-packages-and-imports)).
- **`LogPayload.remarks` is markdown**, not HTML.
- **Exporting**: the image sequence and FFmpeg exporters remain; a WebCodecs
  exporter (`@canvas-commons/webcodecs`) is new.

## 6. VideoZero breaking changes and behaviour differences

Everything VideoZero added was ported to Canvas Commons. These are the places
where the port differs from the fork.

### 2d: text

- `Txt.split()` returns standalone `Txt` pieces
  (`split('grapheme' | 'word' | 'sentence' | 'line')`, `splitPieces()`), it
  doesn't split the node in place. Use `AnimTxt.splitChars()` or `splitText()`.
- `Layout.warnTightLineHeight` is `Txt.warnTightLineHeight`.
- `Txt.textCenter` exists with the same modes; its default comes from
  `Txt.defaultTextCenter` (`'line'`; VideoZero `'cap'`, see section 2).
- `Txt.fonts`, `fontRegistry`, `resolveFontFamily` are gone (section 2).
- `textWrap: 'balance'` is available as in VideoZero.
- `Code` waits for its web font before drawing.
- `alignItems="baseline"` does **not** align text baselines: Yoga has no
  baseline callback, so a `Txt`'s baseline is its bottom edge. VideoZero (DOM
  layout) aligned real baselines, e.g. a large "42" next to a small "%". Align
  such pairs by hand (e.g. `alignItems="end"` plus a `marginBottom` equal to the
  descent difference) or put them in one `Txt` with nested runs.

### 2d: layout

See [section 4](#4-layout-animations-animlayout). Also `Layout.reorder()` is
new, and a node with its own offscreen view (`view()` override, e.g. `Three`) is
a layout boundary. `HStack`/`VStack` moved to the compatibility package.
`Layout.warnIgnoredPosition` is available as in VideoZero; its remark suggests
`layoutSelf={false}` (Canvas Commons) instead of `layout={false}` or a wrapping
`<Node>`, since a plain `Node` doesn't take a node out of the layout.

### 2d: Latex, SVG, Icon, curves

- `Latex.getChildrenById()` returns a `Node` wrapper; use `getShapesById(id)`
  for the glyph shapes. `getShapes()`, `getFragmentBBox()`,
  `getLocalFragmentBBox()` are available; `getAbsoluteFragmentBBox()` is in
  world space.
- `Latex` fragment boxes have no padding by default (VideoZero `8`): use
  `AnimLatex` (section 2) or pass the padding explicitly.
- `Latex.map()` fades with a different timing, and animates the size like a
  `tex` tween.
- `Latex.build()` takes exactly its duration (VideoZero finished early).
- `{{…}}` fragments may contain braces.
- `Icon.cache` / `Icon.cacheVersion` are gone (shared `ResourceCache`); a
  missing icon is fetched and reported once.
- An invalid color in an SVG style throws (VideoZero: transparent and a
  warning). Fix the color.
- Conic gradients from SVG/CSS are rotated by +90° relative to VideoZero
  (VideoZero was wrong).
- `getElementStyle` has a different signature; `stroke-dasharray: none` is `[]`.
- Many SVG drawing fixes (reversed curves, build stagger, `currentColor`,
  gradient fills in `Curve.build`).

### 2d: media and attribution

- `drawAttribution(context, box, src, node, opacity, clipPath)`: `node` is now
  required and comes before `opacity` (VideoZero:
  `(context, box, src, opacity, node?, clipPath?)`). `AttributionNode` is gone.
- The attribution query parameter is `attribution` unless
  `applyVideoZeroDefaults()` (`vz_attribution`) runs. The attribution sanitizer
  no longer lets a single-quoted `href` containing `"` through (XSS fix). The
  credit scales relative to the view.
- Images and videos that fail to load log a warning and draw blank instead of
  failing the scene; `Video.unavailable` lists them.
- A failed image or video is requested and reported once per asset load.
  VideoZero dropped it from the pool and asked again on the next frame;
  canvas-commons asks again only after an asset change (HMR) or a new project
  load. To retry within one load, change the view's asset hash:
  `view.assetHash(Date.now().toString())`.
- `Video.clampTime` returns `0` (not `NaN`) while the duration is unknown.

### Core

- `withIsolatedPromises` is `DependencyContext.isolatePromises`.
- `ScenePlayback.clampTime` returns the start of the range (not `NaN`) while the
  inner scene's duration is unknown, for non-finite times and for an empty
  range.
- Preview audio gain is an amplitude, not a power: previews sound louder than in
  VideoZero (exports are unchanged).
- `updateEnvelope` is gone (sound fades: `sound(audio).fade(fadeIn, fadeOut)`).
- `Camera` respects the position of its scene.
- New timing functions (`createCubicBezier`, `wiggle`, `anticipate`, …) are
  available as in VideoZero.

### Other packages

- **shiki**: `ShikiHighlighter.initialize()` reports `false` while loading,
  `html` is highlighted as HTML, `tokenize` doesn't return `[]` while loading.
- **echarts**: `theme(null)` resets the theme, recreating a chart on a DPR or
  `chartScale` change keeps later `setOption` calls and doesn't replay the
  intro.
- **three**: rename only, plus the removed `TextGeometry.loadFont`.
- **rig**, **d3-geo**: rename only (d3-geo has stricter types).

## 7. Codemod checklist

Apply in order; each step is mechanical.

1. `package.json`: replace every `@motion-canvas/<pkg>` dependency with
   `@canvas-commons/<pkg>` (`ui` → `editor`), drop `@motion-canvas/internal`,
   add `"@videozero/compat": "workspace:*"`.
2. Replace import specifiers: `s#@motion-canvas/ui#@canvas-commons/editor#g`,
   then `s#@motion-canvas/#@canvas-commons/#g`.
3. Collapse subpath imports:
   `@canvas-commons/(core|2d)/(lib|components|scenes|…)/…` → the package root.
4. `vite.config.ts`: `motionCanvas()` → `canvasCommons()` from
   `@canvas-commons/vite-plugin`.
5. `tsconfig.json`: `jsxImportSource` → `@canvas-commons/2d`, extend
   `@canvas-commons/2d/tsconfig.project.json`.
6. `offset` → `anchor` in props, signals and tweens (`offset={`, `.offset(`,
   `offsetX`/`offsetY` → `anchorX`/`anchorY`; not `moveOffset`).
7. Review every `relativeTo(` call (section 5).
8. Add `applyVideoZeroDefaults()` to `project.ts` and
   `applyVideoZeroViewDefaults(view)` to the top of every scene.
9. For every `Txt` that calls a VideoZero helper (`typewriter`, `fade*`,
   `motion*`, `scaleIn`, `bounceIn`, `reveal*`, `wordByWord`, `lineByLine`,
   `trackingIn/Out`, `waveIn`, `rotateIn`, `scramble`, `outline`, `neon`,
   `shadowIn`, `fadeOut*`, `scaleOut`, `revealOut*`, `swapOut`) or uses
   `chars`/`words`/`lineChars`: `<Txt` → `<AnimTxt`, `createRef<Txt>` →
   `createRef<AnimTxt>`, `new Txt(` → `new AnimTxt(`.
10. `.split()` / `.split(true)` / `.split(clip, padding)` on those nodes →
    `.splitChars(...)`. TypeScript doesn't catch a bare `txt.split();` statement
    (it returns pieces now), so search for it.
11. `charLineWidth` → `lineWidth`, `charShadowColor` → `shadowColor`,
    `charShadowBlur` → `shadowBlur`; `TxtChar` types → `Txt`.
12. For every `Layout` that calls `addAnimated`, `insertAnimated`,
    `removeAnimated`, `reorderAnimated`, `recordFlipState`, `tweenFlip`,
    `lockSize` or `releaseSize`: `<Layout` → `<AnimLayout`, `createRef<Layout>`
    → `createRef<AnimLayout>` (or switch to the Canvas Commons methods of
    section 4).
13. Numeric `lineHeight` values `<= 4` → percentages (`lineHeight={1.2}` →
    `lineHeight="120%"`).
14. Literal `\\n` in text strings → real newlines.
15. `Txt.fonts = {...}` / semantic `fontFamily` names → a constant map in your
    code.
16. Width-bounded `Txt` that must stay on one line → `textWrap={false}`.
17. `CodeBlock` → `Code`.
18. `Latex` nodes that call `getFragmentBBox(id)` and friends: `<Latex` →
    `<AnimLatex`, `createRef<Latex>` → `createRef<AnimLatex>` (or pass the
    padding: `getFragmentBBox(id, 8)`); `getChildrenById` → `getShapesById`.
    Import `HStack`/`VStack` from `@videozero/compat`.
19. `drawAttribution(ctx, box, src, opacity, node, clip)` →
    `drawAttribution(ctx, box, src, node, opacity, clip)`;
    `withIsolatedPromises` → `DependencyContext.isolatePromises`; `roundPx` → a
    local helper; `TextGeometry.loadFont` → `FontLoader`.
20. Run the project's validation render with the warnings on (they are, after
    `applyVideoZeroDefaults()`): fix every "already visible when its … entrance
    starts", "line height … lines overlap" and "positioned by its layout parent"
    warning, then compare a few frames against the VideoZero render.
