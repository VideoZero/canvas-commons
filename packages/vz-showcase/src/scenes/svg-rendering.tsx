import {SVG, Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro} from '../shared/ui';

// An illustration as design tools export it: paint lives in a <style> block,
// a <use> clone is styled at the use site, and a dash array uses commas.
export const Exported = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
  <defs>
    <style>
      .sky{fill:#1f6feb}
      .sun{fill:#e3b341;stroke:#f0883e;stroke-width:6}
      .hill{fill:#3fb950}
      .path{fill:none;stroke:#e6edf3;stroke-width:5;stroke-dasharray:14, 8}
      .tree{fill:#196c2e}
    </style>
    <path id="tree" d="M0 0 L18 40 L-18 40 Z"/>
  </defs>
  <rect class="sky" width="400" height="240" rx="18"/>
  <circle class="sun" cx="310" cy="70" r="34"/>
  <path class="hill" d="M0 240 Q120 110 240 240 Z"/>
  <path class="hill" d="M150 240 Q300 120 400 200 L400 240 Z"/>
  <path class="path" d="M30 230 C120 170 220 210 380 150"/>
  <g class="tree"><use href="#tree" x="90" y="150"/><use href="#tree" x="130" y="160"/></g>
</svg>`;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'svg-rendering',
    'Read SVG paint from <style> classes, style <use> clones from the use site, parse "14, 8" dash arrays, Safari-safe sizes.',
    'fix',
  );
  caption(
    view,
    'An exported SVG whose colours are set by classes in a <style> block',
  );
  const svg = (<SVG svg={Exported} width={560} y={-10} opacity={0} />) as SVG;
  view.add(svg);
  view.add(
    <>
      <Txt
        y={190}
        fontFamily={Mono}
        fontSize={16}
        fill={Colors.muted}
        text={
          '<style>.sky{fill:#1f6feb} .sun{…} .hill{fill:#3fb950} .path{stroke-dasharray:14, 8}</style>'
        }
      />
      <Txt
        y={222}
        fontFamily={Sans}
        fontSize={20}
        fill={Colors.text}
        text="Expected: blue sky, yellow sun, green hills, dashed white path, dark trees"
      />
    </>,
  );
  yield* svg.opacity(1, 0.6);
  yield* waitFor(4.5);
});
