import {Code, CodeHighlighter, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';
import {Colors, Mono, caption, intro, loadOptional} from '../shared/ui';

const Before = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}`;

const After = `// Shiki: TextMate grammars + VS Code themes
function greet(name: string, excited = false): string {
  const punctuation = excited ? '!' : '.';
  return \`Hello, \${name}\${punctuation}\`;
}`;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'shiki',
    "@canvas-commons/shiki: a ShikiHighlighter for Code using Shiki's TextMate grammars and themes (Langs, Themes).",
    'package',
  );
  const shiki = (yield loadOptional(
    () => import('@canvas-commons/shiki'),
  )) as Record<string, unknown>;
  const ShikiHighlighter = shiki.ShikiHighlighter as
    (new (options: Record<string, unknown>) => unknown) | undefined;
  const langs = shiki.Langs as Record<string, unknown> | undefined;
  const themes = shiki.Themes as Record<string, unknown> | undefined;
  const highlighter =
    ShikiHighlighter && langs && themes
      ? (new ShikiHighlighter({
          lang: langs.typescript,
          theme: themes.githubDark,
        }) as CodeHighlighter)
      : undefined;
  caption(
    view,
    highlighter
      ? 'new ShikiHighlighter({lang: Langs.typescript, theme: Themes.githubDark})'
      : 'ShikiHighlighter not available on canvas-commons main — default highlighter',
    -230,
  ).fill(highlighter ? Colors.green : Colors.red);
  const code = (
    <Code
      code={Before}
      fontFamily={Mono}
      fontSize={26}
      {...(highlighter ? {highlighter} : {})}
    />
  ) as Code;
  view.add(code);
  yield code;
  yield* waitFor(1);
  yield* code.code(After, 1.5);
  yield* waitFor(3);
});
