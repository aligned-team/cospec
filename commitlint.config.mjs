// commitlint.config.mjs — @commitlint/config-conventional + cospec overrides.
// See CONTRIBUTING.md "Commit format" for documentation on valid types and scopes.
// The 11 types are the same set cospec exposes as change schemas (`cospec new <type>`).
export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        // A scope names an AREA the commit touches; it must never just repeat
        // the type (e.g. `chore(chore):`), which carries no information.
        'scope-not-type': ({ type, scope }) =>
          scope === undefined || scope !== type
            ? [true]
            : [false, `scope must not repeat the type '${type}' — omit the scope instead`],
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'cli',
        'canon',
        'schemas',
        'harness',
        'validate',
        'apply',
        'archive',
        'eval',
        'bench',
        'docs',
        'ci',
        'deps',
        'hooks',
        'agents',
      ],
    ],
    'scope-not-type': [2, 'always'],
    'subject-max-length': [2, 'always', 72],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    'body-max-line-length': [2, 'always', 100],
  },
}
