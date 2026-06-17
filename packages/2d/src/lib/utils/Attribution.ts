import {BBox} from '@motion-canvas/core';

/**
 * Per-image attribution: a credit (e.g. "Annie Spratt / Unsplash") carried in
 * the source URL of an {@link Img} / {@link Video} and rendered onto the image
 * using the same adaptive light/dark technique as the brand overlay.
 *
 * Sources encode their credit in a `vz_attribution` query param holding URI-
 * encoded JSON:
 * ```
 * ?vz_attribution=%7B%22text%22%3A%22Annie%20Spratt%20%2F%20Unsplash%22%2C ... %7D
 * ```
 * which decodes to:
 * ```json
 * {
 *   "text": "Annie Spratt / Unsplash",
 *   "html": "<a href=\"https://unsplash.com/@anniespratt\">Annie Spratt</a> / Unsplash",
 *   "download_notification": {"url": "https://...", "method": "POST"}
 * }
 * ```
 * Whenever an image element is created or its source changes, the component
 * calls {@link registerAttributionForSource}, which parses the URL and records
 * the result in a global {@link AttributionRegistry}. The registry is consumed
 * elsewhere (player UI, export-time download notifications).
 */

// Mirror the brand overlay reference height so credit text scales consistently
// with the rest of the frame chrome.
const REFERENCE_HEIGHT = 1080;
const STROKE_WIDTH = 2;

const FONT_FAMILY =
  'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif';

const LIGHT_FILL = 'rgba(255, 255, 255, %A%)';
const DARK_FILL = 'rgba(17, 17, 17, %A%)';
const LIGHT_STROKE = 'rgba(255, 255, 255, 0.30)';
const DARK_STROKE = 'rgba(0, 0, 0, 0.30)';

export type AttributionPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/**
 * A request the client should issue to notify a backend of a potential export
 * involving an attributed asset. The actual firing happens outside this repo;
 * the parsed value is exposed via the registry for the consumer to act on.
 */
export interface DownloadNotification {
  url: string;
  /**
   * HTTP method to use when notifying.
   *
   * @defaultValue 'POST'
   */
  method: string;
}

/**
 * Attribution parsed from a single source URL.
 */
export interface ParsedAttribution {
  /**
   * Plain-text credit. This is what gets rendered onto the canvas.
   */
  text: string;
  /**
   * Sanitized HTML credit for rich display in the player UI. Only `<a>` tags
   * with `https:` hrefs survive sanitization.
   */
  html?: string;
  /**
   * Optional download-notification request for the client to fire on export.
   */
  downloadNotification?: DownloadNotification;
  /**
   * The original (pre-proxy) source URL that produced this entry.
   */
  sourceUrl: string;
}

/**
 * Default rendering configuration for the on-canvas attribution credit.
 */
export interface AttributionRenderConfig {
  fontFamily: string;
  /**
   * Font size in reference pixels (at {@link REFERENCE_HEIGHT}); scaled by the
   * actual canvas height at draw time.
   */
  fontSize: number;
  /**
   * Corner of the image the credit is anchored to.
   *
   * @defaultValue 'bottom-left'
   */
  position: AttributionPosition;
  /**
   * Horizontal inset from the image's left/right edge in reference pixels.
   */
  paddingX: number;
  /**
   * Vertical inset from the image's top/bottom edge in reference pixels.
   */
  paddingY: number;
  /**
   * Fill opacity of the credit text (0-1).
   */
  opacity: number;
}

/**
 * Global attribution configuration. Mutate via {@link configureAttribution}.
 */
export interface AttributionConfig {
  /**
   * Master switch. When `false`, sources are neither parsed nor rendered.
   */
  enabled: boolean;
  render: AttributionRenderConfig;
}

export const attributionConfig: AttributionConfig = {
  enabled: true,
  render: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    position: 'bottom-left',
    paddingX: 24,
    paddingY: 10,
    opacity: 0.65,
  },
};

/**
 * Shallow-merge a patch into the global {@link attributionConfig}, deep-merging
 * the nested `render` block so callers can tweak a single field.
 */
export function configureAttribution(patch: Partial<AttributionConfig>): void {
  if (patch.render) {
    Object.assign(attributionConfig.render, patch.render);
  }
  if (patch.enabled !== undefined) {
    attributionConfig.enabled = patch.enabled;
  }
}

