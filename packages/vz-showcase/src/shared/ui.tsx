import * as two from '@canvas-commons/2d';
import {Layout, Node, Rect, Txt, View2D} from '@canvas-commons/2d';
import * as core from '@canvas-commons/core';
import {
  LogPayload,
  ThreadGenerator,
  createSignal,
  useScene,
  waitFor,
} from '@canvas-commons/core';

export const Colors = {
  background: '#0f1419',
  panel: '#1b2230',
  panelLight: '#263044',
  text: '#e6edf3',
  muted: '#8b98a9',
  accent: '#58a6ff',
  green: '#3fb950',
  orange: '#f0883e',
  red: '#f85149',
  purple: '#bc8cff',
  yellow: '#e3b341',
};

export const Sans = 'Inter, DejaVu Sans, sans-serif';
export const Mono = 'DejaVu Sans Mono, monospace';

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __VZ_OPTIONAL_PACKAGES__: string[];

/** Whether an optional package (three, d3-geo, ...) was found by vite. */
export function hasPackage(name: string): boolean {
  return (
    typeof __VZ_OPTIONAL_PACKAGES__ !== 'undefined' &&
    __VZ_OPTIONAL_PACKAGES__.includes(name)
  );
}

const TwoExports = two as unknown as Record<string, unknown>;
const CoreExports = core as unknown as Record<string, unknown>;

/** Read an export of `@canvas-commons/2d` that may not exist on main. */
export function from2d<T>(name: string): T | null {
  return (TwoExports[name] as T | undefined) ?? null;
}

/** Read an export of `@canvas-commons/core` that may not exist on main. */
export function fromCore<T>(name: string): T | null {
  return (CoreExports[name] as T | undefined) ?? null;
}

/** A constructor of a node class looked up at runtime. */
export type NodeClass<T extends Node = Node> = new (
  props: Record<string, unknown>,
) => T;

/** Load an optional package; resolves to an empty module when missing. */
export function loadOptional(
  loader: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  return loader().then(
    module => (module ?? {}) as Record<string, unknown>,
    () => ({}),
  );
}

/**
 * Show the branch name and a one-line description, then clear the view.
 */
export function* intro(
  view: View2D,
  branch: string,
  description: string,
  kind: 'feature' | 'fix' | 'package' | 'tests' = 'feature',
): ThreadGenerator {
  view.fill(Colors.background);
  const badge =
    kind === 'fix'
      ? Colors.orange
      : kind === 'package'
        ? Colors.purple
        : kind === 'tests'
          ? Colors.muted
          : Colors.green;
  const card = (
    <Layout
      layout
      direction="column"
      alignItems="center"
      gap={18}
      opacity={0}
      width={860}
    >
      <Rect fill={badge} radius={6} padding={[4, 12]}>
        <Txt
          text={kind.toUpperCase()}
          fontFamily={Sans}
          fontWeight={700}
          fontSize={16}
          fill={Colors.background}
        />
      </Rect>
      <Txt
        text={`cc/${branch}`}
        fontFamily={Mono}
        fontSize={46}
        fontWeight={700}
        fill={Colors.text}
      />
      <Txt
        text={description}
        fontFamily={Sans}
        fontSize={24}
        fill={Colors.muted}
        textAlign="center"
        textWrap
        width={820}
      />
    </Layout>
  ) as Layout;
  view.add(card);
  yield* card.opacity(1, 0.4);
  yield* waitFor(1.6);
  yield* card.opacity(0, 0.4);
  card.remove();
}

/** A small caption at the top of the demo. */
export function caption(view: View2D, text: string, y = -230): Txt {
  const node = (
    <Txt
      text={text}
      y={y}
      fontFamily={Sans}
      fontSize={22}
      fill={Colors.muted}
      textAlign="center"
      width={900}
      textWrap
    />
  ) as Txt;
  view.add(node);
  return node;
}

/** A label for a part of the demo. */
export function label(text: string, props: Record<string, unknown> = {}): Txt {
  return new Txt({
    text,
    fontFamily: Sans,
    fontSize: 18,
    fill: Colors.muted,
    ...props,
  });
}

/**
 * Show that a feature is missing on this build.
 */
export function placeholder(
  view: View2D,
  what: string,
  props: Record<string, unknown> = {},
): Rect {
  const box = (
    <Rect
      layout
      direction="column"
      alignItems="center"
      justifyContent="center"
      gap={10}
      width={620}
      height={180}
      radius={16}
      stroke={Colors.red}
      lineWidth={3}
      lineDash={[12, 8]}
      fill={'#f8514912'}
      {...props}
    >
      <Txt
        text="not available on canvas-commons main"
        fontFamily={Sans}
        fontWeight={700}
        fontSize={26}
        fill={Colors.red}
      />
      <Txt
        text={what}
        fontFamily={Mono}
        fontSize={18}
        fill={Colors.muted}
        textAlign="center"
        textWrap
        width={560}
      />
    </Rect>
  ) as Rect;
  view.add(box);
  return box;
}

let Unsubscribe: (() => void) | null = null;

/**
 * A panel that lists what the scene logs, so warnings and errors are visible
 * in the video.
 */
export function logPanel(
  view: View2D,
  props: Record<string, unknown> = {},
  levels: string[] = ['warn', 'error'],
) {
  const entries = createSignal<string[]>([]);
  const count = createSignal(0);
  Unsubscribe?.();
  Unsubscribe = useScene().logger.onLogged.subscribe((payload: LogPayload) => {
    if (!levels.includes(payload.level ?? 'info')) return;
    const message = payload.message.replace(/\s+/g, ' ');
    const short = message.length > 180 ? `${message.slice(0, 179)}…` : message;
    count(count() + 1);
    entries([...entries(), `${payload.level}: ${short}`].slice(-2));
  });
  const panel = (
    <Rect
      layout
      direction="column"
      gap={6}
      padding={[12, 16]}
      width={900}
      y={200}
      radius={10}
      fill={Colors.panel}
      stroke={Colors.panelLight}
      lineWidth={2}
      {...props}
    >
      <Txt
        text={() => `logged warnings/errors: ${count()}`}
        fontFamily={Mono}
        fontSize={16}
        fontWeight={700}
        fill={() => (count() > 0 ? Colors.yellow : Colors.muted)}
      />
      <Txt
        text={() =>
          entries().length ? entries().join('\n') : '(nothing logged)'
        }
        fontFamily={Mono}
        fontSize={14}
        lineHeight={'140%'}
        fill={Colors.text}
        textWrap
        width={868}
      />
    </Rect>
  ) as Rect;
  view.add(panel);
  return {panel, count, entries};
}

const LoadedFonts = new Map<string, Promise<void>>();

/** Register a local font file under the given family (works on every build). */
export function loadFont(family: string, url: string, weight = '100 900') {
  const key = `${family}/${weight}`;
  let promise = LoadedFonts.get(key);
  if (!promise) {
    const face = new FontFace(family, `url(${url})`, {weight});
    promise = face.load().then(loaded => {
      document.fonts.add(loaded);
    });
    LoadedFonts.set(key, promise);
  }
  return promise;
}
