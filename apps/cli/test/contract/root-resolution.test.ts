// Differential root-resolution matrix (change `root-resolution-parity`, ledger
// group 1 plus row 2.8). Every row builds a fresh sandbox (own HOME and XDG
// dirs, stores registered through the pinned binary), asks the pinned binary
// which root it selects (`openspec list --json` `.root`, or `.status[0]` on
// failure; `status --json` for the implicit-root row), then calls cospec's
// `resolveRoot` in-process in the same cwd and environment and requires the
// same answer.
//
// Each row is two tests over one fixture:
//   - `oracle:` (active) pins the binary to the ledger's outcome, so a broken
//     fixture fails loudly instead of hiding behind a red cospec row;
//   - `cospec:` compares `resolveRoot` against that oracle run.
//
// Expected cospec messages and fixes are the oracle's own text with every
// `openspec <command>` respelled `cospec <command>` (shipped output never names
// bare `openspec`), never a hard-coded copy. Paths are compared canonically:
// fixtures live under `tmpdir()` as spelled (a symlink on macOS), and only the
// expected side is `realpathSync`ed, so every row also pins design D3.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
  type ResolvedRoot,
  resolveRoot,
  RootSelectionError,
  type RootDiagnostic,
} from '../../src/core/root.ts'
import { cleanupAll, cospec, hashTree, openspec, writeFiles } from '../fixtures/support.ts'
import {
  captureStderr,
  makeSandbox,
  oracle,
  type OracleDiagnostic,
  type OracleRoot,
  type OracleRun,
  type Sandbox,
  setDefaultStore,
  setupStore,
  storePath,
  withSandboxEnv,
} from './support/root-sandbox.ts'

afterAll(cleanupAll)

interface CospecRoot {
  path: string
  source: string
  store_id?: string
}

type ResolverRun =
  | { kind: 'root'; root: CospecRoot; stderr: string }
  | { kind: 'error'; diagnostic: RootDiagnostic; message: string; stderr: string }

interface Fixture {
  cwd: string
  /** The `--store` flag the row passes, if any. */
  store?: string
}

type Expected = { root: OracleRoot } | { code: string }

/** `openspec <command>` -> `cospec <command>`; paths such as `…/openspec/config.yaml` are untouched. */
function respell(text: string): string {
  return text.replace(/(^|[^/\w.-])openspec (?=[a-z])/g, '$1cospec ')
}

const BARE_OPENSPEC_COMMAND = /(^|[^/\w.-])openspec\s+[a-z]/

const canonical = (path: string): string => realpathSync(path)

async function runResolver(sb: Sandbox, fx: Fixture): Promise<ResolverRun> {
  // `json: true` mirrors the oracle's `list --json`: the store banner is
  // human-mode only (design D10), while the ignored-pointer warning prints in
  // both modes.
  const flags: { store?: string; json?: boolean } =
    fx.store === undefined ? { json: true } : { store: fx.store, json: true }
  const { outcome, stderr } = await withSandboxEnv(sb, () =>
    captureStderr(() => resolveRoot({ cwd: fx.cwd, flags })),
  )
  if (outcome.ok) {
    const resolved: ResolvedRoot = outcome.value
    const root: CospecRoot = { path: resolved.base, source: resolved.source }
    if (resolved.store !== undefined) root.store_id = resolved.store
    return { kind: 'root', root, stderr }
  }
  const { error } = outcome
  if (!(error instanceof RootSelectionError)) throw error
  return { kind: 'error', diagnostic: error.diagnostic, message: error.message, stderr }
}

interface RowSpec {
  id: string
  title: string
  /** Stores registered in the sandbox (default `alpha`, `beta`). */
  stores?: readonly string[]
  setup: (sb: Sandbox) => Promise<Fixture> | Fixture
  expected: (sb: Sandbox, fx: Fixture) => Expected
  /** The implicit-root row reads `status --json`, since `list` refuses implicit roots. */
  oracleCommand?: 'list' | 'status'
  /** Further oracle facts the ledger row records. */
  oracleExtra?: (sb: Sandbox, fx: Fixture, o: OracleRun) => Promise<void> | void
  /** Replaces the default "message equals the respelled oracle message" check. */
  message?: (actual: string, o: OracleDiagnostic, sb: Sandbox, fx: Fixture) => void
  /** Replaces the default "fix equals the respelled oracle fix" check. */
  fix?: (actual: string | undefined, o: OracleDiagnostic) => void
}

