import {
  ColorSignal,
  DependencyContext,
  PossibleColor,
  SignalValue,
  SimpleSignal,
  TimingFunction,
  createSignal,
  threadable,
  unwrap,
  useLogger,
} from '@motion-canvas/core';
import {colorSignal, computed, initial, signal} from '../decorators';
import {ResourceCache} from '../utils';
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
  protected static cache = new ResourceCache<string>();

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
  public declare readonly icon: SimpleSignal<string, this>;

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
  public declare readonly color: ColorSignal<this>;

  /**
   * Bumped when a fetch completes to invalidate the iconSvg computed.
   */
  private cacheVersion = createSignal(0);

  private fetchPromise: Promise<string> | null = null;

  public constructor(props: IconProps) {
    super({
      ...props,
      svg: () => this.iconSvg(),
    });
  }

  protected override collectAsyncResources(): void {
    super.collectAsyncResources();

    if (this.fetchPromise) {
      DependencyContext.collectPromise(this.fetchPromise);
    }
  }

  @computed()
  protected iconSvg(): string {
    this.cacheVersion();

    const iconId = this.icon();

    if (iconId === null || iconId === undefined) {
      return PLACEHOLDER_SVG;
    }

    const color = this.color().hex();
    const cacheKey = `${iconId}::${color}`;

    const cached = Icon.cache.get(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    this.fetchPromise = Icon.fetchIconSvg(iconId, color).then((svg) => {
      if (this.icon() === iconId && this.color().hex() === color) {
        this.cacheVersion(this.cacheVersion() + 1);
      }
      return svg;
    });

    return PLACEHOLDER_SVG;
  }

  private static async fetchIconSvg(
    iconId: string,
    color: string,
  ): Promise<string> {
    const key = `${iconId}::${color}`;

    if (Icon.cache.has(key)) {
      return Icon.cache.get(key)!;
    }

    return Icon.cache
      .request(key, async () => {
        const iconPath = iconId.replace(':', '/');
        const encodedColor = encodeURIComponent(color);
        const url = `https://api.iconify.design/${iconPath}.svg?color=${encodedColor}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch icon: ${iconId}`);
        }
        return response.text();
      })
      .catch(error => {
        useLogger().error(`Error fetching icon ${iconId}: ${error}`);
        return PLACEHOLDER_SVG;
      });
  }
  
  @threadable()
  protected *tweenIcon(
    value: SignalValue<string>,
    time: number,
    timingFunction: TimingFunction,
  ) {
    const newIconId = unwrap(value);
    const color = this.color().hex();

    const newSvg: string = yield Icon.fetchIconSvg(newIconId, color);

    yield* this.svg(newSvg, time, timingFunction);
    this.icon.context.setter(newIconId);
  }
}
