// Wiring characterization for `init`/`update`/`doctor`, captured on the
// UNMODIFIED command files (design.md "Migration steps" #1, tasks.md 1.2).
// Track T3 (init.ts/update.ts/doctor.ts) is gated on three other changes
// merging; when it lands, task 5.2 re-takes this baseline on the rebased,
// still-unmodified tree, and every case below must still match after T3's
// edit. Golden mechanism matches `harness-render.test.ts`: committed raw
// files/JSON, regenerated only under `COSPEC_GOLDEN_WRITE=1`, otherwise
// compared for exact equality (design.md decision 14).
//
// Every case drives the built-from-source CLI as a subprocess (`cospec()`),
// never by importing `init.ts`/`update.ts`/`doctor.ts` — the same discipline
// `test/fixtures/support.ts` documents for the rest of this suite.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { computeContentHash } from '../../src/core/managed-files.ts'
import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

// `init --harness all` also writes minimax-code's skills under the home directory, so every
// case gets its own HOME (a sibling of its repo, never the real one) and no USERPROFILE. A
// shared home would leak one case's skills into the next case's detection.
const homes = new Set<string>()

const cospecHome = (args: string[], opts: { cwd: string; env?: Record<string, string> }) => {
  const home = `${opts.cwd}-home`
  mkdirSync(home, { recursive: true })
  homes.add(home)
  return cospec(args, {
    ...opts,
    env: { HOME: home, ...opts.env },
    unset: ['USERPROFILE'],
  })
}

