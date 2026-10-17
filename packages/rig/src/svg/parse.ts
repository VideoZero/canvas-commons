import {Vector2} from '@canvas-commons/core';

export interface ReferencePoint {
  /**
   * The id of the SVG element, for example `'rp-left-hip'`.
   */
  id: string;
  /**
   * The `data-reference-point` value, for example `'leftHip'`.
   */
  role: string;
  /**
   * The position in the SVG's own viewBox coordinates.
   */
  pos: Vector2;
}

export interface PartDef {
  /**
   * The `data-rig-part` value, for example `'leftUpperArm'`.
   */
  name: string;
  /**
   * The id of the group element.
   */
  id: string;
  /**
   * The `data-parent` value.
   */
  parent: string | null;
  /**
   * The role of the joint this part rotates about.
   */
  pivotRef: string;
  startRef?: string;
  /**
   * The role of the joint at the far end of the bone.
   */
  endRef?: string;
  /**
   * The group sliced into a standalone SVG.
   */
  groupSvg: string;
}

export interface ParsedCharacter {
  viewBox: [number, number, number, number];
  /**
   * The reference points, by role.
   */
  referencePoints: Record<string, ReferencePoint>;
  /**
   * The rig parts, by name.
   */
  parts: Record<string, PartDef>;
  /**
   * Every group with an id, sliced into a standalone SVG.
   */
  layers: Record<string, string>;
  rawSvg: string;
}

const DefaultViewBox: [number, number, number, number] = [0, 0, 100, 100];

function parseViewBox(value: string | null): [number, number, number, number] {
  if (value === null) return DefaultViewBox;
  const numbers = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (numbers.length !== 4 || !numbers.every(Number.isFinite)) {
    return DefaultViewBox;
  }
  return [numbers[0], numbers[1], numbers[2], numbers[3]];
}

function parseReferencePointsRegex(
  svgText: string,
): Record<string, ReferencePoint> {
  const out: Record<string, ReferencePoint> = {};
  const attribute = (tag: string, name: string) =>
    tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`))?.[1];
  for (const match of svgText.matchAll(
    /<circle\b[^>]*\bdata-reference-point\b[^>]*>/g,
  )) {
    const tag = match[0];
    const role = attribute(tag, 'data-reference-point');
    const cx = Number(attribute(tag, 'cx'));
    const cy = Number(attribute(tag, 'cy'));
    if (role && Number.isFinite(cx) && Number.isFinite(cy)) {
      out[role] = {
        id: attribute(tag, 'id') ?? '',
        role,
        pos: new Vector2(cx, cy),
      };
    }
  }
  return out;
}

/**
 * Parse an annotated character SVG.
 *
 * @remarks
 * Recognized annotations:
 * - `circle` elements with `data-reference-point="role"`, `cx` and `cy`: a
 *   joint.
 * - `g` elements with `data-rig-part="name"` and the optional `data-parent`,
 *   `data-pivot-ref`, `data-start-ref`, and `data-end-ref` attributes: a body
 *   part that follows a bone in the `'svg'` render mode.
 *
 * Without a `DOMParser` (outside the browser), only the reference points of
 * `<circle>` elements are parsed.
 *
 * @example
 * ```ts
 * const character = parseCharacterSvg(heroSvg);
 * const rig = new Rig(character, BIPED, {render: 'svg'});
 * ```
 *
 * @param svgText - The SVG source.
 */
export function parseCharacterSvg(svgText: string): ParsedCharacter {
  const svgElement =
    typeof DOMParser === 'undefined'
      ? null
      : new DOMParser()
          .parseFromString(svgText, 'image/svg+xml')
          .querySelector('svg');
  if (!svgElement) {
    return {
      viewBox: DefaultViewBox,
      referencePoints: parseReferencePointsRegex(svgText),
      parts: {},
      layers: {},
      rawSvg: svgText,
    };
  }

  const viewBoxAttribute = svgElement.getAttribute('viewBox');
  const viewBox = parseViewBox(viewBoxAttribute);

  // Shared definitions travel with every slice so that colors and gradients
  // survive.
  const carry = Array.from(
    svgElement.querySelectorAll(':scope > defs, :scope > style'),
  )
    .map(node => node.outerHTML)
    .join('');
  const sliceGroup = (group: Element) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">${carry}${group.outerHTML}</svg>`;

  const referencePoints: Record<string, ReferencePoint> = {};
  svgElement.querySelectorAll('[data-reference-point]').forEach(element => {
    const role = element.getAttribute('data-reference-point');
    if (!role) return;
    referencePoints[role] = {
      id: element.id,
      role,
      pos: new Vector2(
        Number(element.getAttribute('cx')),
        Number(element.getAttribute('cy')),
      ),
    };
  });

  const parts: Record<string, PartDef> = {};
  svgElement.querySelectorAll('[data-rig-part]').forEach(element => {
    const name = element.getAttribute('data-rig-part');
    if (!name || name === 'root') return;
    parts[name] = {
      name,
      id: element.id,
      parent: element.getAttribute('data-parent'),
      pivotRef: element.getAttribute('data-pivot-ref') ?? 'root',
      startRef: element.getAttribute('data-start-ref') ?? undefined,
      endRef: element.getAttribute('data-end-ref') ?? undefined,
      groupSvg: sliceGroup(element),
    };
  });

  const layers: Record<string, string> = {};
  svgElement.querySelectorAll('g[id]').forEach(group => {
    layers[group.id] = sliceGroup(group);
  });

  return {viewBox, referencePoints, parts, layers, rawSvg: svgText};
}

/**
 * An alias of {@link parseCharacterSvg}.
 *
 * @example
 * ```ts
 * const character = parseSvgRig(heroSvg);
 * ```
 */
export const parseSvgRig = parseCharacterSvg;