/**
 * Maps a source URL to the attribution parsed from it. Consumed by the player
 * UI and by export-time download-notification logic.
 */
const registry = new Map<string, ParsedAttribution>();
// Sources already checked and found to carry no attribution. Lets the hook
// short-circuit without re-parsing on every recompute.
const checkedWithout = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Subscribe to registry changes. Returns an unsubscribe function.
 */
export function onAttributionsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * All currently registered attributions.
 */
export function getAttributions(): ParsedAttribution[] {
  return Array.from(registry.values());
}

/**
 * The attribution registered for a given source URL, if any.
 */
export function getAttribution(src: string): ParsedAttribution | undefined {
  return registry.get(src);
}

/**
 * Clear the registry. Notifies subscribers.
 */
export function resetAttributions(): void {
  registry.clear();
  checkedWithout.clear();
  notify();
}

/**
 * Parse, register, and (if applicable) notify for a single source URL.
 *
 * Cheap, idempotent, and never throws — safe to call from a `@computed()`
 * without perturbing the dependency graph (it reads no signals and creates no
 * promises). Sources without a `vz_attribution` param are remembered so they
 * are not re-parsed on subsequent recomputes.
 */
export function registerAttributionForSource(
  src: string | null | undefined,
): void {
  if (!attributionConfig.enabled || !src) {
    return;
  }
  if (registry.has(src) || checkedWithout.has(src)) {
    return;
  }

  const parsed = parseAttributionFromUrl(src);
  if (!parsed) {
    checkedWithout.add(src);
    return;
  }

  registry.set(src, parsed);
  notify();
}

/**
 * Extract attribution from a source URL's `vz_attribution` query param. Returns
 * `null` when the param is absent or malformed.
 */
export function parseAttributionFromUrl(url: string): ParsedAttribution | null {
  try {
    // Origin-safe construction, mirroring Img.image().
    const parsedUrl =
      typeof window !== 'undefined' &&
      window.origin &&
      window.origin !== 'null'
        ? new URL(url, window.origin)
        : new URL(url);

    const raw = parsedUrl.searchParams.get('vz_attribution');
    if (!raw) {
      return null;
    }

    const data = JSON.parse(decodeURIComponent(raw));
    if (!data || typeof data !== 'object') {
      return null;
    }

    const text = typeof data.text === 'string' ? data.text : '';
    const html =
      typeof data.html === 'string'
        ? sanitizeAttributionHtml(data.html)
        : undefined;

    let downloadNotification: DownloadNotification | undefined;
    const dn = data.download_notification ?? data.downloadNotification;
    if (dn && typeof dn === 'object' && typeof dn.url === 'string') {
      downloadNotification = {
        url: dn.url,
        method: typeof dn.method === 'string' ? dn.method : 'POST',
      };
    }

    if (!text && !html) {
      return null;
    }

    return {text, html, downloadNotification, sourceUrl: url};
  } catch {
    return null;
  }
}

const MAX_HTML_LENGTH = 512;

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Conservatively sanitize an attribution HTML string. Only `<a>` tags with
 * `https:` hrefs survive; every other tag is dropped, all other attributes are
 * stripped, and `rel`/`target` are forced for safety. Text between tags is
 * HTML-escaped. No DOM dependency, so it is safe in any context.
 */
export function sanitizeAttributionHtml(html: string): string {
  const input = html.slice(0, MAX_HTML_LENGTH);
  const tagPattern = /<\/?[a-zA-Z][^>]*>/g;

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(input)) !== null) {
    // Escape the text node preceding this tag.
    result += escapeText(input.slice(lastIndex, match.index));
    lastIndex = tagPattern.lastIndex;

    const tag = match[0];
    const isClosing = tag[1] === '/';
    const name = (isClosing ? tag.slice(2) : tag.slice(1))
      .split(/[\s>/]/)[0]
      .toLowerCase();

    if (name !== 'a') {
      // Drop the tag entirely; its text content (handled as text nodes) stays.
      continue;
    }

    if (isClosing) {
      result += '</a>';
      continue;
    }

    const hrefMatch = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const href = hrefMatch
      ? hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? ''
      : '';

    if (/^https:/i.test(href.trim())) {
      const safeHref = escapeText(href.trim());
      result += `<a href="${safeHref}" target="_blank" rel="noopener noreferrer nofollow">`;
    } else {
      // Keep the link's text but drop the unsafe anchor.
      // (Emit nothing; the matching </a> is also dropped above? No — emit a
      // neutral wrapper so the text still renders.)
      result += '<a>';
    }
  }

  result += escapeText(input.slice(lastIndex));
  return result;
}