afterAll(() => {
  cleanupAll()
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

const GOLDEN_ROOT = join(import.meta.dir, '__golden__/harness-wiring')
const WRITE = process.env.COSPEC_GOLDEN_WRITE === '1'

/** Replace every occurrence of the (volatile) temp repo path with a stable placeholder. */
function normalize(text: string, root: string): string {
  return text.split(root).join('<TMP>')
}

/**
 * A fresh temp repo, resolved to its real (symlink-free) path. `process.cwd()`
 * inside a spawned child reports the OS-canonical path — on macOS that means
 * `/private/var/...`, not the `/var/...` string `mkdtempSync` returns — so
 * `normalize()` must diff against the same canonical form the child's stdout
 * actually contains, or a leftover `/private` prefix would bake a macOS-only
 * path into the committed golden.
 */
function tempRepo(opts: Parameters<typeof mkTempRepo>[0] = {}): string {
  return realpathSync(mkTempRepo(opts))
}

/** Compare `content` against the committed golden at `rel`, or (write mode) record it. */
function compareOrWriteGolden(rel: string, content: string): void {
  const path = join(GOLDEN_ROOT, rel)
  if (WRITE) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    return
  }
  expect(content).toBe(readFileSync(path, 'utf8'))
}

/**
 * A temp dir with no `~/.config/openspec/config.json` of its own, so
 * `doctor`'s `checkGlobalProfile` (which reads the real machine's home
 * directory) never adds a machine-dependent finding to a golden capture.
 */
function isolatedConfigHome(): string {
  return tempRepo()
}

// --- 1. init receipts: per harness, all, none, and the auto-detected default (verification 3.1) ---

describe('init receipts', () => {
  const cases: { name: string; harnessArgs: string[] }[] = [
    { name: 'claude', harnessArgs: ['--harness', 'claude'] },
    { name: 'codex', harnessArgs: ['--harness', 'codex'] },
    { name: 'opencode', harnessArgs: ['--harness', 'opencode'] },
    { name: 'agents', harnessArgs: ['--harness', 'agents'] },
    { name: 'all', harnessArgs: ['--harness', 'all'] },
    { name: 'none', harnessArgs: ['--harness', 'none'] },
    // No `--harness`: state A (a bare `git init`) has nothing to detect, so
    // `selectHarnesses` auto-applies the documented default and prints its note.
    { name: 'default', harnessArgs: [] },
  ]

  for (const c of cases) {
    test(`--harness ${c.name} receipt is byte-identical`, async () => {
      const root = tempRepo({ git: true })
      const res = await cospecHome(['init', ...c.harnessArgs, '--no-gate', '--yes'], { cwd: root })
      expect(res.exitCode).toBe(0)
      compareOrWriteGolden(`init-receipts/${c.name}.txt`, normalize(res.stdout, root))
    })
  }
})

describe('init — invalid --harness value', () => {
  test('message and exit code are stable', async () => {
    const root = tempRepo({ git: true })
    const res = await cospecHome(['init', '--harness', 'bogus', '--no-gate', '--yes'], {
      cwd: root,
    })
    compareOrWriteGolden(
      'invalid-harness.json',
      `${JSON.stringify(
        { exitCode: res.exitCode, stderr: normalize(res.stderr, root) },
        null,
        2,
      )}\n`,
    )
  })
})

// --- 2. init auto-detection + detectHarnesses over the verification 3.2 fixtures ---

type DetectionFixture =
  | 'claude-only'
  | 'codex-migrated'
  | 'codex-legacy'
  | 'agents-only'
  | 'codex-plus-agents'
  | 'all-four'

const DETECTION_FIXTURES: Record<DetectionFixture, string> = {
  'claude-only': 'claude',
  'codex-migrated': 'codex',
  'codex-legacy': 'codex',
  'agents-only': 'agents',
  'codex-plus-agents': 'codex,agents',
  'all-four': 'all',
}

/** Build one of the verification-3.2 detection fixtures in a fresh temp repo. */
async function seedDetectionFixture(kind: DetectionFixture, root: string): Promise<void> {
  await cospecHome(['init', '--harness', DETECTION_FIXTURES[kind], '--no-gate', '--yes'], {
    cwd: root,
  })
  if (kind === 'codex-legacy') {
    // Pre-migration layout: the shared skills tree still sits at the legacy
    // `.codex/skills` root, never having moved to `.agents/skills`.
    renameSync(join(root, '.agents/skills'), join(root, '.codex/skills'))
    rmSync(join(root, '.agents'), { recursive: true, force: true })
  }
}

describe('detection — init auto-detect (path existence) vs detectHarnesses (sentinel evidence)', () => {
  for (const kind of Object.keys(DETECTION_FIXTURES) as DetectionFixture[]) {
    test(`${kind}`, async () => {
      const root = tempRepo({ git: true })
      await seedDetectionFixture(kind, root)

      // `detectHarnesses` (update's/doctor's sentinel-based detection), read
      // through `update --check --json` so nothing here imports the command
      // module directly. `--check` is a dry run: it never mutates the fixture.
      const checkRes = await cospecHome(['update', '--check', '--json'], { cwd: root })
      const checked = JSON.parse(checkRes.stdout) as { harnesses: string[] }
      compareOrWriteGolden(
        `detect-harnesses/${kind}.json`,
        `${JSON.stringify({ harnesses: checked.harnesses }, null, 2)}\n`,
      )

      // Init's own path-existence auto-detect, run last: unlike `update
      // --check`, a bare `init` with no `--harness` writes.
      const initRes = await cospecHome(['init', '--json', '--no-gate', '--yes'], { cwd: root })
      const inited = JSON.parse(initRes.stdout) as { harnesses: string[] }
      compareOrWriteGolden(
        `init-auto-detect/${kind}.json`,
        `${JSON.stringify({ harnesses: inited.harnesses }, null, 2)}\n`,
      )
    })
  }

  test('agents is detected by its skills dir, never by a bare .agents/', async () => {
    const root = tempRepo({ git: true })
    mkdirSync(join(root, '.agents'), { recursive: true })
    writeFileSync(join(root, '.agents/AGENTS.md'), '# notes\n')
    const bare = await cospecHome(['init', '--json', '--no-gate', '--yes'], { cwd: root })
    expect((JSON.parse(bare.stdout) as { harnesses: string[] }).harnesses).toEqual(['claude'])

    const seeded = tempRepo({ git: true })
    mkdirSync(join(seeded, '.agents/skills/cospec-propose'), { recursive: true })
    writeFileSync(join(seeded, '.agents/skills/cospec-propose/SKILL.md'), '# propose\n')
    const detected = await cospecHome(['init', '--json', '--no-gate', '--yes'], { cwd: seeded })
    expect((JSON.parse(detected.stdout) as { harnesses: string[] }).harnesses).toEqual(['agents'])
  })

  test("a bare .codex directory holding a user's config.toml no longer selects codex", async () => {
    const root = tempRepo({ git: true })
    mkdirSync(join(root, '.codex'), { recursive: true })
    writeFileSync(join(root, '.codex/config.toml'), 'model = "o3"\n')
    const res = await cospecHome(['init', '--json', '--no-gate', '--yes'], { cwd: root })
    expect((JSON.parse(res.stdout) as { harnesses: string[] }).harnesses).not.toContain('codex')
  })

  test('an agents-only repo never acquires .codex/rules/cospec.rules', async () => {
    const root = tempRepo({ git: true })
    await seedDetectionFixture('agents-only', root)
    expect(existsSync(join(root, '.codex/rules/cospec.rules'))).toBe(false)
  })
})

// --- 3. update — removal containment (verification 3.3) ---

describe('update — removal containment', () => {
  test('unmodified files under the 5 managed roots are removed; foreign manifest keys are ignored', async () => {
    const root = tempRepo({ git: true })
    await cospecHome(['init', '--harness', 'all', '--no-gate', '--yes'], { cwd: root })

    const manifestFile = join(root, 'openspec/.cospec-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      cospecVersion: string
      files: Record<string, string>
    }

    // One unmodified, no-longer-emitted file per managed root — legitimate
    // removal candidates once `resolveContainedPath` clears them.
    const leftovers: Record<string, string> = {
      'openspec/schemas/legacy-type/schema.yaml': 'type: legacy-type\n',
      '.claude/leftover.md': 'leftover\n',
      '.agents/leftover.md': 'leftover\n',
      '.opencode/leftover.md': 'leftover\n',
      '.codex/leftover.md': 'leftover\n',
    }
    for (const [relpath, content] of Object.entries(leftovers)) {
      const abs = join(root, relpath)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
      manifest.files[relpath] = computeContentHash(content)
    }
    // Two foreign/poisoned keys: outside every managed root, so containment
    // must skip them without ever touching the filesystem for them.
    manifest.files['.foo/x'] = computeContentHash('anything\n')
    manifest.files['../victim.txt'] = computeContentHash('anything\n')
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)

    const res = await cospecHome(['update', '--json'], { cwd: root })
    const parsed = JSON.parse(res.stdout) as { files: { path: string; outcome: string }[] }
    const byPath = new Map(parsed.files.map((f) => [f.path, f.outcome]))

    // Safety property, asserted directly rather than only captured: a
    // poisoned or foreign manifest key is never even reported.
    expect(byPath.has('.foo/x')).toBe(false)
    expect(byPath.has('../victim.txt')).toBe(false)
    expect(existsSync(join(root, '.foo/x'))).toBe(false)

    const observed = Object.keys(leftovers)
      .toSorted()
      .map((path) => ({ path, outcome: byPath.get(path) ?? null }))
    compareOrWriteGolden('removal-containment.json', `${JSON.stringify(observed, null, 2)}\n`)
  }, 60_000)
})

