// Dependabot bodies hold release notes with unwrappable lines. Headers come
// from .github/dependabot.yml; any other header still gets linted.
const isDependabotBump = commit =>
  /^(chore|ci)\(deps(-dev)?\): bump /.test(commit) &&
  commit.includes('Signed-off-by: dependabot[bot]');

module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [commit => commit.includes('[skip ci]'), isDependabotBump],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        '2d',
        'core',
        'create',
        'd3-geo',
        'deps',
        'deps-dev',
        'docs',
        'e2e',
        'echarts',
        'editor',
        'examples',
        'ffmpeg',
        'fiddle',
        'legacy',
        'player',
        'shiki',
        'rig',
        'three',
        'vite-plugin',
        'webcodecs',
      ],
    ],
  },
};
