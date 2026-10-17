import {BBox} from '@canvas-commons/core';
import type {Node} from '../components/Node';

const REFERENCE_HEIGHT = 1080;
const STROKE_WIDTH = 2;
const LINE_HEIGHT = 1.2;
const MAX_HTML_LENGTH = 512;
const DARK_LUMINANCE = 105;
const LIGHT_LUMINANCE = 150;

/**
 * The corner of a media node that its attribution is drawn in.
 */
export type AttributionPosition =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * A request that should be sent when an attributed asset is exported.
 *
 * @remarks
 * Some stock media providers ask to be notified when their asset is used.
 * Canvas Commons only parses this request; sending it is up to the consumer of
 * {@link getAttributions}.
 */
export interface DownloadNotification {
  url: string;
  /**
   * @defaultValue 'POST'
   */
  method: string;
}

/**
 * The attribution of a single media source.
 */
export interface ParsedAttribution {
  /**
   * The plain-text credit drawn onto the media.
   */
  text: string;
  /**
   * The credit as sanitized HTML, for display outside the canvas.
   *
   * @remarks
   * Only `<a>` tags with `https:` links are kept.
   */
  html?: string;
  downloadNotification?: DownloadNotification;
  /**
   * The source the attribution was registered for.
   */
  sourceUrl: string;
}

export interface AttributionRenderConfig {
  fontFamily: string;
  /**
   * The font size, in pixels, for a view that is 1080 pixels tall.
   *
   * @remarks
   * The credit scales with the height of the view, but not with the size of
   * the media it is drawn on.
   */
  fontSize: number;
  position: AttributionPosition;
  /**
   * The horizontal inset from the edge of the media, in the same units as
   * {@link fontSize}.
   */
  paddingX: number;
  /**
   * The vertical inset from the edge of the media, in the same units as
   * {@link fontSize}.
   */
  paddingY: number;
  /**
   * The opacity of the credit, from `0` to `1`.
   */
  opacity: number;
  /**
   * The largest fraction of the media area the credit may cover.
   *
   * @remarks
   * The credit keeps a constant size, so on small media it could cover most of
   * the picture. Above this fraction it's not drawn.
   */
  maxAreaFraction: number;
}

export interface AttributionConfig {
  /**
   * Whether attributions are parsed and drawn.
   */
  enabled: boolean;
  /**
   * The query parameter of a media source that holds its attribution.
   */
  queryParam: string;
  render: AttributionRenderConfig;
}

/**
 * The global attribution configuration.
 *
 * @remarks
 * Use {@link configureAttribution} to change it.
 */
export const attributionConfig: AttributionConfig = {
  enabled: true,
  queryParam: 'attribution',
  render: {
    fontFamily: 'sans-serif',
    fontSize: 14,
    position: 'bottom-left',
    paddingX: 24,
    paddingY: 10,
    opacity: 0.65,
    maxAreaFraction: 0.2,
  },
};

/**
 * Change the global attribution configuration.
 *
 * @example
 * ```ts
 * configureAttribution({render: {position: 'top-right'}});
 * ```
 *
 * @param patch - The values to change.
 */
export function configureAttribution(
  patch: Partial<Omit<AttributionConfig, 'render'>> & {
    render?: Partial<AttributionRenderConfig>;
  },
): void {
  const {render, ...rest} = patch;
  Object.assign(attributionConfig, rest);
  if (render) {
    Object.assign(attributionConfig.render, render);
  }
}

const REGISTRY = new Map<string, ParsedAttribution>();
const CHECKED_WITHOUT = new Set<string>();
const LISTENERS = new Set<() => void>();
const DARK_TEXT_BY_SOURCE = new Map<string, boolean>();

function notify() {
  for (const listener of LISTENERS) {
    listener();
  }
}

/**
 * Listen to new attributions being registered.
 *
 * @example
 * ```ts
 * const unsubscribe = onAttributionsChanged(() => {
 *   console.log(getAttributions().map(({text}) => text));
 * });
 * ```
 *
 * @param listener - The function called after each change.
 *
 * @returns A function that removes the listener.
 */
