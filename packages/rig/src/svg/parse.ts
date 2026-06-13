import {Vector2} from '@motion-canvas/core';

export interface ReferencePoint {
  id: string; // svg element id, e.g. 'rp-left-hip'
  role: string; // data-reference-point value, e.g. 'leftHip'
  pos: Vector2; // position in the SVG's own viewBox coordinates
}

export interface PartDef {
  name: string; // data-rig-part, e.g. 'leftUpperArm'
  id: string; // group element id
  parent: string | null; // data-parent
  pivotRef: string; // role of the joint this part rotates about
  startRef?: string;
  endRef?: string; // role of the joint at the far end of the bone
  groupSvg: string; // this <g> sliced into a standalone <svg> for rendering
}

export interface ParsedCharacter {
  viewBox: [number, number, number, number];
  referencePoints: Record<string, ReferencePoint>; // keyed by role
  parts: Record<string, PartDef>; // keyed by name
  layers: Record<string, string>; // any group id → sliced standalone svg
  rawSvg: string;
}

/** Regex fallback for environments without a DOM (returns reference points only). */
function parseReferencePointsRegex(svgText: string): Record<string, ReferencePoint> {
  const out: Record<string, ReferencePoint> = {};
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`))?.[1];
  for (const m of svgText.matchAll(/<circle\b[^>]*\bdata-reference-point\b[^>]*>/g)) {
    const tag = m[0];
    const role = attr(tag, 'data-reference-point');
    const cx = Number(attr(tag, 'cx'));
    const cy = Number(attr(tag, 'cy'));
    if (role && Number.isFinite(cx) && Number.isFinite(cy)) {
      out[role] = {id: attr(tag, 'id') ?? '', role, pos: new Vector2(cx, cy)};
    }
  }
  return out;
}

/**
 * Parse an annotated character SVG into a {@link ParsedCharacter}.
 *
 * Recognised annotations:
 *   • `<circle data-reference-point="role" cx cy>` — a joint / anchor.
 *   • `<g data-rig-part="name" data-parent data-pivot-ref data-start-ref
 *        data-end-ref>` — a riggable body part (sliced for 'svg' rendering).
 */
export function parseCharacterSvg(svgText: string): ParsedCharacter {
  const hasDom = typeof DOMParser !== 'undefined';
  if (!hasDom) {
    return {
      viewBox: [0, 0, 100, 100],
      referencePoints: parseReferencePointsRegex(svgText),
      parts: {},
      layers: {},
      rawSvg: svgText,
    };
  }

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg')!;
  const vbAttr = svgEl.getAttribute('viewBox') ?? '0 0 100 100';
  const vb = vbAttr.split(/[\s,]+/).map(Number) as [number, number, number, number];

  // Carry shared <defs>/<style> into every slice so colours/gradients survive.
  const carry = Array.from(svgEl.querySelectorAll(':scope > defs, :scope > style'))
    .map(n => n.outerHTML)
    .join('');
  const sliceGroup = (g: Element) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbAttr}">${carry}${g.outerHTML}</svg>`;

  const referencePoints: Record<string, ReferencePoint> = {};
  svgEl.querySelectorAll('[data-reference-point]').forEach(el => {
    const role = el.getAttribute('data-reference-point')!;
    referencePoints[role] = {
      id: el.id,
      role,
      pos: new Vector2(Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))),
    };
  });

  const parts: Record<string, PartDef> = {};
  svgEl.querySelectorAll('[data-rig-part]').forEach(el => {
    const name = el.getAttribute('data-rig-part')!;
    if (name === 'root') return; // the root wrapper is not itself a bone
    parts[name] = {
      name,
      id: el.id,
      parent: el.getAttribute('data-parent'),
      pivotRef: el.getAttribute('data-pivot-ref') ?? 'root',
      startRef: el.getAttribute('data-start-ref') ?? undefined,
      endRef: el.getAttribute('data-end-ref') ?? undefined,
      groupSvg: sliceGroup(el),
    };
  });

  const layers: Record<string, string> = {};
  svgEl.querySelectorAll('g[id]').forEach(g => (layers[g.id] = sliceGroup(g)));

  return {viewBox: vb, referencePoints, parts, layers, rawSvg: svgText};
}

/** Alias — reads naturally as "parse an SVG into a rig". */
export const parseSvgRig = parseCharacterSvg;