// Per-source hysteresis so the credit color does not flicker frame to frame.
const useDarkTextBySource = new Map<string, boolean>();

/**
 * Greedily wrap `text` onto as few lines as possible without any line exceeding
 * `maxWidth` (measured with the context's current font). Breaks on whitespace
 * only; a single word wider than `maxWidth` stays on its own line (the caller's
 * clip is the backstop). Returns at least one line.
 */
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
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function averageLuminance(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): number | null {
  if (w <= 0 || h <= 0) {
    return null;
  }
  try {
    const data = ctx.getImageData(x, y, w, h).data;
    const stride = 32; // sample every 8th pixel (4 bytes per pixel × 8)
    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += stride) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
    return count > 0 ? total / count : null;
  } catch {
    return null;
  }
}

/**
 * The minimal node surface {@link drawAttribution} needs to keep the credit a
 * constant scene-space size regardless of how the node is being rendered.
 */
export interface AttributionNode {
  localToWorld(): DOMMatrix;
  view(): {size(): {y: number}};
}

/**
 * Render the attribution credit for `src` onto the canvas, adapting its color
 * to the underlying pixels (same technique as the brand overlay). Drawn in the
 * canvas's device space at the configured corner of `box`.
 *
 * @param context - The drawing context (transformed to the node's local space).
 * @param box - The node-local box of the image (e.g. `BBox.fromSizeCentered`).
 * @param src - The source URL; the registry key and hysteresis key.
 * @param opacity - Node alpha multiplier applied to the credit's fill opacity.
 * @param node - The node being drawn. Used to keep the credit a constant
 *   scene-space size; without it we fall back to a frame-relative heuristic
 *   that mis-sizes the credit when the node is rendered into a cache canvas.
 * @param clipPath - Optional node-local path (e.g. the image's rounded-rect
 *   outline) the credit is clipped to, so it never spills past the media edge.
 */
