import {Txt, makeScene2D} from '@canvas-commons/2d';
import {createSignal, waitFor} from '@canvas-commons/core';
import fraunces from '../assets/fraunces-600.woff2';
import {
  Colors,
  Mono,
  Sans,
  caption,
  from2d,
  intro,
  loadFont,
} from '../shared/ui';

interface FontFaceRequest {
  family: string;
  weight: number;
  style: string;
}
type SetFontResolver = (
  resolver: ((request: FontFaceRequest) => Promise<void> | void) | null,
) => void;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'font-resolver',
    'setFontResolver / googleFontsResolver declare fonts no stylesheet declares; Code waits for its web font.',
  );
  const requests = createSignal<string[]>([]);
  const setFontResolver = from2d<SetFontResolver>('setFontResolver');
  setFontResolver?.(request => {
    requests([
      ...requests(),
      `${request.family} ${request.weight} ${request.style}`,
    ]);
    if (request.family === 'Fraunces') {
      return loadFont('Fraunces', fraunces);
    }
  });
  caption(
    view,
    setFontResolver
      ? 'setFontResolver(req => …) loads the "Fraunces" family from a local file on demand'
      : 'setFontResolver is not available on canvas-commons main — nothing declares "Fraunces"',
  );
  view.add(
    <>
      <Txt
        y={-90}
        text="Fraunces, resolved on demand"
        fontFamily="Fraunces"
        fontWeight={600}
        fontSize={64}
        fill={Colors.text}
      />
      <Txt
        y={0}
        text={'<Txt fontFamily="Fraunces" fontWeight={600} />'}
        fontFamily={Mono}
        fontSize={20}
        fill={Colors.muted}
      />
      <Txt
        y={110}
        fontFamily={Sans}
        fontSize={22}
        fill={setFontResolver ? Colors.green : Colors.red}
        text={() =>
          setFontResolver
            ? `resolver was asked for ${requests().length} undeclared faces, incl. ${
                requests().find(r => r.startsWith('Fraunces')) ?? '…'
              }`
            : 'no resolver: the text falls back to the default font'
        }
      />
    </>,
  );
  yield* waitFor(5);
  setFontResolver?.(null);
});
