import type {CodeHighlighter, HighlightResult} from '@canvas-commons/2d';
import {defaultTokenize} from '@canvas-commons/2d';
import {DependencyContext} from '@canvas-commons/core';
import type {
  HighlighterCore,
  LanguageRegistration,
  ThemeRegistration,
  ThemedToken,
} from '@shikijs/core';
import {createHighlighterCore} from '@shikijs/core';
import {createJavaScriptRegexEngine} from '@shikijs/engine-javascript';

/**
 * Options for configuring the {@link ShikiHighlighter}.
 */
export interface ShikiOptions {
  /**
   * The language used for highlighting.
   *
   * @remarks
   * Import it from `@shikijs/langs/<lang>` or use one of the {@link Langs}
   * re-exports. Grammars that embed other languages (such as `html`) are
   * arrays whose last entry is the main language; that entry is used for
   * highlighting while the rest are loaded as dependencies.
   */
  lang: LanguageRegistration | LanguageRegistration[];

  /**
   * The theme used for highlighting.
   *
   * @remarks
   * Import it from `@shikijs/themes/<theme>` or use one of the {@link Themes}
   * re-exports.
   */
  theme: ThemeRegistration;
}

/**
 * A code highlighter backed by {@link https://shiki.style | Shiki}.
 *
 * @remarks
 * Shiki uses TextMate grammars, the same as VS Code. Only the language and
 * theme passed to the constructor are bundled, and the JavaScript regex engine
 * is used so no WebAssembly is needed. The grammar is loaded asynchronously;
 * scenes wait for it before rendering.
 *
 * @example
 * ```tsx
 * import {Code, makeScene2D} from '@canvas-commons/2d';
 * import {Langs, ShikiHighlighter, Themes} from '@canvas-commons/shiki';
 *
 * const highlighter = new ShikiHighlighter({
 *   lang: Langs.typescript,
 *   theme: Themes.githubDark,
 * });
 *
 * export default makeScene2D(function* (view) {
 *   view.add(<Code highlighter={highlighter} code={`const x = 42;`} />);
 * });
 * ```
 */
export class ShikiHighlighter implements CodeHighlighter<ThemedToken[]> {
  private readonly langs: LanguageRegistration[];
  private highlighter: HighlighterCore | null = null;
  private loading: Promise<HighlighterCore> | null = null;

  /**
   * @param options - The language and theme to highlight with.
   */
  public constructor(private readonly options: ShikiOptions) {
    this.langs = Array.isArray(options.lang) ? options.lang : [options.lang];
  }

  public initialize(): boolean {
    if (this.highlighter) {
      return true;
    }

    this.loading ??= createHighlighterCore({
      langs: this.langs,
      themes: [this.options.theme],
      engine: createJavaScriptRegexEngine(),
    }).then(highlighter => {
      this.highlighter = highlighter;
      return highlighter;
    });
    DependencyContext.collectPromise(this.loading);
    return false;
  }

  public prepare(code: string): ThemedToken[] {
    return this.codeToTokens(code)?.flat() ?? [];
  }

  public highlight(index: number, cache: ThemedToken[]): HighlightResult {
    let low = 0;
    let high = cache.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const token = cache[middle];
      if (index < token.offset) {
        high = middle - 1;
      } else if (index >= token.offset + token.content.length) {
        low = middle + 1;
      } else {
        return {
          color: token.color ?? null,
          skipAhead: token.offset + token.content.length - index,
        };
      }
    }

    return {color: null, skipAhead: 0};
  }

  public tokenize(code: string): string[] {
    const lines = this.codeToTokens(code);
    if (!lines) {
      return defaultTokenize(code);
    }

    const tokens: string[] = [];
    let current = 0;
    for (const token of lines.flat()) {
      if (token.offset > current) {
        tokens.push(code.slice(current, token.offset));
      }
      if (token.content !== '') {
        tokens.push(token.content);
      }
      current = token.offset + token.content.length;
    }
    if (current < code.length) {
      tokens.push(code.slice(current));
    }
    return tokens;
  }

  private codeToTokens(code: string): ThemedToken[][] | null {
    if (!this.highlighter) {
      return null;
    }

    const [theme] = this.highlighter.getLoadedThemes();
    return this.highlighter.codeToTokens(code, {
      lang: this.langs[this.langs.length - 1].name,
      theme,
    }).tokens;
  }
}