function row(spec: RowSpec): void {
  describe(`${spec.id} ${spec.title}`, () => {
    let sb!: Sandbox
    let fx!: Fixture
    let o!: OracleRun

    beforeAll(async () => {
      sb = await makeSandbox(spec.stores)
      fx = await spec.setup(sb)
      const storeArgs = fx.store === undefined ? [] : ['--store', fx.store]
      o = await oracle(sb, fx.cwd, [spec.oracleCommand ?? 'list', '--json', ...storeArgs])
    })

    test('oracle: the pinned binary reports the ledger outcome', async () => {
      const expected = spec.expected(sb, fx)
      if ('root' in expected) {
        expect(o.exitCode).toBe(0)
        expect(o.root).toEqual(expected.root)
      } else {
        expect(o.exitCode).toBe(1)
        expect(o.root).toBeNull()
        expect(o.diagnostic?.code).toBe(expected.code)
      }
      await spec.oracleExtra?.(sb, fx, o)
    })

    const cospecTest = async (): Promise<void> => {
      const c = await runResolver(sb, fx)
      expect(c.stderr).toBe(o.stderr)
      if (o.diagnostic === undefined) {
        expect(c.kind).toBe('root')
        if (c.kind === 'root') expect(c.root).toEqual(o.root as CospecRoot)
        return
      }
      expect(c.kind).toBe('error')
      if (c.kind !== 'error') return
      const d = c.diagnostic
      expect(d.severity).toBe('error')
      expect(d.code).toBe(o.diagnostic.code)
      expect<string | undefined>(d.target).toBe(o.diagnostic.target)
      expect(c.message).toBe(`${d.message}\nFix: ${d.fix}`)
      expect(d.message).not.toMatch(BARE_OPENSPEC_COMMAND)
      expect(d.fix).toBeString()
      expect(d.fix).not.toMatch(BARE_OPENSPEC_COMMAND)
      if (spec.message === undefined) expect(d.message).toBe(respell(o.diagnostic.message))
      else spec.message(d.message, o.diagnostic, sb, fx)
      if (spec.fix === undefined) expect(d.fix).toBe(respell(o.diagnostic.fix ?? ''))
      else spec.fix(d.fix, o.diagnostic)
    }
    const label = 'cospec: resolveRoot matches the oracle'
    test(label, cospecTest)
  })
}

/** Create `<sandbox>/work/<name>` with `dirs` and `files` under it. */
function repo(
  sb: Sandbox,
  name: string,
  layout: { dirs?: string[]; files?: Record<string, string> } = {},
): string {
  const dir = join(sb.dir, 'work', name)
  mkdirSync(dir, { recursive: true })
  for (const d of layout.dirs ?? []) mkdirSync(join(dir, d), { recursive: true })
  writeFiles(dir, layout.files ?? {})
  return dir
}

function bare(sb: Sandbox): string {
  return repo(sb, 'bare')
}

/** M1's tree: a planning root (`openspec/changes/`) with a nested `src/deep`. */
function planningRoot(sb: Sandbox): string {
  return repo(sb, 'm1', { dirs: ['openspec/changes', 'src/deep'] })
}

const nearest = (dir: string): Expected => ({ root: { path: canonical(dir), source: 'nearest' } })

const storeRoot = (sb: Sandbox, id: string, source: string): Expected => ({
  root: { path: canonical(storePath(sb, id)), source, store_id: id },
})

const code = (c: string): Expected => ({ code: c })

/** Record the repo dir a fixture was built in, for `expected` to read back. */
const repos = new WeakMap<Fixture, string>()

function at(dir: string, cwd = dir, store?: string): Fixture {
  const fx: Fixture = store === undefined ? { cwd } : { cwd, store }
  repos.set(fx, dir)
  return fx
}