export function drawAttribution(
  context: CanvasRenderingContext2D,
  box: BBox,
  src: string,
  opacity = 1,
  node?: AttributionNode,
  clipPath?: Path2D,
): void {
  if (!attributionConfig.enabled || opacity <= 0) {
    return;
  }

  const attribution = registry.get(src);
  if (!attribution || !attribution.text) {
    return;
  }

  const {width, height} = context.canvas;
  const {render} = attributionConfig;

  // Map the node-local box to device space (the space getImageData uses and the
  // space we draw in with an identity transform).
  const m = context.getTransform();

  // The credit must stay a constant, legible size in *scene* units no matter
  // how small the image is drawn, or whether the node is rendered straight to
  // the frame or into a node-sized cache canvas (fades, filters, shadows…).
  // Sizing off `context.canvas.height` breaks in the cached path, where the
  // canvas is sized to the node — a small image then yields tiny text. Instead
  // we map a fixed scene-space size into whatever space we're drawing in, with
  // the node's own scale divided out so the credit never shrinks with the image.
  const ltw = node?.localToWorld();
  const worldScale = ltw ? Math.hypot(ltw.a, ltw.b) : 0;
  const drawScale = Math.hypot(m.a, m.b);
  const worldToDraw =
    worldScale > 0 && drawScale > 0 ? drawScale / worldScale : null;
  const referenceScale = (node?.view().size().y ?? REFERENCE_HEIGHT) /
    REFERENCE_HEIGHT;
  const scale =
    worldToDraw !== null
      ? referenceScale * worldToDraw
      : // Fallback: legacy frame-relative heuristic when no node is available.
        height / REFERENCE_HEIGHT;
  const fontSize = render.fontSize * scale;
  const paddingX = render.paddingX * scale;
  const paddingY = render.paddingY * scale;

  // Apply the affine transform manually (deviceX = a·x + c·y + e, etc.) to avoid
  // depending on DOMPoint/transformPoint, which not every canvas impl exposes.
  const corners = [box.topLeft, box.topRight, box.bottomLeft, box.bottomRight];
  const xs = corners.map(p => m.a * p.x + m.c * p.y + m.e);
  const ys = corners.map(p => m.b * p.x + m.d * p.y + m.f);
  const deviceLeft = Math.min(...xs);
  const deviceRight = Math.max(...xs);
  const deviceTop = Math.min(...ys);
  const deviceBottom = Math.max(...ys);

  const position = render.position;
  const alignRight = position === 'top-right' || position === 'bottom-right';
  const alignBottom =
    position === 'bottom-left' || position === 'bottom-right';

  const x = alignRight ? deviceRight - paddingX : deviceLeft + paddingX;
  const y = alignBottom ? deviceBottom - paddingY : deviceTop + paddingY;

  context.save();
  // Clip to the media outline (in the node's local space) *before* switching to
  // the identity transform — the clip rasterizes into device space and persists,
  // so the credit (drawn below in device space) is confined to the image edges,
  // rounded corners included.
  if (clipPath) {
    context.clip(clipPath);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);

  context.font = `${fontSize}px ${render.fontFamily}`;
  context.textAlign = alignRight ? 'right' : 'left';
  context.textBaseline = alignBottom ? 'bottom' : 'top';

  // Wrap the credit to the media's available width so a long credit on a small
  // image breaks onto multiple lines instead of being clipped at the edge.
  const contentWidth = deviceRight - deviceLeft - 2 * paddingX;
  const lines = wrapText(context, attribution.text, contentWidth);

  const metrics = context.measureText(attribution.text);
  const ascent = metrics.actualBoundingBoxAscent ?? fontSize;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  const textHeight = ascent + descent;
  // Baseline-to-baseline distance. Lines stack away from the anchored edge
  // (upward for bottom positions, downward for top positions).
  const lineAdvance = textHeight * 1.2;
  const blockWidth = lines.reduce(
    (max, line) => Math.max(max, context.measureText(line).width),
    0,
  );
  const blockHeight = (lines.length - 1) * lineAdvance + textHeight;

  // Sample the underlying pixels behind the whole text block to choose a single
  // contrasting color (one decision per source keeps the hysteresis stable).
  const sampleX = alignRight ? x - blockWidth : x;
  const sampleY = alignBottom ? y + descent - blockHeight : y;
  const clampedX = Math.max(0, Math.floor(sampleX));
  const clampedY = Math.max(0, Math.floor(sampleY));
  const sampleW = Math.min(Math.ceil(blockWidth), width - clampedX);
  const sampleH = Math.min(Math.ceil(blockHeight), height - clampedY);

  let useDarkText = useDarkTextBySource.get(src) ?? false;
  const avg = averageLuminance(context, clampedX, clampedY, sampleW, sampleH);
  if (avg !== null) {
    if (avg > 150) useDarkText = true;
    else if (avg < 105) useDarkText = false;
    // Between 105 and 150: keep previous decision.
  }
  useDarkTextBySource.set(src, useDarkText);

  const fillAlpha = (render.opacity * opacity).toFixed(3);
  context.strokeStyle = useDarkText ? LIGHT_STROKE : DARK_STROKE;
  context.lineWidth = STROKE_WIDTH * scale;
  context.fillStyle = (useDarkText ? DARK_FILL : LIGHT_FILL).replace(
    '%A%',
    fillAlpha,
  );

  // Draw with a near-imperceptible rotation around the text anchor. This nudges
  // the browser off the integer-pixel fast path into smooth grayscale
  // anti-aliasing, so the credit doesn't render with harsh hinted edges. The
  // rotation is applied about (x, y) so the text position is unchanged.
  context.translate(x, y);
  context.rotate(0.001);
  for (let i = 0; i < lines.length; i++) {
    // Offset each line from the anchored edge so the block grows inward.
    const dy = alignBottom
      ? -(lines.length - 1 - i) * lineAdvance
      : i * lineAdvance;
    context.strokeText(lines[i], 0, dy);
    context.fillText(lines[i], 0, dy);
  }

  context.restore();
}
