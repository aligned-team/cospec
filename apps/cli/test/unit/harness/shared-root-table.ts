import {
  buildOpencodeCommandFrontmatter,
  type HarnessAdapter,
} from '../../../src/harness/adapters.ts'

// The four upstream tools on the `.agents` root, as rows, in cospec's table order (shipped
// rows first, then upstream's): codex (rules file, legacy `.codex`), agents, antigravity
// (a command surface, legacy `.agent`), zed. `claude` sits alone on its own root.
export const row = (id: string, extra: Partial<HarnessAdapter> = {}): HarnessAdapter => ({
  id,
  displayName: id,
  skillsDir: '.agents',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: false,
  detectionPaths: ['.agents/skills'],
  ...extra,
})

export const SHARED_ROOT_TABLE: readonly HarnessAdapter[] = [
  row('claude', { skillsDir: '.claude', bodyDialect: 'canonical', detectionPaths: ['.claude'] }),
  row('codex', {
    legacySkillsDirs: ['.codex'],
    rulesPath: '.codex/rules/cospec.rules',
    detectionPaths: ['.agents/skills', '.codex/skills'],
  }),
  row('agents'),
  row('antigravity', {
    bodyDialect: 'flat',
    legacySkillsDirs: ['.agent'],
    detectionPaths: ['.agent', '.agents/workflows'],
    commands: {
      dir: '.agents/workflows',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
    },
  }),
  row('zed', { detectionPaths: ['.zed', '.agents/skills'] }),
]
