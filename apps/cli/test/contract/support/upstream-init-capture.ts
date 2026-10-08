// The tests-owned regenerator for `test/fixtures/upstream-init/*.json`: the pinned
// OpenSpec binary's own `init --tools <id>` output, captured in a private sandbox
// per case. `harness-matrix.test.ts` compares cospec's render to these fixtures and
// `upstream-init-fixtures.test.ts` re-takes every capture and compares it to the
// committed file, so a pin bump fails until the fixtures are re-taken.
//
// A fixture holds the argv, the global config the run read, the exit code, stdout and
// stderr (sandbox paths respelled `<HOME>`/`<PROJECT>`), and for every file the run
// wrote: its path, scope (`project`, or `home` for a path relative to HOME), byte
// length, sha256 and the adapter's wrapper "head". Bodies are deliberately absent:
// cospec never emits an upstream `/opsx:*` template, so only paths, wrappers and
// receipts are oracle facts.
//
// The capture shape, reproduced here exactly:
// - `profile: custom` with all twelve workflows and `delivery: both`, because cospec
//   always writes twelve workflows until `workflow-profiles` lands;
// - one fresh git repo per case, `--no-color init --tools <ids>`;
// - HOME, USERPROFILE, the XDG dirs, CODEX_HOME and ZDOTDIR private to the sandbox and
//   `EDITOR=true` (`oracleEnv` plus `USERPROFILE`, which a home skills root resolves
//   before HOME);
// - the pinned binary under Node, resolved by package path, never `$PATH`.
//
// To re-take the fixtures after a pin bump:
//   COSPEC_FIXTURE_WRITE=1 bun test test/contract/upstream-init-fixtures.test.ts
// then `mise run format:fix` (oxfmt owns the files' layout; the test compares parsed
// values, so layout never decides a pass).

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { cleanup, mkTempRepo } from '../../fixtures/support.ts'
import { oracleEnv, oracleSpawn } from './upstream-oracle.ts'

export const FIXTURE_DIR = join(import.meta.dir, '../../fixtures/upstream-init')

/** The five workflows a `core` profile writes are not captured; cospec writes all twelve. */
export const CAPTURE_GLOBAL_CONFIG = {
  profile: 'custom',
  delivery: 'both',
  workflows: [
    'propose',
    'explore',
    'new',
    'continue',
    'apply',
    'update',
    'ff',
    'sync',
    'archive',
    'bulk-archive',
    'verify',
    'onboard',
  ],
} as const

/** How a file's wrapper "head" is cut out of the file. */
export type HeadRule = 'yaml-frontmatter' | 'markdown-header' | 'toml' | 'none'

export interface CapturedFile {
  path: string
  scope: 'project' | 'home'
  bytes: number
  sha256: string
  headRule: HeadRule
  head: string
}

export interface UpstreamInitCapture {
  openspec: string
  argv: string[]
  globalConfig: typeof CAPTURE_GLOBAL_CONFIG
  exitCode: number
  stdout: string
  stderr: string
  files: CapturedFile[]
}

/** One capture: the fixture's file name (without `.json`) and the `--tools` value. */
export interface CaptureCase {
  name: string
  tools: string
}

/** The two combinations committed beside the per-tool captures. */
export const COMBINATIONS: readonly CaptureCase[] = [
  { name: 'combo-shared-agents', tools: 'codex,agents,zed,antigravity' },
  { name: 'combo-all', tools: 'all' },
]

/** Every committed fixture name, sorted, from the directory itself. */
export function committedFixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .toSorted()
}

export function readFixture(name: string): UpstreamInitCapture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')) as UpstreamInitCapture
}

/** The case a fixture name stands for: a combination, else `--tools <name>`. */
export function captureCaseFor(name: string): CaptureCase {
  return COMBINATIONS.find((c) => c.name === name) ?? { name, tools: name }
}

/**
 * The wrapper of one file: the YAML frontmatter block, the Markdown `# name` header plus
 * its description paragraph, or the TOML preamble through `prompt = """`; empty for a
 * body-only file.
 */
export function cutHead(path: string, content: string): { headRule: HeadRule; head: string } {
  if (path.endsWith('.toml')) {
    const marker = 'prompt = """\n'
    const at = content.indexOf(marker)
    if (at === -1) throw new Error(`capture: ${path} is a .toml file with no \`prompt = """\``)
    return { headRule: 'toml', head: content.slice(0, at + marker.length) }
  }
  if (content.startsWith('---\n')) {
    const close = content.indexOf('\n---\n', 3)
    if (close === -1) throw new Error(`capture: ${path} opens a frontmatter block it never closes`)
    return { headRule: 'yaml-frontmatter', head: content.slice(0, close + '\n---\n'.length) }
  }
  if (content.startsWith('# ')) {
    const first = content.indexOf('\n\n')
    const second = first === -1 ? -1 : content.indexOf('\n\n', first + 2)
    if (second === -1) throw new Error(`capture: ${path} has a \`# \` header and no description`)
    return { headRule: 'markdown-header', head: content.slice(0, second + 2) }
  }
  return { headRule: 'none', head: '' }
}

