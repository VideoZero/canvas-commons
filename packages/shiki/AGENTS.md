# @canvas-commons/shiki

A `CodeHighlighter` for the 2d `Code` node backed by
[Shiki](https://shiki.style) (TextMate grammars and VS Code themes), using
Shiki's JavaScript regex engine so no WebAssembly is loaded.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm shiki:build                                  # tsdown
pnpm shiki:test                                   # vitest run
pnpm --filter @canvas-commons/shiki run lint:pkg
```

## Where things live

```
src/ShikiHighlighter.ts  The highlighter: async init, token lookup, tokenizer.
src/Langs.ts             Re-exports of common @shikijs/langs grammars.
src/Themes.ts            Re-exports of common @shikijs/themes themes.
```

## Traps

**Initialization is asynchronous.** `initialize()` registers the loading promise
with `DependencyContext.collectPromise` on every call until the highlighter is
ready, so whichever computed asked first is marked dirty when it resolves. Until
then `prepare` returns no tokens and `tokenize` falls back to `defaultTokenize`.

**Embedding grammars are arrays.** `@shikijs/langs/html` exports
`[...javascript, ...css, html]`; the last entry is the language to highlight.

## Used in the wild

```ts
import {Code} from '@canvas-commons/2d';
import {Langs, ShikiHighlighter, Themes} from '@canvas-commons/shiki';

Code.defaultHighlighter = new ShikiHighlighter({
  lang: Langs.typescript,
  theme: Themes.githubDark,
});
```
