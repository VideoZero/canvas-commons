import {DependencyContext} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import * as Langs from './Langs';
import {ShikiHighlighter} from './ShikiHighlighter';
import * as Themes from './Themes';

async function ready(highlighter: ShikiHighlighter) {
  while (!highlighter.initialize()) {
    await DependencyContext.consumePromises();
  }
  return highlighter;
}

describe('ShikiHighlighter', () => {
  it('reports not ready until the grammar has loaded', async () => {
    const highlighter = new ShikiHighlighter({
      lang: Langs.typescript,
      theme: Themes.githubDark,
    });

    expect(highlighter.initialize()).toBe(false);
    expect(highlighter.initialize()).toBe(false);
    expect(DependencyContext.hasPromises()).toBe(true);

    await DependencyContext.consumePromises();
    expect(highlighter.initialize()).toBe(true);
    expect(DependencyContext.hasPromises()).toBe(false);
  });

  it('falls back to default output while loading', () => {
    const highlighter = new ShikiHighlighter({
      lang: Langs.typescript,
      theme: Themes.githubDark,
    });

    expect(highlighter.prepare('const x = 1;')).toEqual([]);
    expect(highlighter.highlight(0, [])).toEqual({color: null, skipAhead: 0});
    expect(highlighter.tokenize('const x = 1;').join('')).toBe('const x = 1;');
  });

  it('colors whole tokens', async () => {
    const highlighter = await ready(
      new ShikiHighlighter({lang: Langs.typescript, theme: Themes.githubDark}),
    );
    const code = 'const answer = 42;\nlet name = "x";';
    const cache = highlighter.prepare(code);

    const keyword = highlighter.highlight(0, cache);
    expect(keyword.color?.toLowerCase()).toBe('#f97583');
    expect(keyword.skipAhead).toBe('const'.length);

    const letIndex = code.indexOf('let');
    expect(highlighter.highlight(letIndex, cache)).toEqual({
      color: keyword.color,
      skipAhead: 'let'.length,
    });

    const number = highlighter.highlight(code.indexOf('42'), cache);
    expect(number.color).not.toBe(keyword.color);
    expect(number.skipAhead).toBe(2);
  });

  it('tokenizes losslessly across lines', async () => {
    const highlighter = await ready(
      new ShikiHighlighter({lang: Langs.python, theme: Themes.nord}),
    );
    const code = 'def f(x):\r\n    return x + 1\n\n# done\n';
    const tokens = highlighter.tokenize(code);

    expect(tokens.join('')).toBe(code);
    expect(tokens).toContain('def');
    expect(tokens).toContain('return');
    expect(tokens).not.toContain('');
  });

  it('highlights with the main language of embedding grammars', async () => {
    const highlighter = await ready(
      new ShikiHighlighter({lang: Langs.html, theme: Themes.githubLight}),
    );
    const code = '<!-- note -->\n<p>text</p>';

    expect(highlighter.highlight(0, highlighter.prepare(code))).toEqual({
      color: '#6A737D',
      skipAhead: '<!-- note -->'.length,
    });
  });
});