// --- 4. doctor — human + --json (verification 3.4) ---

describe('doctor findings', () => {
  test('opsx leftovers, a dangling ref, a stale sidecar, and a legacy .codex/skills copy', async () => {
    const root = tempRepo({ git: true })
    await cospecHome(['init', '--harness', 'all', '--no-gate', '--yes'], { cwd: root })

    writeFiles(root, {
      // Opsx leftover under the shared `.agents/skills/` root (openspec-authored).
      '.agents/skills/openspec-propose/SKILL.md':
        '---\nname: openspec-propose\nmetadata:\n  author: openspec\n  generatedBy: 1.13.1\n---\n\nOpenspec body.\n',
      // Opsx leftover under `.claude/`, carrying a dangling `/cospec:` reference too.
      '.claude/commands/cospec/opsx-and-dangling.md':
        '---\nname: "OPSX: Old Propose"\n---\n\nSee /cospec:not-a-real-workflow for details.\n',
      // An unreconciled `.cospec-new` sidecar.
      '.claude/skills/cospec-propose/SKILL.md.cospec-new': 'stale sidecar body\n',
    })

    // A legacy `.codex/skills` copy of a skill cospec now writes to `.agents/skills`.
    const skillBody = readFileSync(join(root, '.agents/skills/cospec-propose/SKILL.md'))
    mkdirSync(join(root, '.codex/skills/cospec-propose'), { recursive: true })
    writeFileSync(join(root, '.codex/skills/cospec-propose/SKILL.md'), skillBody)

    const env = { XDG_CONFIG_HOME: isolatedConfigHome() }

    const human = await cospecHome(['doctor'], { cwd: root, env })
    const json = await cospecHome(['doctor', '--json'], { cwd: root, env })
    const parsedJson = JSON.parse(json.stdout) as {
      findings: { level: string; check: string; message: string; remedy?: string }[]
      summary: { errors: number; warnings: number; infos: number }
    }

    compareOrWriteGolden(
      'doctor/human.json',
      `${JSON.stringify(
        { exitCode: human.exitCode, stdout: normalize(human.stdout, root) },
        null,
        2,
      )}\n`,
    )
    compareOrWriteGolden(
      'doctor/json.json',
      `${JSON.stringify(
        { exitCode: json.exitCode, findings: parsedJson.findings, summary: parsedJson.summary },
        null,
        2,
      )}\n`,
    )
  }, 60_000)
})