function repoOf(fx: Fixture): string {
  const dir = repos.get(fx)
  if (dir === undefined) throw new Error('fixture was not built with at()')
  return dir
}

const configOnly = (body: string, file = 'config.yaml'): { files: Record<string, string> } => ({
  files: { [`openspec/${file}`]: body },
})

/** `alpha`, `beta`, then a `gamma` for `breakGamma` to damage. */
const WITH_GAMMA = ['alpha', 'beta', 'gamma'] as const

function gammaRoot(sb: Sandbox): string {
  return storePath(sb, 'gamma')
}

function removeGammaMetadata(sb: Sandbox): void {
  rmSync(join(gammaRoot(sb), '.openspec-store', 'store.yaml'))
}

/** M16's layout: stores kept at `$HOME/openspec/<id>`, one of them named `specs`. */
async function homeStores(sb: Sandbox): Promise<void> {
  await setupStore(sb, 'homestore', join(sb.home, 'openspec', 'homestore'))
  await setupStore(sb, 'specs', join(sb.home, 'openspec', 'specs'))
}

// --- Ledger group 1: the resolver picks the binary's root on every fixture ---

describe('root-resolution matrix (pinned binary as oracle)', () => {
  row({
    id: 'M1',
    title: 'subdirectory of a planning root',
    setup: (sb) => {
      const dir = planningRoot(sb)
      return at(dir, join(dir, 'src/deep'))
    },
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  row({
    id: 'M2',
    title: 'config-only openspec/ from the root',
    setup: (sb) => at(repo(sb, 'm2', configOnly('schema: spec-driven\n'))),
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  row({
    id: 'M2 (sub)',
    title: 'config-only openspec/ from a subdirectory',
    setup: (sb) => {
      const dir = repo(sb, 'm2', { ...configOnly('schema: spec-driven\n'), dirs: ['sub'] })
      return at(dir, join(dir, 'sub'))
    },
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  row({
    id: 'M3',
    title: 'planning root with a store pointer warns and stays local',
    setup: (sb) =>
      at(repo(sb, 'm3', { dirs: ['openspec/changes'], ...configOnly('store: alpha\n') })),
    expected: (_sb, fx) => nearest(repoOf(fx)),
    oracleExtra: (_sb, fx, o) => {
      const cfg = canonical(join(repoOf(fx), 'openspec/config.yaml'))
      expect(o.stderr).toBe(
        `Warning: ${cfg} declares store 'alpha', but this directory is a real OpenSpec root; ` +
          'the declaration is ignored.\n',
      )
    },
  })

  row({
    id: 'M4',
    title: 'config-only pointer',
    setup: (sb) => at(repo(sb, 'm4', configOnly('store: alpha\n'))),
    expected: (sb) => storeRoot(sb, 'alpha', 'declared'),
  })

  row({
    id: 'M5',
    title: 'config-only pointer found from a subdirectory',
    setup: (sb) => {
      const dir = repo(sb, 'm4', { ...configOnly('store: alpha\n'), dirs: ['deeper'] })
      return at(dir, join(dir, 'deeper'))
    },
    expected: (sb) => storeRoot(sb, 'alpha', 'declared'),
  })

  row({
    id: 'M6',
    title: 'unparseable pointer',
    setup: (sb) => at(repo(sb, 'm6', configOnly('store: [unclosed\n'))),
    expected: () => code('invalid_store_pointer'),
  })

  row({
    id: 'M7',
    title: 'non-string pointer',
    setup: (sb) => at(repo(sb, 'm7', configOnly('store:\n  - alpha\n  - beta\n'))),
    expected: () => code('invalid_store_pointer'),
  })

  row({
    id: 'M8',
    title: 'empty-string pointer on a config-only root',
    setup: (sb) => at(repo(sb, 'm8', configOnly('store: ""\n'))),
    expected: () => code('invalid_store_id'),
  })

  row({
    id: 'M8b',
    title: 'empty-string pointer on a planning root warns naming an empty id',
    setup: (sb) =>
      at(repo(sb, 'm8b', { dirs: ['openspec/changes'], ...configOnly('store: ""\n') })),
    expected: (_sb, fx) => nearest(repoOf(fx)),
    oracleExtra: (_sb, _fx, o) => {
      expect(o.stderr).toContain("declares store ''")
    },
  })

  row({
    id: 'M9',
    title: 'unknown pointer id',
    setup: (sb) => at(repo(sb, 'm9', configOnly('store: nope\n'))),
    expected: () => code('unknown_store'),
    // Design D4 keeps cospec's own unknown-store wording behind upstream's prefix.
    message: (actual, _o, _sb, fx) => {
      const cfg = canonical(join(repoOf(fx), 'openspec/config.yaml'))
      expect(actual.startsWith(`Declared in ${cfg}: `)).toBe(true)
      expect(actual).toContain('alpha, beta')
    },
    fix: (actual) => {
      expect(actual).toContain('cospec store register')
    },
  })

  row({
    id: 'M10',
    title: 'malformed pointer on a planning root is ignored without a warning',
    setup: (sb) =>
      at(repo(sb, 'm10', { dirs: ['openspec/specs'], ...configOnly('store: [unclosed\n') })),
    expected: (_sb, fx) => nearest(repoOf(fx)),
    oracleExtra: (_sb, _fx, o) => {
      expect(o.stderr).toBe('')
    },
  })

  row({
    id: 'M11',
    title: 'config.yml pointer',
    setup: (sb) => at(repo(sb, 'm11', configOnly('store: alpha\n', 'config.yml'))),
    expected: (sb) => storeRoot(sb, 'alpha', 'declared'),
  })

  row({
    id: 'M12',
    title: 'explicit --store from a bare directory',
    setup: (sb) => at(bare(sb), undefined, 'alpha'),
    expected: (sb) => storeRoot(sb, 'alpha', 'store'),
  })

  row({
    id: 'M12b',
    title: 'explicit --store from inside a planning root',
    setup: (sb) => {
      const dir = planningRoot(sb)
      return at(dir, join(dir, 'src/deep'), 'alpha')
    },
    expected: (sb) => storeRoot(sb, 'alpha', 'store'),
  })

  row({
    id: 'M13',
    title: 'defaultStore from a bare directory',
    setup: async (sb) => {
      await setDefaultStore(sb, 'beta')
      return at(bare(sb))
    },
    expected: (sb) => storeRoot(sb, 'beta', 'global_default'),
  })

  row({
    id: 'M13b',
    title: 'defaultStore never outranks an enclosing planning root',
    setup: async (sb) => {
      await setDefaultStore(sb, 'beta')
      const dir = planningRoot(sb)
      return at(dir, join(dir, 'src/deep'))
    },
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  row({
    id: 'M14',
    title: 'stale defaultStore',
    setup: async (sb) => {
      await setDefaultStore(sb, 'gone')
      return at(bare(sb))
    },
    expected: () => code('unknown_store'),
    // Design D4 keeps cospec's own unknown-store wording behind upstream's prefix.
    message: (actual) => {
      expect(actual.startsWith("Global defaultStore 'gone': ")).toBe(true)
      expect(actual).toContain('alpha, beta')
    },
  })

  row({
    id: 'M15',
    title: 'registered stores and no root',
    setup: (sb) => at(bare(sb)),
    expected: () => code('no_root_with_registered_stores'),
  })

  row({
    id: 'M16',
    title: '$HOME/openspec/<id> store layout, cwd $HOME',
    setup: async (sb) => {
      await homeStores(sb)
      return at(sb.home)
    },
    expected: () => code('no_root_with_registered_stores'),
  })

  row({
    id: 'M16 (proj)',
    title: '$HOME/openspec/<id> store layout, cwd $HOME/work/proj',
    setup: async (sb) => {
      await homeStores(sb)
      const cwd = join(sb.home, 'work', 'proj')
      mkdirSync(cwd, { recursive: true })
      return at(sb.home, cwd)
    },
    expected: () => code('no_root_with_registered_stores'),
  })

  row({
    id: 'M16b',
    title: 'real project under a $HOME store layout',
    setup: async (sb) => {
      await homeStores(sb)
      const real = join(sb.home, 'work', 'real')
      mkdirSync(join(real, 'openspec', 'changes'), { recursive: true })
      mkdirSync(join(real, 'a'), { recursive: true })
      return at(real, join(real, 'a'))
    },
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  row({
    id: 'M17',
    title: 'bare openspec/ skipped mid-walk',
    setup: (sb) => {
      const dir = repo(sb, 'm17', { dirs: ['openspec/changes', 'inner/openspec', 'inner/x'] })
      return at(dir, join(dir, 'inner/x'))
    },
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  row({
    id: 'M18',
    title: 'symlinked cwd',
    setup: (sb) => {
      const dir = planningRoot(sb)
      const link = join(sb.dir, 'link')
      symlinkSync(join(dir, 'src'), link)
      return at(dir, join(link, 'deep'))
    },
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  row({
    id: 'M19',
    title: 'implicit root with no stores registered',
    stores: [],
    setup: (sb) => at(bare(sb)),
    oracleCommand: 'status',
    expected: (_sb, fx) => ({ root: { path: canonical(repoOf(fx)), source: 'implicit' } }),
    oracleExtra: async (sb, fx) => {
      const list = await oracle(sb, fx.cwd, ['list', '--json'])
      expect(list.exitCode).toBe(1)
      expect(list.diagnostic?.code).toBe('no_openspec_root')
    },
  })

  row({
    id: 'M20',
    title: 'pre-config project (openspec/project.md only)',
    stores: [],
    setup: (sb) => at(repo(sb, 'm20', { files: { 'openspec/project.md': '# Project\n' } })),
    expected: (_sb, fx) => ({ root: { path: canonical(repoOf(fx)), source: 'implicit' } }),
  })

  row({
    id: 'M21',
    title: 'references: without store:',
    setup: (sb) => at(repo(sb, 'm21', configOnly('schema: spec-driven\nreferences:\n  - alpha\n'))),
    expected: (_sb, fx) => nearest(repoOf(fx)),
  })

  // --- Store health (design D9): a fresh, individually broken `gamma` per row ---

  row({
    id: 'M22',
    title: 'store metadata missing',
    stores: WITH_GAMMA,
    setup: (sb) => {
      removeGammaMetadata(sb)
      return at(bare(sb), undefined, 'gamma')
    },
    expected: () => code('store_identity_mismatch'),
  })

  row({
    id: 'M23',
    title: 'store metadata id differs from the registered id',
    stores: WITH_GAMMA,
    setup: (sb) => {
      writeFileSync(join(gammaRoot(sb), '.openspec-store', 'store.yaml'), 'version: 1\nid: zeta\n')
      return at(bare(sb), undefined, 'gamma')
    },
    expected: () => code('store_identity_mismatch'),
  })

  row({
    id: 'M24',
    title: 'store without openspec/config.yaml',
    stores: WITH_GAMMA,
    setup: (sb) => {
      rmSync(join(gammaRoot(sb), 'openspec', 'config.yaml'))
      return at(bare(sb), undefined, 'gamma')
    },
    expected: () => code('unhealthy_store_root'),
  })

  row({
    id: 'M24b',
    title: 'store without openspec/',
    stores: WITH_GAMMA,
    setup: (sb) => {
      rmSync(join(gammaRoot(sb), 'openspec'), { recursive: true })
      return at(bare(sb), undefined, 'gamma')
    },
    expected: () => code('unhealthy_store_root'),
  })

  row({
    id: 'M25',
    title: 'store openspec/specs is a file',
    stores: WITH_GAMMA,
    setup: (sb) => {
      const specs = join(gammaRoot(sb), 'openspec', 'specs')
      rmSync(specs, { recursive: true })
      writeFileSync(specs, '')
      return at(bare(sb), undefined, 'gamma')
    },
    expected: () => code('unhealthy_store_root'),
    oracleExtra: (_sb, _fx, o) => {
      expect(o.diagnostic?.message).toContain('openspec/specs/ exists but is not a directory.')
    },
  })

  row({
    id: 'M25b',
    title: 'store with no specs/ or changes/ is still healthy',
    stores: WITH_GAMMA,
    setup: (sb) => {
      rmSync(join(gammaRoot(sb), 'openspec', 'specs'), { recursive: true })
      rmSync(join(gammaRoot(sb), 'openspec', 'changes'), { recursive: true })
      return at(bare(sb), undefined, 'gamma')
    },
    expected: (sb) => storeRoot(sb, 'gamma', 'store'),
  })

  row({
    id: 'M26',
    title: 'store metadata unparseable',
    stores: WITH_GAMMA,
    setup: (sb) => {
      writeFileSync(join(gammaRoot(sb), '.openspec-store', 'store.yaml'), 'version: [\n')
      return at(bare(sb), undefined, 'gamma')
    },
    expected: () => code('invalid_store_metadata'),
    // The tail is the YAML parser's own text, which the design does not pin.
    message: (actual) => {
      expect(actual.startsWith('Invalid store metadata state: ')).toBe(true)
    },
  })

  row({
    id: 'M27',
    title: 'broken store selected through a config-only pointer',
    stores: WITH_GAMMA,
    setup: (sb) => {
      removeGammaMetadata(sb)
      return at(repo(sb, 'm27', configOnly('store: gamma\n')))
    },
    expected: () => code('store_identity_mismatch'),
    oracleExtra: (_sb, fx, o) => {
      const cfg = canonical(join(repoOf(fx), 'openspec/config.yaml'))
      expect(o.diagnostic?.message.startsWith(`Declared in ${cfg}: Store 'gamma' is missing`)).toBe(
        true,
      )
    },
  })

  row({
    id: 'M27 (default)',
    title: 'broken store selected through defaultStore',
    stores: WITH_GAMMA,
    setup: async (sb) => {
      removeGammaMetadata(sb)
      await setDefaultStore(sb, 'gamma')
      return at(bare(sb))
    },
    expected: () => code('store_identity_mismatch'),
    oracleExtra: (_sb, _fx, o) => {
      expect(
        o.diagnostic?.message.startsWith(
          "Global defaultStore 'gamma': Store 'gamma' is missing identity metadata",
        ),
      ).toBe(true)
    },
  })
})

// --- Ledger row 2.8: relayed `root` provenance in `show --json` ---

const DEMO_PROPOSAL = '# demo-change\n\n## Why\n\nDemo.\n\n## What Changes\n\n- Demo.\n'

/** A sandbox whose `alpha` and `beta` each hold a showable `demo-change`. */
async function showSandbox(): Promise<Sandbox> {
  const sb = await makeSandbox()
  const cwd = bare(sb)
  for (const id of ['alpha', 'beta']) {
    const res = await openspec(['new', 'change', 'demo-change', '--store', id], cwd, sb.env)
    if (res.exitCode !== 0)
      throw new Error(`openspec new change --store ${id} exited ${res.exitCode}: ${res.stderr}`)
    writeFiles(storePath(sb, id), { 'openspec/changes/demo-change/proposal.md': DEMO_PROPOSAL })
  }
  return sb
}

interface ShowRowSpec {
  title: string
  setup: (sb: Sandbox) => Promise<Fixture> | Fixture
  expected: (sb: Sandbox) => OracleRoot
}

function showRow(spec: ShowRowSpec): void {
  describe(`show --json ${spec.title}`, () => {
    let sb!: Sandbox
    let fx!: Fixture
    let o!: OracleRun
    const args = (): string[] => [
      'show',
      'demo-change',
      '--json',
      ...(fx.store === undefined ? [] : ['--store', fx.store]),
    ]

    beforeAll(async () => {
      sb = await showSandbox()
      fx = await spec.setup(sb)
      o = await oracle(sb, fx.cwd, args())
    })

    test('oracle: the pinned binary reports the ledger root', () => {
      expect(o.exitCode).toBe(0)
      expect(o.root).toEqual(spec.expected(sb))
    })

    const cospecTest = async (): Promise<void> => {
      const res = await cospec(args(), { cwd: fx.cwd, env: sb.env })
      expect(res.exitCode).toBe(0)
      const body = JSON.parse(res.stdout) as { root?: unknown }
      expect(body.root).toEqual(o.root)
    }
    const label = 'cospec: relayed .root equals the oracle'
    test(label, cospecTest)
  })
}

describe('relayed root provenance (ledger 2.8)', () => {
  showRow({
    title: 'over a config-only pointer (M4)',
    setup: (sb) => at(repo(sb, 'm4', configOnly('store: alpha\n'))),
    expected: (sb) => ({
      path: canonical(storePath(sb, 'alpha')),
      source: 'declared',
      store_id: 'alpha',
    }),
  })

  showRow({
    title: 'under defaultStore (M13)',
    setup: async (sb) => {
      await setDefaultStore(sb, 'beta')
      return at(bare(sb))
    },
    expected: (sb) => ({
      path: canonical(storePath(sb, 'beta')),
      source: 'global_default',
      store_id: 'beta',
    }),
  })

  showRow({
    title: 'with an explicit --store',
    setup: (sb) => at(bare(sb), undefined, 'alpha'),
    expected: (sb) => ({
      path: canonical(storePath(sb, 'alpha')),
      source: 'store',
      store_id: 'alpha',
    }),
  })
})

// --- Ledger group 3: `templates` and `schema` reach every store-backed root ---

/** How many times `line` appears as a whole line of `text`. */
function lineCount(text: string, line: string): number {
  return text.split('\n').filter((l) => l === line).length
}

/** A sandbox whose `alpha` and `beta` were set up by `cospec store setup` (typed schemas). */
async function typedStoreSandbox(): Promise<Sandbox> {
  const sb = await makeSandbox([])
  for (const id of ['alpha', 'beta']) {
    const res = await cospec(['store', 'setup', id, '--path', storePath(sb, id), '--no-init-git'], {
      cwd: sb.dir,
      env: sb.env,
    })
    if (res.exitCode !== 0)
      throw new Error(`cospec store setup ${id} exited ${res.exitCode}: ${res.stderr}`)
  }
  return sb
}

describe('templates and schema reach store-backed roots (ledger 3.1-3.3)', () => {
  interface Via {
    name: string
    store: 'alpha' | 'beta'
    fixture: (sb: Sandbox) => Promise<Fixture> | Fixture
  }
  const vias: Via[] = [
    {
      name: 'an explicit --store',
      store: 'alpha',
      fixture: (sb) => at(bare(sb), undefined, 'alpha'),
    },
    {
      name: 'a store: pointer (M4)',
      store: 'alpha',
      fixture: (sb) => at(repo(sb, 'm4', configOnly('store: alpha\n'))),
    },
    {
      name: 'defaultStore (M13)',
      store: 'beta',
      fixture: async (sb) => {
        await setDefaultStore(sb, 'beta')
        return at(bare(sb))
      },
    },
  ]

  for (const via of vias) {
    describe(`via ${via.name}`, () => {
      let sb!: Sandbox
      let fx!: Fixture
      const storeFlag = (): string[] => (fx.store === undefined ? [] : ['--store', fx.store])

      beforeAll(async () => {
        sb = await typedStoreSandbox()
        fx = await via.fixture(sb)
      })

      test('cospec templates --json --schema feat resolves the store templates', async () => {
        const res = await cospec(['templates', '--json', '--schema', 'feat', ...storeFlag()], {
          cwd: fx.cwd,
          env: sb.env,
        })
        expect(res.exitCode).toBe(0)
        const body = JSON.parse(res.stdout) as Record<string, { path: string }>
        const schemaDir = join(canonical(storePath(sb, via.store)), 'openspec', 'schemas', 'feat')
        expect(Object.keys(body).length).toBeGreaterThan(0)
        for (const entry of Object.values(body))
          expect(entry.path.startsWith(`${schemaDir}/templates/`)).toBe(true)
      })

      test('cospec schema which feat --json reports the store schema', async () => {
        const res = await cospec(['schema', 'which', 'feat', '--json', ...storeFlag()], {
          cwd: fx.cwd,
          env: sb.env,
        })
        expect(res.exitCode).toBe(0)
        const body = JSON.parse(res.stdout) as { name: string; path: string }
        expect(body.name).toBe('feat')
        expect(body.path).toBe(
          join(canonical(storePath(sb, via.store)), 'openspec', 'schemas', 'feat'),
        )
      })
    })
  }
})

describe('schema writes and guards follow the resolved root (ledger 3.4-3.6)', () => {
  let sb!: Sandbox
  let cwd!: string

  beforeAll(async () => {
    sb = await typedStoreSandbox()
    cwd = bare(sb)
  })

  test('schema validate and fork with --store alpha write into the store only', async () => {
    const validate = await cospec(['schema', 'validate', 'feat', '--store', 'alpha'], {
      cwd,
      env: sb.env,
    })
    expect(validate.exitCode).toBe(0)
    const fork = await cospec(['schema', 'fork', 'feat', 'alpha-feat', '--store', 'alpha'], {
      cwd,
      env: sb.env,
    })
    expect(fork.exitCode).toBe(0)
    expect(
      existsSync(join(storePath(sb, 'alpha'), 'openspec', 'schemas', 'alpha-feat', 'schema.yaml')),
    ).toBe(true)
    expect(readdirSync(cwd)).toEqual([])
  })

  test('schema init of a reserved canon name is refused before any spawn', async () => {
    const before = hashTree(storePath(sb, 'alpha'))
    const res = await cospec(['schema', 'init', 'feat', '--store', 'alpha'], { cwd, env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain("refusing to init schema 'feat'")
    expect(hashTree(storePath(sb, 'alpha'))).toEqual(before)
  })

  test('templates from a subdirectory resolve the enclosing root', async () => {
    const root = storePath(sb, 'beta')
    const sub = join(root, 'src')
    mkdirSync(sub, { recursive: true })
    const res = await cospec(['templates', '--json', '--schema', 'feat'], { cwd: sub, env: sb.env })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as Record<string, { path: string }>
    const schemaDir = join(canonical(root), 'openspec', 'schemas', 'feat')
    for (const entry of Object.values(body))
      expect(entry.path.startsWith(`${schemaDir}/templates/`)).toBe(true)
  })
})

// --- Ledger 2.5 / 2.9: lines resolveRoot prints appear once on relayed commands ---

describe('resolver lines appear once on relaying commands (ledger 2.5, 2.9)', () => {
  let sb!: Sandbox
  let m3!: string
  let m4!: string
  let cwd!: string

  beforeAll(async () => {
    sb = await showSandbox()
    m3 = repo(sb, 'm3', { dirs: ['openspec/changes'], ...configOnly('store: alpha\n') })
    m4 = repo(sb, 'm4', configOnly('store: alpha\n'))
    cwd = bare(sb)
  })

  const warning = (): string =>
    `Warning: ${join(canonical(m3), 'openspec', 'config.yaml')} declares store 'alpha', but ` +
    'this directory is a real OpenSpec root; the declaration is ignored.'
  const banner = (): string => `Using OpenSpec root: alpha (${canonical(storePath(sb, 'alpha'))})`

  test('the ignored-pointer warning prints once for schemas --json and view (M3)', async () => {
    const schemas = await cospec(['schemas', '--json'], { cwd: m3, env: sb.env })
    expect(schemas.exitCode).toBe(0)
    expect(() => JSON.parse(schemas.stdout) as unknown).not.toThrow()
    expect(lineCount(schemas.stderr, warning())).toBe(1)
    const view = await cospec(['view'], { cwd: m3, env: sb.env })
    expect(view.exitCode).toBe(0)
    expect(lineCount(view.stderr, warning())).toBe(1)
  })

  test('the store banner prints once for relayed human-mode commands', async () => {
    const runs = [
      await cospec(['schemas', '--store', 'alpha'], { cwd, env: sb.env }),
      await cospec(['show', 'demo-change', '--store', 'alpha'], { cwd, env: sb.env }),
      await cospec(['list', '--specs'], { cwd: m4, env: sb.env }),
    ]
    for (const res of runs) {
      expect(res.exitCode).toBe(0)
      expect(lineCount(res.stderr, banner())).toBe(1)
    }
  })
})