function walkFiles(root: string, skip: (rel: string) => boolean): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const full = join(abs, entry.name)
      const rel = relative(root, full).split(sep).join('/')
      if (skip(rel)) continue
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.push(rel)
    }
  }
  walk(root)
  return out.toSorted()
}

function describeFile(root: string, rel: string, scope: 'project' | 'home'): CapturedFile {
  const buf = readFileSync(join(root, rel))
  return {
    path: rel,
    scope,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    ...cutHead(rel, buf.toString('utf8')),
  }
}

/**
 * A stray `node_modules/@fission-ai/openspec` above the sandbox would be found by the
 * binary's module resolution instead of the pinned package, so no capture may run under
 * a directory that has one.
 */
export function assertNoAncestorOpenspec(dir: string): void {
  let at = dirname(realpathSync(dir))
  for (;;) {
    if (existsSync(join(at, 'node_modules', '@fission-ai', 'openspec'))) {
      throw new Error(`capture: ${at}/node_modules/@fission-ai/openspec shadows the pinned binary`)
    }
    const up = dirname(at)
    if (up === at) return
    at = up
  }
}

/** Respell a sandbox path in the binary's output; the binary prints real paths. */
function respell(text: string, project: string, home: string): string {
  let out = text
  for (const [path, token] of [
    [realpathSync(project), '<PROJECT>'],
    [project, '<PROJECT>'],
    [realpathSync(home), '<HOME>'],
    [home, '<HOME>'],
  ] as const) {
    out = out.replaceAll(path, token)
  }
  return out
}

/** Run the pinned binary's `init --tools <tools>` in a fresh sandbox and describe what it wrote. */
export async function captureInit(tools: string): Promise<UpstreamInitCapture> {
  const sandbox = mkTempRepo()
  try {
    assertNoAncestorOpenspec(sandbox)
    const project = join(sandbox, 'project')
    mkdirSync(project)
    const git = Bun.spawnSync(['git', 'init', '-q'], { cwd: project })
    if (git.exitCode !== 0) throw new Error('capture: git init failed')

    const env = oracleEnv(sandbox)
    const home = env.HOME!
    const configDir = join(env.XDG_CONFIG_HOME!, 'openspec')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(CAPTURE_GLOBAL_CONFIG, null, 2))
    const homeBefore = new Set(walkFiles(home, () => false))

    const argv = ['--no-color', 'init', '--tools', tools]
    const spawn = oracleSpawn(argv, sandbox, { runtime: 'node', cwd: project })
    const proc = Bun.spawn(spawn.cmd, {
      cwd: spawn.cwd,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...spawn.env, USERPROFILE: home },
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    const projectFiles = walkFiles(project, (rel) => rel === '.git')
    // The sandbox's own XDG/Codex dirs are not a tool's output; a tool's home skills root is.
    const xdgDirs = new Set(['.config', '.local', '.cache'])
    const homeFiles = walkFiles(home, (rel) => xdgDirs.has(rel)).filter(
      (rel) => !homeBefore.has(rel),
    )

    return {
      openspec: JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../node_modules/@fission-ai/openspec/package.json'),
          'utf8',
        ),
      ).version as string,
      argv,
      globalConfig: CAPTURE_GLOBAL_CONFIG,
      exitCode,
      stdout: respell(stdout, project, home),
      stderr: respell(stderr, project, home),
      files: [
        ...projectFiles.map((rel) => describeFile(project, rel, 'project')),
        ...homeFiles.map((rel) => describeFile(home, rel, 'home')),
      ],
    }
  } finally {
    cleanup(sandbox)
  }
}

const unprivate = (s: string): string => s.replaceAll('/private<PROJECT>', '<PROJECT>')

/**
 * The comparable form of a capture. A committed fixture respells a macOS sandbox path
 * `/private<PROJECT>` where a fresh capture says `<PROJECT>` (the binary prints the real
 * path, the planning capture respelled only the unresolved prefix); both are the same
 * fact, so both sides are brought to `<PROJECT>`. Files are keyed by path, so the order a
 * directory walk produced is not part of the comparison.
 */
export function comparable(capture: UpstreamInitCapture): UpstreamInitCapture {
  return {
    ...capture,
    stdout: unprivate(capture.stdout),
    stderr: unprivate(capture.stderr),
    files: capture.files.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  }
}