export function onAttributionsChanged(listener: () => void): () => void {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

/**
 * Get all registered attributions.
 */
export function getAttributions(): ParsedAttribution[] {
  return [...REGISTRY.values()];
}

/**
 * Get the attribution registered for the given source.
 *
 * @param src - The source of the media.
 */
export function getAttribution(src: string): ParsedAttribution | undefined {
  return REGISTRY.get(src);
}

/**
 * Remove all registered attributions.
 */
export function resetAttributions(): void {
  REGISTRY.clear();
  CHECKED_WITHOUT.clear();
  DARK_TEXT_BY_SOURCE.clear();
  notify();
}

/**
 * Register the attribution encoded in the query of a media source.
 *
 * @remarks
 * {@link Img} and {@link Video} call this for their sources. The query
 * parameter named by {@link AttributionConfig.queryParam} holds URI-encoded
 * JSON in the shape of `{text, html?, download_notification?}`.
 * Sources are parsed only once, so calling this repeatedly is cheap.
 *
 * @example
 * ```ts
 * const credit = encodeURIComponent(JSON.stringify({text: 'Jane Doe'}));
 * registerAttributionForSource(`/photo.jpg?attribution=${credit}`);
 * ```
 *
 * @param src - The source of the media.
 */
export function registerAttributionForSource(
  src: string | null | undefined,
): void {
  if (!src) {
    return;
  }
  register(src, () => parseAttributionFromUrl(src));
}

/**
 * Register an attribution for media that isn't drawn by a node, such as
 * sounds.
 *
 * @example
 * ```ts
 * registerAttribution('/music.mp3', {text: 'Jane Doe / Example Music'});
 * ```
 *
 * @param src - The source of the media.
 * @param data - The credit, in the shape of
 *               `{text, html?, download_notification?}`.
 */
export function registerAttribution(src: string, data: unknown): void {
  if (!src) {
    return;
  }
  register(src, () => toParsedAttribution(data, src));
}

function register(src: string, parse: () => ParsedAttribution | null) {
  if (
    !attributionConfig.enabled ||
    REGISTRY.has(src) ||
    CHECKED_WITHOUT.has(src)
  ) {
    return;
  }

  const parsed = parse();
  if (!parsed) {
    CHECKED_WITHOUT.add(src);
    return;
  }

  REGISTRY.set(src, parsed);
  notify();
}

/**
 * Parse the attribution encoded in the query of a media source.
 *
 * @example
 * ```ts
 * const credit = encodeURIComponent(JSON.stringify({text: 'Jane Doe'}));
 * parseAttributionFromUrl(`/photo.jpg?attribution=${credit}`)?.text;
 * // 'Jane Doe'
 * ```
 *
 * @param url - The source of the media.
 *
 * @returns The attribution, or `null` if the source has none.
 */
export function parseAttributionFromUrl(url: string): ParsedAttribution | null {
  try {
    const base =
      typeof window !== 'undefined' && window.origin !== 'null'
        ? window.origin
        : undefined;
    const raw = new URL(url, base).searchParams.get(
      attributionConfig.queryParam,
    );
    if (!raw) {
      return null;
    }
    return toParsedAttribution(parseJson(raw), url);
  } catch {
    return null;
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // The value may have been encoded twice.
    return JSON.parse(decodeURIComponent(raw));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toParsedAttribution(
  data: unknown,
  sourceUrl: string,
): ParsedAttribution | null {
  if (!isRecord(data)) {
    return null;
  }

  const text = typeof data.text === 'string' ? data.text : '';
  const html =
    typeof data.html === 'string'
      ? sanitizeAttributionHtml(data.html)
      : undefined;
  if (!text && !html) {
    return null;
  }

  let downloadNotification: DownloadNotification | undefined;
  const notification = data.download_notification ?? data.downloadNotification;
  if (isRecord(notification) && typeof notification.url === 'string') {
    downloadNotification = {
      url: notification.url,
      method:
        typeof notification.method === 'string' ? notification.method : 'POST',
    };
  }

  return {text, html, downloadNotification, sourceUrl};
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize the HTML of an attribution.
 *
 * @remarks
 * Only `<a>` tags survive. Links that don't use `https:` lose their `href`,
 * the others open in a new tab without a referrer. Every other tag is dropped
 * and the text is escaped.
 *
 * @example
 * ```ts
 * sanitizeAttributionHtml('<b>Jane</b> <a href="javascript:x">Doe</a>');
 * // 'Jane <a>Doe</a>'
 * ```
 *
 * @param html - The HTML to sanitize.
 */
export function sanitizeAttributionHtml(html: string): string {
  const input = html.slice(0, MAX_HTML_LENGTH);
  const tagPattern = /<\/?[a-zA-Z][^>]*>/g;

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(input)) !== null) {
    result += escapeText(input.slice(lastIndex, match.index));
    lastIndex = tagPattern.lastIndex;

    const tag = match[0];
    const isClosing = tag[1] === '/';
    const name = tag
      .slice(isClosing ? 2 : 1)
      .split(/[\s>/]/)[0]
      .toLowerCase();
    if (name !== 'a') {
      continue;
    }
    if (isClosing) {
      result += '</a>';
      continue;
    }

    const hrefMatch = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const href = (
      hrefMatch?.[2] ??
      hrefMatch?.[3] ??
      hrefMatch?.[4] ??
      ''
    ).trim();
    result += /^https:/i.test(href)
      ? `<a href="${escapeText(href).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer nofollow">`
      : '<a>';
  }

  return result + escapeText(input.slice(lastIndex));
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1 || maxWidth <= 0) {
    return [text];
  }

  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function averageLuminance(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): number | null {
  if (width <= 0 || height <= 0) {
    return null;
  }
  try {
    const data = context.getImageData(x, y, width, height).data;
    // Every 8th pixel is enough to pick a contrasting color.
    const stride = 32;
    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += stride) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
    return count > 0 ? total / count : null;
  } catch {
    // Tainted canvases can't be read.
    return null;
  }
}

/**
 * Draw the attribution of a media source onto a node.
 *
 * @remarks
 * The credit is drawn in the configured corner of `box`, follows the rotation
 * of the node, and wraps onto multiple lines when it's wider than the box. Its
 * color is light or dark depending on the pixels below it. Its size depends
 * only on the size of the view, not on the size or scale of the node, and it
 * is skipped when it would cover too much of the box.
 *
 * @example
 * ```ts
 * protected override draw(context: CanvasRenderingContext2D) {
 *   const box = BBox.fromSizeCentered(this.computedSize());
 *   drawImage(context, this.image(), box);
 *   drawAttribution(context, box, this.src(), this, 1, this.getPath());
 * }
 * ```
 *
 * @param context - The context, transformed to the local space of the node.
 * @param box - The bounds of the media in the local space of the node.
 * @param src - The source of the media.
 * @param node - The node the media belongs to.
 * @param opacity - The opacity multiplier of the credit.
 * @param clipPath - The outline of the media in the local space of the node.
 */
export function drawAttribution(
  context: CanvasRenderingContext2D,
  box: BBox,
  src: string | null,
  node: Node,
  opacity = 1,
  clipPath?: Path2D,
): void {
  if (!attributionConfig.enabled || opacity <= 0 || !src) {
    return;
  }
  const attribution = REGISTRY.get(src);
  if (!attribution?.text) {
    return;
  }

  const {render} = attributionConfig;
  const matrix = context.getTransform();
  const view = node.view();
  const nodeToView = view.worldToLocal().multiply(node.localToWorld());
  const nodeScale = Math.hypot(nodeToView.a, nodeToView.b);
  const drawScale = Math.hypot(matrix.a, matrix.b);
  if (nodeScale === 0 || drawScale === 0) {
    return;
  }
  const scale =
    (view.size().height / REFERENCE_HEIGHT) * (drawScale / nodeScale);
  const fontSize = render.fontSize * scale;
  const paddingX = render.paddingX * scale;
  const paddingY = render.paddingY * scale;

  const toDevice = ({x, y}: {x: number; y: number}) => ({
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  });
  const topLeft = toDevice(box.topLeft);
  const topRight = toDevice(box.topRight);
  const bottomLeft = toDevice(box.bottomLeft);
  const bottomRight = toDevice(box.bottomRight);

  const angle = Math.atan2(matrix.b, matrix.a);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const alignRight =
    render.position === 'top-right' || render.position === 'bottom-right';
  const alignBottom =
    render.position === 'bottom-left' || render.position === 'bottom-right';

  const corner = alignBottom
    ? alignRight
      ? bottomRight
      : bottomLeft
    : alignRight
      ? topRight
      : topLeft;
  const insetX = alignRight ? -paddingX : paddingX;
  const insetY = alignBottom ? -paddingY : paddingY;
  const anchorX = corner.x + cos * insetX - sin * insetY;
  const anchorY = corner.y + sin * insetX + cos * insetY;

  context.save();
  context.font = `${fontSize}px ${render.fontFamily}`;
  context.textAlign = alignRight ? 'right' : 'left';
  context.textBaseline = alignBottom ? 'bottom' : 'top';

  const edgeWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const lines = wrapText(context, attribution.text, edgeWidth - 2 * paddingX);
  const metrics = context.measureText(attribution.text);
  const ascent = metrics.actualBoundingBoxAscent ?? fontSize;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  const textHeight = ascent + descent;
  const lineAdvance = textHeight * LINE_HEIGHT;
  const blockWidth = Math.max(
    ...lines.map(line => context.measureText(line).width),
  );
  const blockHeight = (lines.length - 1) * lineAdvance + textHeight;

  const mediaArea = Math.abs(
    (topRight.x - topLeft.x) * (bottomLeft.y - topLeft.y) -
      (topRight.y - topLeft.y) * (bottomLeft.x - topLeft.x),
  );
  if (
    mediaArea === 0 ||
    (blockWidth * blockHeight) / mediaArea > render.maxAreaFraction
  ) {
    context.restore();
    return;
  }

  if (clipPath) {
    context.clip(clipPath);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.translate(anchorX, anchorY);
  // Nudges the browser off the integer-pixel path into grayscale
  // anti-aliasing.
  context.rotate(angle + 0.001);

  const minX = alignRight ? -blockWidth : 0;
  const maxX = alignRight ? 0 : blockWidth;
  const minY = alignBottom ? descent - blockHeight : 0;
  const maxY = alignBottom ? descent : blockHeight;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]) {
    xs.push(anchorX + cos * x - sin * y);
    ys.push(anchorY + sin * x + cos * y);
  }
  const sampleX = Math.max(0, Math.floor(Math.min(...xs)));
  const sampleY = Math.max(0, Math.floor(Math.min(...ys)));
  const luminance = averageLuminance(
    context,
    sampleX,
    sampleY,
    Math.min(
      Math.ceil(Math.max(...xs)) - sampleX,
      context.canvas.width - sampleX,
    ),
    Math.min(
      Math.ceil(Math.max(...ys)) - sampleY,
      context.canvas.height - sampleY,
    ),
  );

  let darkText = DARK_TEXT_BY_SOURCE.get(src) ?? false;
  if (luminance !== null) {
    if (luminance > LIGHT_LUMINANCE) {
      darkText = true;
    } else if (luminance < DARK_LUMINANCE) {
      darkText = false;
    }
  }
  DARK_TEXT_BY_SOURCE.set(src, darkText);

  const alpha = (render.opacity * opacity).toFixed(3);
  context.fillStyle = darkText
    ? `rgba(17, 17, 17, ${alpha})`
    : `rgba(255, 255, 255, ${alpha})`;
  context.strokeStyle = darkText
    ? 'rgba(255, 255, 255, 0.3)'
    : 'rgba(0, 0, 0, 0.3)';
  context.lineWidth = STROKE_WIDTH * scale;
  context.lineJoin = 'round';
  context.lineCap = 'round';

  lines.forEach((line, index) => {
    const y = alignBottom
      ? -(lines.length - 1 - index) * lineAdvance
      : index * lineAdvance;
    context.strokeText(line, 0, y);
    context.fillText(line, 0, y);
  });

  context.restore();
}
