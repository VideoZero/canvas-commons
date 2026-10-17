import {
  ColorSignal,
  DependencyContext,
  PossibleColor,
  SignalValue,
  SimpleSignal,
  TimingFunction,
  isReactive,
  threadable,
  useLogger,
} from '@canvas-commons/core';
import {colorSignal, computed, initial, signal} from '../decorators';
import {ResourceCache} from '../utils/ResourceCache';
import {SVG, SVGProps} from './SVG';

export interface IconProps extends Omit<SVGProps, 'svg'> {
  /**
   * {@inheritDoc Icon.icon}
   */
  icon: SignalValue<string>;

  /**
   * {@inheritDoc Icon.color}
   */
  color?: SignalValue<PossibleColor>;
}

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="none"/></svg>';

/**
 * An Icon Component that provides easy access to over 150k icons.
 * See https://icones.js.org/collection/all for all available Icons.
 */
export class Icon extends SVG {
  private static readonly svgCache = new ResourceCache<string>();

  /**
   * The identifier of the icon.
   *
   * @remarks
   * You can find identifiers on [Icônes](https://icones.js.org).
   * They can look like this:
   * * `mdi:language-typescript`
   * * `ph:anchor-simple-bold`
   * * `ph:activity-bold`
   */
  @signal()
  declare public readonly icon: SimpleSignal<string, this>;

  /**
   * The color of the icon
   *
   * @remarks
   * Provide the color in one of the following formats:
   * * named color like `red`, `darkgray`, …
   * * hexadecimal string with # like `#bada55`, `#141414`
   *   Value can be either RGB or RGBA: `#bada55`, `#bada55aa` (latter is partially transparent)
   *   The shorthand version (e.g. `#abc` for `#aabbcc` is also possible.)
   *
   * @defaultValue 'white'
   */
  @initial('white')
  @colorSignal()
  declare public readonly color: ColorSignal<this>;

  public constructor(props: IconProps) {
    super({
      ...props,
      svg: () => this.iconSvg(),
    });
  }

  protected override collectAsyncResources(): void {
    super.collectAsyncResources();
    this.iconSvg();
  }

  @computed()
  protected iconSvg(): string {
    const iconId = this.icon();
    if (iconId === null || iconId === undefined) {
      return PLACEHOLDER_SVG;
    }

    const color = this.color().hex();
    const cached = Icon.svgCache.get(Icon.cacheKey(iconId, color));
    if (cached !== undefined) {
      return cached;
    }

    // Collecting the fetch while the SVG is computed lets a render wait for the
    // icon instead of drawing the placeholder, and recomputes it once loaded.
    DependencyContext.collectPromise(Icon.fetchIconSvg(iconId, color));
    return PLACEHOLDER_SVG;
  }

  private static cacheKey(iconId: string, color: string) {
    return `${iconId}::${color}`;
  }

  private static fetchIconSvg(iconId: string, color: string): Promise<string> {
    // A failed icon is cached as the placeholder, so it is reported once
    // instead of being fetched again on every frame.
    return Icon.svgCache.request(Icon.cacheKey(iconId, color), async () => {
      const logger = useLogger();
      const iconPath = iconId.replace(':', '/');
      const encodedColor = encodeURIComponent(color);
      const url = `https://api.iconify.design/${iconPath}.svg?color=${encodedColor}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch icon: ${iconId}`);
        }
        return await response.text();
      } catch (error) {
        logger.error(`Error fetching icon ${iconId}: ${error}`);
        return PLACEHOLDER_SVG;
      }
    });
  }

  @threadable()
  protected *tweenIcon(
    value: SignalValue<string>,
    time: number,
    timingFunction: TimingFunction,
  ) {
    const newIconId = isReactive(value) ? value() : value;
    const color = this.color().hex();

    const newSvg: string = yield Icon.fetchIconSvg(newIconId, color);

    yield* this.svg(newSvg, time, timingFunction);
    this.icon.context.setter(newIconId);
  }
}
