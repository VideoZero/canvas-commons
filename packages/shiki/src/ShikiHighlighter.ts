import {CodeHighlighter, HighlightResult} from '@motion-canvas/2d';
import {DependencyContext, PromiseHandle} from '@motion-canvas/core';
import {
  HighlighterCore,
  LanguageRegistration,
  ThemeRegistration,
  ThemedToken,
  createHighlighterCore,
} from '@shikijs/core';
import {createJavaScriptRegexEngine} from '@shikijs/engine-javascript';

/**
 * Options for configuring the ShikiHighlighter.
 */
export type ShikiOptions = {
  /**
   * The language to use for syntax highlighting.
   *
   * @remarks
   * Import your language from `@shikijs/langs-precompiled/[lang]` or `@shikijs/langs/[lang]`.
   *
   * @example
   * ```ts
   * import typescript from '@shikijs/langs-precompiled/typescript';
   *
   * const highlighter = new ShikiHighlighter({
   *   lang: typescript,
   *   theme: nord,
   * });
   * ```
   */
  lang: LanguageRegistration | LanguageRegistration[];
  /**
   * The theme to use for syntax highlighting.
   *
   * @remarks
   * Import your theme from `@shikijs/themes/[theme]`.
   *
   * @example
   * ```ts
   * import nord from '@shikijs/themes/nord';
   *
   * const highlighter = new ShikiHighlighter({
   *   lang: typescript,
   *   theme: nord,
   * });
   * ```
   */
  theme: ThemeRegistration;
};

/**
 * A code highlighter that uses Shiki for syntax highlighting.
 *
 * @remarks
 * Shiki provides accurate syntax highlighting using TextMate grammars,
 * the same engine used by VS Code. Unlike the full shiki bundle, this
 * highlighter requires you to explicitly import only the languages and
 * themes you need, keeping bundle size minimal.
 *
 * @example
 * ```ts
 * import typescript from '@shikijs/langs-precompiled/typescript';
 * import nord from '@shikijs/themes/nord';
 *
 * const highlighter = new ShikiHighlighter({
 *   lang: typescript,
 *   theme: nord,
 * });
 *
 * yield view.add(
 *   <Code highlighter={highlighter} code={`const x = 42;`} />
 * );
 * ```
 */
export class ShikiHighlighter implements CodeHighlighter<ThemedToken[]> {
  private shikiOptions: ShikiOptions;
  private handle: PromiseHandle<HighlighterCore | null> | null;

  /**
   * Creates a new ShikiHighlighter instance.
   *
   * @param shikiOptions - Configuration options for the highlighter.
   */
  public constructor(shikiOptions: ShikiOptions) {
    this.shikiOptions = shikiOptions;
    this.handle = null;
  }

  /**
   * Initializes the Shiki highlighter.
   *
   * @remarks
   * This method is called automatically when the highlighter is first used.
   * It returns `true` when the highlighter is ready, or `false` if it's still
   * loading asynchronously.
   */
  public initialize(): boolean {
    if (this.handle?.value !== undefined) {
      return true;
    } else {
      const langs = Array.isArray(this.shikiOptions.lang)
        ? this.shikiOptions.lang
        : [this.shikiOptions.lang];
      this.handle = DependencyContext.collectPromise(
        createHighlighterCore({
          langs,
          themes: [this.shikiOptions.theme],
          engine: createJavaScriptRegexEngine(),
        }),
      );
      return false;
    }
  }

  private getLangName(): string {
    const lang = Array.isArray(this.shikiOptions.lang)
      ? this.shikiOptions.lang[0]
      : this.shikiOptions.lang;
    return lang.name;
  }

  private getThemeName(): string {
    return this.shikiOptions.theme.name!;
  }

  /**
   * Prepares the code for highlighting by tokenizing it.
   *
   * @param code - The code to prepare.
   * @returns An array of themed tokens.
   */
  public prepare(code: string): ThemedToken[] {
    const result = this.handle?.value?.codeToTokens(code, {
      lang: this.getLangName(),
      theme: this.getThemeName(),
    });
    return result?.tokens.flat() ?? [];
  }

  /**
   * Highlights the code at the given index.
   *
   * @param index - The character index to highlight.
   * @param cache - The prepared token cache from {@link prepare}.
   * @returns The highlight result containing the color and skip-ahead value.
   */
  public highlight(index: number, cache: ThemedToken[]): HighlightResult {
    const token = cache.find(
      token =>
        token.offset <= index && index < token.offset + token.content.length,
    );
    if (token) {
      return {
        color: token.color ?? null,
        skipAhead: token.offset + token.content.length - index,
      };
    } else {
      return {
        color: null,
        skipAhead: 0,
      };
    }
  }

  /**
   * Tokenizes the code into individual string tokens.
   *
   * @param code - The code to tokenize.
   * @returns An array of string tokens.
   */
  public tokenize(code: string): string[] {
    const lineTokens = this.handle?.value
      ?.codeToTokens(code, {
        lang: this.getLangName(),
        theme: this.getThemeName(),
      })
      .tokens.map(line => line.map(({content}) => content));
    const tokens = lineTokens?.flatMap((line, i) =>
      i === lineTokens.length - 1 ? line : [...line, '\n'],
    );
    return tokens ?? [];
  }
}
