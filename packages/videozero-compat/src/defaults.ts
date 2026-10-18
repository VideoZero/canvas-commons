import {
  Layout,
  Node,
  Shape,
  TextCenter,
  Txt,
  attributionConfig,
  configureAttribution,
  getPropertyMeta,
} from '@canvas-commons/2d';
import {AnimTxt} from './AnimTxt';

/**
 * The font stack VideoZero used when no `fontFamily` is set.
 */
export const VideoZeroFontFamily = 'Inter, system-ui, sans-serif';

/**
 * The font stack VideoZero drew media attributions in.
 */
export const VideoZeroAttributionFontFamily =
  'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, ' +
  'Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, ' +
  'source-sans-pro, sans-serif';

/**
 * The query parameter VideoZero read media attributions from.
 */
export const VideoZeroAttributionParam = 'vz_attribution';

/**
 * Re-apply the defaults of VideoZero that Canvas Commons exposes as public
 * settings.
 *
 * @remarks
 * Sets:
 * - `Txt.defaultTextCenter` to `'cap'`,
 * - `Txt.defaultCenterLetterSpacing` to `true`,
 * - `Txt.defaultSmooth` to `true` (sub-pixel smooth text, as in VideoZero),
 * - `Txt.warnTightLineHeight`, `Node.warnVisibleBeforeEntrance` and
 *   `Layout.warnIgnoredPosition` to `true`,
 * - the default `strokeFirst` of every shape to `true`,
 * - `AnimTxt.defaultLineJoin` to `'round'` (plain `Txt` keeps `'miter'`),
 * - the attribution query parameter to `vz_attribution` and its font to
 *   VideoZero's rounded font stack.
 *
 * Call it once, before the scenes create their nodes, for example at the top
 * of `project.ts`. The default font can't be changed this way; see
 * {@link applyVideoZeroViewDefaults}. For the `Latex` fragment box padding use
 * {@link AnimLatex}.
 *
 * @example
 * ```ts
 * import {applyVideoZeroDefaults} from '@videozero/compat';
 *
 * applyVideoZeroDefaults();
 *
 * export default makeProject({scenes: [example]});
 * ```
 *
 * @returns A function that restores the values from before the call.
 */
export function applyVideoZeroDefaults(): () => void {
  const strokeFirst = getPropertyMeta<boolean>(Shape.prototype, 'strokeFirst');
  const previous = {
    textCenter: Txt.defaultTextCenter,
    centerLetterSpacing: Txt.defaultCenterLetterSpacing,
    smooth: Txt.defaultSmooth,
    tightLineHeight: Txt.warnTightLineHeight,
    visibleBeforeEntrance: Node.warnVisibleBeforeEntrance,
    ignoredPosition: Layout.warnIgnoredPosition,
    strokeFirst: strokeFirst?.default,
    lineJoin: AnimTxt.defaultLineJoin,
    queryParam: attributionConfig.queryParam,
    attributionFont: attributionConfig.render.fontFamily,
  };

  Txt.defaultTextCenter = 'cap' satisfies TextCenter;
  Txt.defaultCenterLetterSpacing = true;
  Txt.defaultSmooth = true;
  Txt.warnTightLineHeight = true;
  Node.warnVisibleBeforeEntrance = true;
  Layout.warnIgnoredPosition = true;
  if (strokeFirst) strokeFirst.default = true;
  AnimTxt.defaultLineJoin = 'round';
  configureAttribution({
    queryParam: VideoZeroAttributionParam,
    render: {fontFamily: VideoZeroAttributionFontFamily},
  });

  return () => {
    Txt.defaultTextCenter = previous.textCenter;
    Txt.defaultCenterLetterSpacing = previous.centerLetterSpacing;
    Txt.defaultSmooth = previous.smooth;
    Txt.warnTightLineHeight = previous.tightLineHeight;
    Node.warnVisibleBeforeEntrance = previous.visibleBeforeEntrance;
    Layout.warnIgnoredPosition = previous.ignoredPosition;
    if (strokeFirst) strokeFirst.default = previous.strokeFirst;
    AnimTxt.defaultLineJoin = previous.lineJoin;
    configureAttribution({
      queryParam: previous.queryParam,
      render: {fontFamily: previous.attributionFont},
    });
  };
}

/**
 * Re-apply the defaults of VideoZero that live on the view of a scene: the
 * Inter font stack, inherited by every node that doesn't set its own
 * `fontFamily`.
 *
 * @example
 * ```tsx
 * export default makeScene2D(function* (view) {
 *   applyVideoZeroViewDefaults(view);
 *   view.add(<AnimTxt text="Set in Inter" />);
 * });
 * ```
 *
 * @param view - The view of the scene, or any layout to apply them to.
 */
export function applyVideoZeroViewDefaults(view: Layout): void {
  view.fontFamily(VideoZeroFontFamily);
}
