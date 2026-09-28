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
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { openspecPackageDir, STORE_ERROR_CODES } from '../../src/core/openspec.ts'
import {
  type ResolvedRoot,
  resolveRoot,
  RootSelectionError,
  type RootDiagnostic,
} from '../../src/core/root.ts'
import { cleanupAll, cospec, hashTree, writeFiles } from '../fixtures/support.ts'
import {
  captureStderr,
  makeSandbox,
  type OracleDiagnostic,
  type OracleRoot,
  type OracleRun,
  rootOracle,
  type Sandbox,
  setDefaultStore,
  setupStore,
  storePath,
  withSandboxEnv,
} from './support/root-sandbox.ts'
import { oracle } from './support/upstream-oracle.ts'

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
      o = await rootOracle(sb, fx.cwd, [spec.oracleCommand ?? 'list', '--json', ...storeArgs])
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

/** Overwrite the sandbox's store registry with YAML the binary cannot parse. */
function breakRegistry(sb: Sandbox): void {
  writeFileSync(
    join(sb.env['XDG_DATA_HOME']!, 'openspec', 'stores', 'registry.yaml'),
    'version: [\n',
  )
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
      const list = await rootOracle(sb, fx.cwd, ['list', '--json'])
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
    const res = await oracle(['new', 'change', 'demo-change', '--store', id], sb.dir, { cwd })
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
      o = await rootOracle(sb, fx.cwd, args())
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

  // Ledger 5.14: with an explicit `--store` the wrapped call gets `--store` too
  // and prints the binary's own banner; the relay drops that copy (design D7),
  // on success and on a failed call alike.
  test('an explicit --store banner prints once on relayed calls, failing ones too', async () => {
    const ok = [
      ['context', '--store', 'alpha'],
      ['list', '--specs', '--store', 'alpha'],
      ['show', 'demo-change', '--store', 'alpha'],
    ]
    const results = await Promise.all(ok.map((argv) => cospec(argv, { cwd, env: sb.env })))
    for (const [n, res] of results.entries()) {
      const argv = ok[n]!
      expect(res.exitCode, argv.join(' ')).toBe(0)
      expect(lineCount(res.stderr, banner()), argv.join(' ')).toBe(1)
    }
    const failed = await cospec(['show', 'nosuch', '--store', 'alpha'], { cwd, env: sb.env })
    expect(failed.exitCode).toBe(1)
    expect(lineCount(failed.stderr, banner())).toBe(1)
    // The binary itself prints the banner on each of these calls, so the one
    // line cospec shows is its own with the relayed copy removed.
    const up = await oracle(['show', 'nosuch', '--store', 'alpha'], sb.dir, { cwd })
    expect(lineCount(up.stderr, banner())).toBe(1)
  })
})

// --- Ledger 2.1-2.4, 2.7: native commands operate on the resolved root ---

const BANNER_PREFIX = 'Using OpenSpec root: '

describe('native commands operate on the resolved root (ledger 2.1-2.4, 2.7)', () => {
  test('cospec list --json from a subdirectory lists the enclosing root (M1, ledger 2.1)', async () => {
    const sb = await makeSandbox()
    const dir = planningRoot(sb)
    writeFiles(dir, { 'openspec/changes/demo-change/proposal.md': DEMO_PROPOSAL })
    const res = await cospec(['list', '--json'], { cwd: join(dir, 'src/deep'), env: sb.env })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as { changes: { change: string }[] }
    expect(body.changes.map((c) => c.change)).toEqual(['demo-change'])
  })

  test('cospec new on a planning root with a store pointer writes locally (M3, ledger 2.2)', async () => {
    const sb = await makeSandbox()
    // M3's shape on a cospec-initialized root, so the typed `ci` schema resolves locally.
    const dir = repo(sb, 'm3', { dirs: ['openspec/changes'] })
    const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], {
      cwd: dir,
      env: sb.env,
    })
    expect(init.exitCode).toBe(0)
    appendFileSync(join(dir, 'openspec', 'config.yaml'), 'store: alpha\n')
    const alphaChanges = join(storePath(sb, 'alpha'), 'openspec', 'changes')
    const alphaBefore = hashTree(alphaChanges)
    const res = await cospec(['new', 'ci', 'local-change'], { cwd: dir, env: sb.env })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(dir, 'openspec', 'changes', 'local-change'))).toBe(true)
    expect(existsSync(join(alphaChanges, 'local-change'))).toBe(false)
    expect(hashTree(alphaChanges)).toEqual(alphaBefore)
    const warning =
      `Warning: ${join(canonical(dir), 'openspec', 'config.yaml')} declares store 'alpha', but ` +
      'this directory is a real OpenSpec root; the declaration is ignored.'
    expect(lineCount(res.stderr, warning)).toBe(1)
  })

  test('no_root_with_registered_stores in human mode (M15, ledger 2.3)', async () => {
    const sb = await makeSandbox()
    const res = await cospec(['list'], { cwd: bare(sb), env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toBe(
      'cospec: No OpenSpec root found in the current directory or its ancestors. Registered ' +
        'stores: alpha, beta. Pass --store <id> to use one, or run cospec init to create a ' +
        'local root.\n' +
        'Fix: Rerun with --store <id> (registered: alpha, beta) or run cospec init.\n',
    )
    expect(res.stderr).not.toContain('openspec init')
    expect(res.stdout).toBe('')
  })

  test('invalid_store_pointer in cospec status, human mode (M6, ledger 2.4)', async () => {
    const sb = await makeSandbox()
    const dir = repo(sb, 'm6', configOnly('store: [unclosed\n'))
    const cfg = join(canonical(dir), 'openspec', 'config.yaml')
    const res = await cospec(['status'], { cwd: dir, env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toBe(
      `cospec: Invalid store declaration in ${cfg}: the config file could not be read as YAML.\n` +
        `Fix: Fix the YAML syntax in ${cfg}.\n`,
    )
    expect(res.stdout).toBe('')
  })

  describe('the store banner on a native command (ledger 2.7)', () => {
    let sb!: Sandbox
    let cwd!: string
    const banner = (id: string): string => `${BANNER_PREFIX}${id} (${canonical(storePath(sb, id))})`
    const bannerLines = (stderr: string): string[] =>
      stderr.split('\n').filter((l) => l.startsWith(BANNER_PREFIX))

    beforeAll(async () => {
      sb = await makeSandbox()
      cwd = bare(sb)
    })

    test('cospec list --store alpha prints the oracle banner exactly once', async () => {
      const o = await oracle(['list', '--store', 'alpha'], sb.dir, { cwd })
      expect(o.exitCode).toBe(0)
      expect(bannerLines(o.stderr)).toEqual([banner('alpha')])
      const res = await cospec(['list', '--store', 'alpha'], { cwd, env: sb.env })
      expect(res.exitCode).toBe(0)
      expect(bannerLines(res.stderr)).toEqual([banner('alpha')])
      expect(bannerLines(res.stderr)).toEqual(bannerLines(o.stderr))
    })

    test('a declared pointer (M4) prints the banner with its store', async () => {
      const m4 = repo(sb, 'm4', configOnly('store: alpha\n'))
      const res = await cospec(['list'], { cwd: m4, env: sb.env })
      expect(res.exitCode).toBe(0)
      expect(bannerLines(res.stderr)).toEqual([banner('alpha')])
    })

    test('a planning root (M1) prints no banner', async () => {
      const dir = planningRoot(sb)
      const res = await cospec(['list'], { cwd: join(dir, 'src/deep'), env: sb.env })
      expect(res.exitCode).toBe(0)
      expect(bannerLines(res.stderr)).toEqual([])
    })

    test('cospec list --json --store alpha prints no banner', async () => {
      const res = await cospec(['list', '--json', '--store', 'alpha'], { cwd, env: sb.env })
      expect(res.exitCode).toBe(0)
      expect(() => JSON.parse(res.stdout) as unknown).not.toThrow()
      expect(bannerLines(res.stderr)).toEqual([])
    })

    test('defaultStore (M13) prints the banner with its store', async () => {
      const m13 = await makeSandbox()
      await setDefaultStore(m13, 'beta')
      const res = await cospec(['list'], { cwd: bare(m13), env: m13.env })
      expect(res.exitCode).toBe(0)
      expect(bannerLines(res.stderr)).toEqual([
        `${BANNER_PREFIX}beta (${canonical(storePath(m13, 'beta'))})`,
      ])
    })
  })
})

// --- Ledger 1.29: a missing --cwd is cospec's own clean error ---

describe('a nonexistent --cwd fails cleanly (ledger 1.29)', () => {
  let sb!: Sandbox
  let parent!: string

  beforeAll(async () => {
    sb = await makeSandbox()
    parent = bare(sb)
  })

  // A native command, a relayed passthrough, a spawn-in-root passthrough, and
  // an explicit --store, each of which used to reach a spawn in the bad cwd.
  const argvs: string[][] = [
    ['list'],
    ['status', '--json'],
    ['show', 'x'],
    ['templates', '--json'],
    ['list', '--store', 'alpha'],
  ]

  for (const argv of argvs) {
    test(`cospec ${argv.join(' ')} --cwd <missing>`, async () => {
      const missing = join(parent, 'nope')
      const res = await cospec([...argv, '--cwd', missing], { cwd: parent, env: sb.env })
      expect(res.exitCode).toBe(1)
      if (argv.includes('--json')) {
        // Under --json the same diagnostic is the one status document (ledger 5.4).
        expect(res.stdout).toBe(
          `${JSON.stringify(
            {
              status: [
                {
                  severity: 'error',
                  code: 'directory_not_found',
                  message: `directory not found: ${missing}`,
                  target: 'cwd',
                },
              ],
            },
            null,
            2,
          )}\n`,
        )
        expect(res.stderr).toBe('')
        return
      }
      expect(res.stdout).toBe('')
      expect(res.stderr).toBe(`cospec: directory not found: ${missing}\n`)
      const rest = res.stderr.replace(missing, '<missing>')
      expect(rest).not.toMatch(/bun|posix_spawn|ENOENT/i)
    })
  }

  test('a relative --cwd is reported resolved against the invocation directory', async () => {
    const res = await cospec(['--cwd', 'gone/deeper', 'list'], { cwd: parent, env: sb.env })
    expect(res.exitCode).toBe(1)
    // The child's own cwd is canonical (a spawn realpaths it), so the report is too.
    expect(res.stderr).toBe(
      `cospec: directory not found: ${join(canonical(parent), 'gone', 'deeper')}\n`,
    )
  })
})

// --- Ledger 5.4: a resolver hard-error under --json is one status document ---

describe('a resolver hard-error under --json is one status document (ledger 5.4)', () => {
  const cases: {
    id: string
    stores?: readonly string[]
    argv: string[]
    setup: (sb: Sandbox) => string
    code: string
  }[] = [
    { id: 'M15', argv: ['list', '--json'], setup: bare, code: 'no_root_with_registered_stores' },
    {
      id: 'M6',
      argv: ['status', '--json'],
      setup: (sb) => repo(sb, 'm6', configOnly('store: [unclosed\n')),
      code: 'invalid_store_pointer',
    },
    {
      id: 'M22',
      stores: WITH_GAMMA,
      argv: ['list', '--json', '--store', 'gamma'],
      setup: (sb) => {
        removeGammaMetadata(sb)
        return bare(sb)
      },
      code: 'store_identity_mismatch',
    },
  ]

  for (const c of cases) {
    test(`${c.id}: cospec ${c.argv.join(' ')} prints the oracle's diagnostic as one document`, async () => {
      const sb = await makeSandbox(c.stores)
      const cwd = c.setup(sb)
      const o = await rootOracle(sb, cwd, c.argv)
      expect(o.exitCode).toBe(1)
      expect(o.diagnostic?.code).toBe(c.code)
      const res = await cospec(c.argv, { cwd, env: sb.env })
      expect(res.exitCode).toBe(1)
      expect(res.stderr).not.toMatch(/^cospec:/m)
      const doc = JSON.parse(res.stdout) as { status: RootDiagnostic[] }
      expect(Object.keys(doc)).toEqual(['status'])
      expect(doc.status).toHaveLength(1)
      const d = doc.status[0]!
      expect(Object.keys(d)).toEqual(['severity', 'code', 'message', 'target', 'fix'])
      expect(d).toEqual({
        severity: 'error',
        code: o.diagnostic!.code,
        message: respell(o.diagnostic!.message),
        target: o.diagnostic!.target!,
        fix: respell(o.diagnostic!.fix ?? ''),
      })
      expect(res.stdout).toBe(`${JSON.stringify(doc, null, 2)}\n`)
      expect(res.stdout).not.toMatch(BARE_OPENSPEC_COMMAND)
    })
  }

  test('human mode is unchanged: the same failure is prose on stderr', async () => {
    const sb = await makeSandbox()
    const res = await cospec(['list'], { cwd: bare(sb), env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toMatch(/^cospec: No OpenSpec root found in the current directory/)
    expect(res.stderr).toContain('\nFix: ')
  })
})

// --- Ledger 5.5: an empty --store= is the resolver's invalid_store_id ---

describe('an empty --store= fails with invalid_store_id (ledger 5.5)', () => {
  test('--json: status[0] deep-equals the oracle', async () => {
    const sb = await makeSandbox()
    const cwd = bare(sb)
    const o = await rootOracle(sb, cwd, ['list', '--json', '--store='])
    expect(o.exitCode).toBe(1)
    expect(o.diagnostic).toEqual({
      severity: 'error',
      code: 'invalid_store_id',
      message: 'Store id must not be empty',
      target: 'store.id',
      fix: 'Use kebab-case with lowercase letters, numbers, and single hyphen separators.',
    })
    const res = await cospec(['list', '--json', '--store='], { cwd, env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toBe('')
    const doc = JSON.parse(res.stdout) as { status: OracleDiagnostic[] }
    expect(doc).toEqual({ status: [o.diagnostic!] })
  })

  test('human mode: the oracle text after cospec:', async () => {
    const sb = await makeSandbox()
    const cwd = bare(sb)
    const up = await oracle(['list', '--store='], sb.dir, { cwd })
    expect(up.exitCode).toBe(1)
    const res = await cospec(['list', '--store='], { cwd, env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe(
      'cospec: Store id must not be empty\n' +
        'Fix: Use kebab-case with lowercase letters, numbers, and single hyphen separators.\n',
    )
    expect(res.stderr).toBe(up.stderr.replace(/^(?:✖ )?Error: /, 'cospec: '))
  })
})

// --- Ledger 5.7: on a forward row the binary's parse refusal comes first ---

describe("a forward row's parse refusal outranks a root-selection failure (ledger 5.7)", () => {
  // Upstream parses the argv before its action selects a root. cospec asks
  // the binary about a forward row's argv in a scratch directory once its own
  // selection has failed, and relays a refusal verbatim.
  const refused: string[][] = [
    ['schemas', '--bogus', '--store', 'nosuch'],
    ['schemas', '--json', '--bogus', '--store', 'nosuch'],
    ['show', 'x', '--type', '--store', 'nosuch'],
    ['schema', 'which', 'feat', '--bogus', '--store', 'nosuch'],
    ['schema', 'init', 's9', '--bogus', '--store', 'nosuch'],
    ['templates', '--bogus', '--store', 'nosuch'],
  ]
  for (const argv of refused) {
    test(`cospec ${argv.join(' ')} relays the binary's refusal`, async () => {
      const sb = await makeSandbox()
      const cwd = bare(sb)
      const before = hashTree(cwd)
      const up = await oracle(argv, sb.dir, { cwd })
      expect(up.exitCode).toBe(1)
      expect(up.stdout).toBe('')
      expect(up.stderr).toMatch(/^error: (?:unknown option|too many arguments)/)
      const res = await cospec(argv, { cwd, env: sb.env })
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toBe('')
      expect(res.stderr).toBe(up.stderr)
      expect(hashTree(cwd)).toEqual(before)
    })
  }

  test("the binary's --store-path redirect comes first too, spelled through cospec", async () => {
    const sb = await makeSandbox()
    const cwd = bare(sb)
    const argv = ['show', 'x', '--store-path', '/y', '--store', 'nosuch']
    const up = await oracle(argv, sb.dir, { cwd })
    expect(up.stderr).toContain('--store-path is not supported')
    const res = await cospec(argv, { cwd, env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toBe(respell(up.stderr))
    expect(res.stderr).not.toMatch(BARE_OPENSPEC_COMMAND)
  })

  test('an argv the binary accepts still gets the selection failure, and writes nothing', async () => {
    const sb = await makeSandbox()
    const cwd = bare(sb)
    const before = hashTree(cwd)
    for (const argv of [
      ['schema', 'init', 's9', '--store', 'nosuch'],
      ['show', '--store', 'nosuch', '--bogus'],
      ['templates', '--json', '--store', 'nosuch'],
    ]) {
      const res = await cospec(argv, { cwd, env: sb.env })
      expect(res.exitCode).toBe(1)
      if (argv.includes('--json')) {
        const doc = JSON.parse(res.stdout) as { status: RootDiagnostic[] }
        expect(doc.status[0]?.code).toBe('unknown_store')
      } else expect(res.stderr).toMatch(/^cospec: unknown store 'nosuch'/)
    }
    expect(hashTree(cwd)).toEqual(before)
  })

  test('a table row refuses the argv itself, ahead of the selection', async () => {
    const sb = await makeSandbox()
    const res = await cospec(['list', '--bogus', '--store', 'nosuch'], {
      cwd: bare(sb),
      env: sb.env,
    })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toBe("cospec list: unknown option '--bogus'\n")
  })
})

// --- Ledger 5.6: templates --json -- x relays the binary's refusal ---

describe("templates --json -- x relays the binary's refusal (ledger 5.6)", () => {
  test('exit 1, empty stdout, the binary stderr verbatim', async () => {
    const sb = await makeSandbox([])
    const cwd = planningRoot(sb)
    const argv = ['templates', '--json', '--', 'x']
    const up = await oracle(argv, sb.dir, { cwd })
    expect(up.exitCode).toBe(1)
    expect(up.stdout).toBe('')
    expect(up.stderr).toBe(
      "error: too many arguments for 'templates'. Expected 0 arguments but got 1.\n",
    )
    const res = await cospec(argv, { cwd, env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe(up.stderr)
    expect(res.stderr).not.toContain('did not emit a single parseable JSON document')
    expect(res.stderr).not.toMatch(BARE_OPENSPEC_COMMAND)
  })
})

// --- Ledger 5.12: templates --json relays the binary's text failure ---

describe("templates --json relays the binary's text failure (ledger 5.12)", () => {
  // Upstream's `templates` action calls `failWithError(error)` with no JSON
  // option, so a failure after the parse is `✖ Error: …` on stderr and nothing
  // on stdout even under `--json`. cospec relays that answer; it is not a
  // wrapped-call violation.
  for (const argv of [
    ['templates', '--schema', 'nope', '--json'],
    ['templates', '--json', '--schema', 'nope'],
  ]) {
    test(argv.join(' '), async () => {
      const sb = await makeSandbox([])
      const cwd = planningRoot(sb)
      const up = await oracle(argv, sb.dir, { cwd })
      expect(up.exitCode).toBe(1)
      expect(up.stdout).toBe('')
      expect(up.stderr).toBe(
        "✖ Error: Schema 'nope' not found. Available schemas:\n  spec-driven\n",
      )
      const res = await cospec(argv, { cwd, env: sb.env })
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toBe('')
      expect(res.stderr).toBe(up.stderr)
      expect(res.stderr).not.toContain('did not emit a single parseable JSON document')
      expect(res.stderr).not.toMatch(BARE_OPENSPEC_COMMAND)
    })
  }

  test('a successful templates --json is still one JSON document', async () => {
    const sb = await makeSandbox([])
    const cwd = planningRoot(sb)
    const res = await cospec(['templates', '--json'], { cwd, env: sb.env })
    expect(res.exitCode).toBe(0)
    expect(Object.keys(JSON.parse(res.stdout) as object)).toContain('proposal')
  })
})

// --- Ledger 5.15: templates and schema run in the cwd when selection fails without --store ---

/** The directory as it was before a run: every file's bytes, for `restoreTree`. */
function snapshotTree(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  for (const rel of Object.keys(hashTree(dir))) out.set(rel, readFileSync(join(dir, rel)))
  return out
}

/** Put `dir` back to `snapshot`: remove everything, then rewrite each file. */
function restoreTree(dir: string, snapshot: Map<string, Buffer>): void {
  for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true, force: true })
  for (const [rel, bytes] of snapshot) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), bytes)
  }
}

/** The `templates`/`schema` argvs a failed selection must not stop, `--json` and human. */
const CWD_FALLBACK_ARGVS: readonly (readonly string[])[] = [
  ['templates', '--json'],
  ['templates'],
  ['schema', 'which', 'spec-driven', '--json'],
  ['schema', 'which', 'spec-driven'],
  ['schema', 'validate', '--json'],
  ['schema', 'fork', 'spec-driven', 'f1', '--json'],
  ['schema', 'init', 's1', '--description', 'd', '--json'],
]

interface SelectionFailureCase {
  id: string
  /** The code `list --json` fails with in the same directory. */
  code: string
  stores?: readonly string[]
  setup: (sb: Sandbox) => Promise<string> | string
}

/** Every resolver hard error a rootless or pointer/defaultStore directory can raise. */
const NO_FLAG_FAILURES: readonly SelectionFailureCase[] = [
  { id: 'M15', code: 'no_root_with_registered_stores', setup: bare },
  {
    id: 'M6',
    code: 'invalid_store_pointer',
    setup: (sb) => repo(sb, 'm6', configOnly('store: [unclosed\n')),
  },
  {
    id: 'M8',
    code: 'invalid_store_id',
    setup: (sb) => repo(sb, 'm8', configOnly('store: ""\n')),
  },
  {
    id: 'M9',
    code: 'unknown_store',
    setup: (sb) => repo(sb, 'm9', configOnly('store: nope\n')),
  },
  {
    id: 'M27',
    code: 'store_identity_mismatch',
    stores: WITH_GAMMA,
    setup: (sb) => {
      removeGammaMetadata(sb)
      return repo(sb, 'm27', configOnly('store: gamma\n'))
    },
  },
  {
    id: 'M14',
    code: 'unknown_store',
    setup: async (sb) => {
      await setDefaultStore(sb, 'gone')
      return bare(sb)
    },
  },
  {
    id: 'M27 (default)',
    code: 'store_identity_mismatch',
    stores: WITH_GAMMA,
    setup: async (sb) => {
      removeGammaMetadata(sb)
      await setDefaultStore(sb, 'gamma')
      return bare(sb)
    },
  },
  {
    id: 'defaultStore, no stores',
    code: 'no_registered_stores',
    stores: [],
    setup: async (sb) => {
      await setDefaultStore(sb, 'gone')
      return bare(sb)
    },
  },
  {
    id: 'M29 (ledger 5.17)',
    code: 'invalid_store_registry',
    setup: (sb) => {
      breakRegistry(sb)
      return bare(sb)
    },
  },
]

describe('templates and schema run in the cwd when selection fails without --store (ledger 5.15)', () => {
  // Upstream's `templates` and `schema` actions never select a root: they read
  // the directory they run in. So a selection that fails with no `--store`
  // must not fail them — cospec spawns them where the user ran the command,
  // and answers exactly as the binary does there.
  for (const c of NO_FLAG_FAILURES) {
    describe(`${c.id} (${c.code})`, () => {
      let sb!: Sandbox
      let cwd!: string
      let pristine!: Map<string, Buffer>

      beforeAll(async () => {
        sb = await makeSandbox(c.stores)
        cwd = await c.setup(sb)
        pristine = snapshotTree(cwd)
      })

      test('oracle: list --json fails selection there', async () => {
        const o = await rootOracle(sb, cwd, ['list', '--json'])
        expect(o.exitCode).toBe(1)
        expect(o.diagnostic?.code).toBe(c.code)
      })

      for (const argv of CWD_FALLBACK_ARGVS) {
        test(`cospec ${argv.join(' ')} answers as the binary does in the cwd`, async () => {
          restoreTree(cwd, pristine)
          const up = await oracle([...argv], sb.dir, { cwd })
          const upTree = hashTree(cwd)
          restoreTree(cwd, pristine)
          const res = await cospec([...argv], { cwd, env: sb.env })
          const tree = hashTree(cwd)
          restoreTree(cwd, pristine)
          expect(up.exitCode).toBe(0)
          expect(res.exitCode).toBe(up.exitCode)
          expect(res.stdout).toBe(up.stdout)
          expect(res.stderr).toBe(up.stderr)
          expect(tree).toEqual(upTree)
        })
      }
    })
  }
})

/** Every resolver hard error an explicit `--store` can raise, with the flag's argv. */
const FLAG_FAILURES: readonly (SelectionFailureCase & { store: string[] })[] = [
  { id: '--store nope', code: 'unknown_store', store: ['--store', 'nope'], setup: bare },
  {
    id: '--store nope, no stores',
    code: 'no_registered_stores',
    stores: [],
    store: ['--store', 'nope'],
    setup: bare,
  },
  {
    id: 'M22 --store gamma',
    code: 'store_identity_mismatch',
    stores: WITH_GAMMA,
    store: ['--store', 'gamma'],
    setup: (sb) => {
      removeGammaMetadata(sb)
      return bare(sb)
    },
  },
  { id: '--store=', code: 'invalid_store_id', store: ['--store='], setup: bare },
  {
    id: 'M29b --store alpha (ledger 5.17)',
    code: 'invalid_store_registry',
    store: ['--store', 'alpha'],
    setup: (sb) => {
      breakRegistry(sb)
      return bare(sb)
    },
  },
]

describe('templates and schema keep the selection failure of an explicit --store (ledger 5.15)', () => {
  for (const c of FLAG_FAILURES) {
    describe(c.id, () => {
      let sb!: Sandbox
      let cwd!: string

      beforeAll(async () => {
        sb = await makeSandbox(c.stores)
        cwd = await c.setup(sb)
      })

      test('oracle: list --json fails with the code; templates refuses --store itself', async () => {
        const o = await rootOracle(sb, cwd, ['list', '--json', ...c.store])
        expect(o.diagnostic?.code).toBe(c.code)
        const up = await oracle(['templates', ...c.store], sb.dir, { cwd })
        expect(up.exitCode).toBe(1)
        expect(up.stderr).toStartWith("error: unknown option '--store")
      })

      for (const argv of [
        ['templates', '--json'],
        ['schema', 'which', 'spec-driven', '--json'],
        ['schema', 'init', 's1', '--description', 'd', '--json'],
      ]) {
        test(`cospec ${argv.join(' ')} ${c.store.join(' ')} fails with ${c.code}, writing nothing`, async () => {
          const before = hashTree(cwd)
          const res = await cospec([...argv, ...c.store], { cwd, env: sb.env })
          expect(res.exitCode).toBe(1)
          const doc = JSON.parse(res.stdout) as { status: RootDiagnostic[] }
          expect(doc.status[0]?.code).toBe(c.code)
          expect(hashTree(cwd)).toEqual(before)
        })
      }

      test(`cospec templates ${c.store.join(' ')} fails with the prose diagnostic`, async () => {
        const res = await cospec(['templates', ...c.store], { cwd, env: sb.env })
        expect(res.exitCode).toBe(1)
        expect(res.stdout).toBe('')
        expect(res.stderr).toStartWith('cospec: ')
        expect(res.stderr).toContain('\nFix: ')
      })
    })
  }
})

// --- Ledger 5.16: defaultStore is read as the raw JSON value upstream reads ---

/** Write the sandbox's global config file, at the path the binary reports, byte-for-byte. */
async function writeGlobalConfig(sb: Sandbox, body: string): Promise<void> {
  const run = await oracle(['config', 'path'], sb.dir)
  if (run.exitCode !== 0) throw new Error(`openspec config path exited ${run.exitCode}`)
  const path = run.stdout.replace(/\n$/, '')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

// Design D4 keeps cospec's own unknown-store wording behind upstream's prefix.
const unknownStore =
  (shown: string): RowSpec['message'] =>
  (actual) => {
    expect(actual.startsWith(`Global defaultStore '${shown}': unknown store '${shown}'`)).toBe(true)
    expect(actual).toContain('Registered stores: alpha, beta')
  }

describe('defaultStore reaches selection as the raw value upstream reads (ledger 5.16)', () => {
  // Upstream reads `getGlobalConfig().defaultStore` as parsed JSON, tests it
  // for truthiness, and hands it to `validateStoreId` and the registry lookup
  // unchanged: no trimming, no stringifying. Each row writes one raw value.
  const defaultRow = (
    id: string,
    raw: string,
    expected: Expected,
    message?: RowSpec['message'],
  ): void =>
    row({
      id,
      title: `defaultStore ${raw}`,
      setup: async (sb) => {
        await writeGlobalConfig(sb, `{"defaultStore": ${raw}}\n`)
        return at(bare(sb))
      },
      expected: () => expected,
      ...(message === undefined ? {} : { message }),
    })

  defaultRow('M28', '" beta "', code('invalid_store_id'))
  defaultRow('M28b', '"beta\\n"', code('invalid_store_id'))
  defaultRow('M28c', '["beta"]', code('unknown_store'), unknownStore('beta'))
  defaultRow('M28d', '5', code('unknown_store'), unknownStore('5'))
  defaultRow('M28e', '[]', code('invalid_store_id'))
  defaultRow('M28f', '{}', code('invalid_store_id'))
  defaultRow('M28g', 'false', code('no_root_with_registered_stores'))
  defaultRow('M28h', '""', code('no_root_with_registered_stores'))

  row({
    id: 'M28i',
    title: 'a global config whose root is not an object carries no defaultStore',
    setup: async (sb) => {
      await writeGlobalConfig(sb, '"beta"\n')
      return at(bare(sb))
    },
    expected: () => code('no_root_with_registered_stores'),
  })

  test("cospec list --json and text print the binary's ' beta ' diagnostic", async () => {
    const sb = await makeSandbox()
    const cwd = bare(sb)
    await writeGlobalConfig(sb, '{"defaultStore": " beta "}\n')
    const o = await rootOracle(sb, cwd, ['list', '--json'])
    const res = await cospec(['list', '--json'], { cwd, env: sb.env })
    expect(res.exitCode).toBe(1)
    expect(JSON.parse(res.stdout)).toEqual({ status: [o.diagnostic] })
    const up = await oracle(['list'], sb.dir, { cwd })
    const text = await cospec(['list'], { cwd, env: sb.env })
    expect(text.exitCode).toBe(1)
    expect(text.stderr).toBe(up.stderr.replace(/^(?:✖ )?Error: /, 'cospec: '))
  })
})

// --- Ledger 5.17: an unreadable store registry fails selection with its diagnostic ---

interface RegistryRoute {
  id: string
  title: string
  setup: (sb: Sandbox) => Promise<Fixture> | Fixture
}

/** The four ways selection reads the registry: rootless, `--store`, a pointer, `defaultStore`. */
const REGISTRY_ROUTES: readonly RegistryRoute[] = [
  { id: 'M29', title: 'rootless', setup: (sb) => at(bare(sb)) },
  { id: 'M29b', title: 'explicit --store', setup: (sb) => at(bare(sb), undefined, 'alpha') },
  {
    id: 'M29c',
    title: 'config-only pointer',
    setup: (sb) => at(repo(sb, 'm29c', configOnly('store: alpha\n'))),
  },
  {
    id: 'M29d',
    title: 'defaultStore',
    setup: async (sb) => {
      await setDefaultStore(sb, 'alpha')
      return at(bare(sb))
    },
  },
]

describe('an unreadable store registry fails selection with its diagnostic (ledger 5.17)', () => {
  for (const route of REGISTRY_ROUTES) {
    row({
      id: route.id,
      title: `malformed registry, ${route.title}`,
      setup: async (sb) => {
        const fx = await route.setup(sb)
        breakRegistry(sb)
        return fx
      },
      expected: () => code('invalid_store_registry'),
    })

    describe(`${route.id} malformed registry, ${route.title}: the CLI`, () => {
      let sb!: Sandbox
      let fx!: Fixture
      const storeFlag = (): string[] => (fx.store === undefined ? [] : ['--store', fx.store])

      beforeAll(async () => {
        sb = await makeSandbox()
        fx = await route.setup(sb)
        breakRegistry(sb)
      })

      test("cospec context --json prints the binary's document", async () => {
        const argv = ['context', '--json', ...storeFlag()]
        const up = await oracle(argv, sb.dir, { cwd: fx.cwd })
        expect(up.exitCode).toBe(1)
        const res = await cospec(argv, { cwd: fx.cwd, env: sb.env })
        expect(res.exitCode).toBe(1)
        expect(res.stderr).toBe('')
        expect(res.stdout).toBe(respell(up.stdout))
      })

      test("cospec list --json carries the binary's diagnostic", async () => {
        const o = await rootOracle(sb, fx.cwd, ['list', '--json', ...storeFlag()])
        const res = await cospec(['list', '--json', ...storeFlag()], { cwd: fx.cwd, env: sb.env })
        expect(res.exitCode).toBe(1)
        expect(JSON.parse(res.stdout)).toEqual({ status: [o.diagnostic] })
      })

      test("cospec list prints the binary's failure after cospec:", async () => {
        const up = await oracle(['list', ...storeFlag()], sb.dir, { cwd: fx.cwd })
        expect(up.exitCode).toBe(1)
        const res = await cospec(['list', ...storeFlag()], { cwd: fx.cwd, env: sb.env })
        expect(res.exitCode).toBe(1)
        expect(res.stdout).toBe('')
        expect(res.stderr).toBe(up.stderr.replace(/^(?:✖ )?Error: /, 'cospec: '))
      })
    })
  }
})

// --- Ledger 5.21: only upstream's StoreError codes become resolver diagnostics ---

/** Mode-000 rows cannot fail for root, which reads any file. */
const RUNNING_AS_ROOT = process.getuid?.() === 0

/** Every code the pinned binary raises as a `StoreError` from `dist/core/store/*.js`. */
function pinnedStoreErrorCodes(): Set<string> {
  const dir = join(openspecPackageDir(), 'dist', 'core', 'store')
  const codes = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(join(dir, file), 'utf8')
    // `new StoreError(<message>, '<code>'` — the message is a template literal,
    // a quoted string, or an expression with no top-level comma.
    for (const m of text.matchAll(
      /new StoreError\((?:`(?:[^`\\]|\\.|\$\{[^}]*\})*`|'(?:[^'\\]|\\.)*'|[^,`']*?),\s*('([a-z_]+)'|[\w.]+)/g,
    ))
      if (m[2] !== undefined) codes.add(m[2])
    // Codes passed by variable (`diagnostic.code`, `data.code`) are declared as `code: '<code>'`.
    for (const m of text.matchAll(/\bcode: '([a-z_]+)'/g)) codes.add(m[1]!)
  }
  return codes
}

function lockRegistry(sb: Sandbox): string {
  const path = join(sb.env['XDG_DATA_HOME']!, 'openspec', 'stores', 'registry.yaml')
  chmodSync(path, 0o000)
  return path
}

describe("only upstream's StoreError codes become resolver diagnostics (ledger 5.21)", () => {
  test("STORE_ERROR_CODES is exactly the pinned binary's StoreError codes", () => {
    const pinned = pinnedStoreErrorCodes()
    expect(pinned.has('invalid_store_registry')).toBe(true)
    expect(pinned.has('store_error')).toBe(false)
    expect([...STORE_ERROR_CODES].toSorted()).toEqual([...pinned].toSorted())
  })

  const maybe = RUNNING_AS_ROOT ? describe.skip : describe
  for (const route of REGISTRY_ROUTES) {
    maybe(`${route.id} registry mode 000, ${route.title}`, () => {
      let sb!: Sandbox
      let fx!: Fixture
      let registry!: string
      const storeFlag = (): string[] => (fx.store === undefined ? [] : ['--store', fx.store])

      beforeAll(async () => {
        sb = await makeSandbox()
        fx = await route.setup(sb)
        registry = lockRegistry(sb)
      })
      afterAll(() => chmodSync(registry, 0o644))

      test("oracle: the binary fails with the errno's message, no origin prefix", async () => {
        const up = await oracle(['list', '--json', ...storeFlag()], sb.dir, { cwd: fx.cwd })
        expect(up.exitCode).toBe(1)
        const status = firstStatus(up.stdout) as OracleDiagnostic
        expect(status.message).toBe(`EACCES: permission denied, open '${registry}'`)
        expect(status).not.toHaveProperty('fix')
      })

      // The JSON `code` is not pinned here: the binary reports a per-command
      // code for a raw failure (`list_error`, `change_error`, …), which is
      // cli-surface-parity's (roadmap row 37). This row pins message and exit.
      test("cospec list --json carries the binary's message and exit code", async () => {
        const argv = ['list', '--json', ...storeFlag()]
        const up = await oracle(argv, sb.dir, { cwd: fx.cwd })
        const res = await cospec(argv, { cwd: fx.cwd, env: sb.env })
        expect(res.exitCode).toBe(up.exitCode)
        expect(res.stderr).toBe(up.stderr)
        const status = firstStatus(res.stdout) as OracleDiagnostic
        expect(status.message).toBe((firstStatus(up.stdout) as OracleDiagnostic).message)
        expect(status).not.toHaveProperty('fix')
        expect(status).not.toHaveProperty('target')
      })

      test("cospec list prints the binary's failure after cospec:", async () => {
        const up = await oracle(['list', ...storeFlag()], sb.dir, { cwd: fx.cwd })
        expect(up.exitCode).toBe(1)
        const res = await cospec(['list', ...storeFlag()], { cwd: fx.cwd, env: sb.env })
        expect(res.exitCode).toBe(1)
        expect(res.stdout).toBe('')
        expect(res.stderr).toBe(up.stderr.replace(/^(?:✖ )?Error: /, 'cospec: '))
      })

      test('cospec templates --json answers as the binary does without --store', async () => {
        const argv = ['templates', '--json']
        const up = await oracle(argv, sb.dir, { cwd: fx.cwd })
        const res = await cospec([...argv, ...storeFlag()], { cwd: fx.cwd, env: sb.env })
        if (fx.store === undefined) {
          expect(up.exitCode).toBe(0)
          expect(res).toEqual({ exitCode: up.exitCode, stdout: up.stdout, stderr: up.stderr })
        } else {
          // An explicit --store keeps its selection failure (ledger 5.15).
          expect(res.exitCode).toBe(1)
          expect(firstStatus(res.stdout)).toMatchObject({
            message: `EACCES: permission denied, open '${registry}'`,
          })
        }
      })
    })
  }

  // The StoreError half: a malformed registry keeps its converted, prefixed
  // `invalid_store_registry` diagnostic (ledger 5.17's rows).
})

// --- Ledger 5.18: doctor from a subdirectory checks the enclosing root ---

interface DoctorFinding {
  level: string
  check: string
  message: string
}

describe('cospec doctor from a subdirectory checks the enclosing root (ledger 5.18)', () => {
  test("the findings are the root's, and the operating root is the binary's", async () => {
    const sb = await makeSandbox([])
    const dir = repo(sb, 'doc', {
      dirs: ['openspec/changes/archive', 'openspec/specs', 'src/deep'],
      files: {
        'openspec/config.yaml': 'schema: spec-driven\nreferences:\n  - id: nonexistent-store\n',
      },
    })
    const sub = join(dir, 'src', 'deep')
    const o = await oracleJsonRoot(sb, sub)
    expect(o).toEqual({ path: canonical(dir), source: 'nearest' })
    const [atRoot, atSub] = await Promise.all([
      cospec(['doctor', '--json'], { cwd: dir, env: sb.env }),
      cospec(['doctor', '--json'], { cwd: sub, env: sb.env }),
    ])
    const findings = (stdout: string): DoctorFinding[] =>
      (JSON.parse(stdout) as { findings: DoctorFinding[] }).findings
    const fromSub = findings(atSub.stdout)
    expect(fromSub.some((f) => f.check === 'initialized')).toBe(false)
    expect(fromSub).toEqual(findings(atRoot.stdout))
    expect(atSub.exitCode).toBe(atRoot.exitCode)
    expect(fromSub.find((f) => f.check === 'openspec-root')?.message).toBe(
      `operating root is nearest-sourced at ${o.path} (healthy per openspec doctor)`,
    )
    expect(fromSub.some((f) => f.check.startsWith('openspec-reference-nonexistent-store'))).toBe(
      true,
    )
  })
})

/** The root `openspec doctor --json` reports from `cwd`. */
async function oracleJsonRoot(sb: Sandbox, cwd: string): Promise<OracleRoot> {
  const run = await oracle(['doctor', '--json'], sb.dir, { cwd })
  const body = JSON.parse(run.stdout) as { root: { path: string; source: string } }
  return { path: body.root.path, source: body.root.source }
}

// --- Ledger 5.20: a global config that cannot be read or parsed reads as defaults ---

type GlobalConfigState = 'absent' | 'valid' | 'directory' | 'mode 000' | 'invalid JSON'

/** The sandbox's global config file path, as the binary reports it. */
async function globalConfigPath(sb: Sandbox): Promise<string> {
  const run = await oracle(['config', 'path'], sb.dir)
  if (run.exitCode !== 0) throw new Error(`openspec config path exited ${run.exitCode}`)
  return run.stdout.replace(/\n$/, '')
}

/** Put the global config file into `state`, replacing whatever was there. */
function placeGlobalConfig(path: string, state: GlobalConfigState): void {
  try {
    chmodSync(path, 0o644)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  rmSync(path, { recursive: true, force: true })
  mkdirSync(dirname(path), { recursive: true })
  const valid = '{"defaultStore": "alpha"}\n'
  if (state === 'valid') writeFileSync(path, valid)
  if (state === 'directory') mkdirSync(path)
  if (state === 'invalid JSON') writeFileSync(path, '{"defaultStore": \n')
  if (state === 'mode 000') {
    writeFileSync(path, valid)
    chmodSync(path, 0o000)
  }
}

/** The first `status` entry of a `--json` document. */
function firstStatus(stdout: string): unknown {
  return (JSON.parse(stdout) as { status?: unknown[] }).status?.[0]
}

/** One run of either implementation: what a user sees. */
interface Seen {
  exitCode: number
  stdout: string
  stderr: string
}

describe('a global config that cannot be read or parsed reads as defaults (ledger 5.20)', () => {
  // Upstream's getGlobalConfig() answers with its defaults (no defaultStore)
  // for ANY failure to read or parse the file, and prints one warning for a
  // file that is not JSON; `templates` and `schema` never read it at all.
  const ROOT_ARGVS = [
    ['list', '--json'],
    ['status', '--json'],
    ['doctor', '--json'],
  ] as const
  const CWD_ARGVS = [['templates'], ['schema', 'which', 'spec-driven']] as const
  const BROKEN: readonly GlobalConfigState[] = ['directory', 'mode 000', 'invalid JSON']

  let sb!: Sandbox
  let configPath!: string
  let cwds!: { name: string; dir: string }[]

  beforeAll(async () => {
    sb = await makeSandbox()
    configPath = await globalConfigPath(sb)
    cwds = [
      { name: 'a rootless directory', dir: bare(sb) },
      { name: 'a subdirectory of a planning root', dir: join(planningRoot(sb), 'src', 'deep') },
    ]
  })

  afterAll(() => placeGlobalConfig(configPath, 'absent'))

  const binary = async (state: GlobalConfigState, argv: readonly string[], cwd: string) => {
    placeGlobalConfig(configPath, state)
    const run = await oracle([...argv], sb.dir, { cwd })
    return run as Seen
  }
  const ours = async (state: GlobalConfigState, argv: readonly string[], cwd: string) => {
    placeGlobalConfig(configPath, state)
    return (await cospec([...argv], { cwd, env: sb.env })) as Seen
  }
  const warning = (): string => `Warning: Invalid JSON in ${configPath}, using defaults\n`

  for (const state of BROKEN) {
    const maybe = state === 'mode 000' && RUNNING_AS_ROOT ? test.skip : test
    for (const [c, cwdIndex] of [
      ['a rootless directory', 0],
      ['a subdirectory of a planning root', 1],
    ] as const) {
      describe(`${state}, from ${c}`, () => {
        const cwd = (): string => cwds[cwdIndex]!.dir
        // The binary warns only when root selection reads the file: rootless, not below a root.
        const warns = state === 'invalid JSON' && cwdIndex === 0

        for (const argv of ROOT_ARGVS) {
          maybe(`oracle: ${argv.join(' ')} answers as with no config file`, async () => {
            const broken = await binary(state, argv, cwd())
            const absent = await binary('absent', argv, cwd())
            expect(broken.exitCode).toBe(absent.exitCode)
            expect(broken.stdout).toBe(absent.stdout)
            expect(broken.stderr).toBe((warns ? warning() : '') + absent.stderr)
          })

          maybe(`cospec ${argv.join(' ')} answers as with no config file`, async () => {
            const up = await binary(state, argv, cwd())
            const broken = await ours(state, argv, cwd())
            const absent = await ours('absent', argv, cwd())
            expect(broken.stdout).toBe(absent.stdout)
            expect(broken.exitCode).toBe(absent.exitCode)
            expect(broken.stderr).toBe(up.stderr)
            if (argv[0] !== 'doctor') expect(broken.exitCode).toBe(up.exitCode)
            if (up.exitCode !== 0)
              expect(firstStatus(broken.stdout)).toEqual(
                JSON.parse(respell(JSON.stringify(firstStatus(up.stdout)))),
              )
          })
        }

        for (const argv of CWD_ARGVS) {
          maybe(`cospec ${argv.join(' ')} answers as the binary does`, async () => {
            const up = await binary(state, argv, cwd())
            const res = await ours(state, argv, cwd())
            expect(up.exitCode).toBe(0)
            // cospec reads the config to select a root for these (design D8);
            // the binary never does, so the warning is cospec's one extra line.
            expect(res).toEqual({ ...up, stderr: (warns ? warning() : '') + up.stderr })
          })
        }

        if (cwdIndex === 0)
          maybe("cospec list prints the binary's text failure", async () => {
            const up = await binary(state, ['list'], cwd())
            const res = await ours(state, ['list'], cwd())
            expect(res.exitCode).toBe(1)
            expect(res.stdout).toBe('')
            expect(res.stderr).toBe(respell(up.stderr.replace(/^(?:✖ )?Error: /m, 'cospec: ')))
          })
      })
    }
  }

  describe('valid, with defaultStore alpha', () => {
    for (const argv of [
      ['list', '--json'],
      ['status', '--json'],
    ])
      test(`from a rootless directory, ${argv.join(' ')} selects the binary's root`, async () => {
        const cwd = cwds[0]!.dir
        const up = await binary('valid', argv, cwd)
        const res = await ours('valid', argv, cwd)
        expect(up.exitCode).toBe(0)
        expect(res.exitCode).toBe(0)
        expect(res.stderr).toBe(up.stderr)
        const root = (JSON.parse(up.stdout) as { root: OracleRoot }).root
        expect(root).toEqual({
          path: canonical(storePath(sb, 'alpha')),
          source: 'global_default',
          store_id: 'alpha',
        })
        if (argv[0] === 'status')
          expect((JSON.parse(res.stdout) as { root: string }).root).toBe(root.path)
      })

    test("from a rootless directory, doctor --json operates on the binary's root", async () => {
      const cwd = cwds[0]!.dir
      const up = JSON.parse((await binary('valid', ['doctor', '--json'], cwd)).stdout) as {
        root: { path: string; source: string }
      }
      const res = await ours('valid', ['doctor', '--json'], cwd)
      const findings = (JSON.parse(res.stdout) as { findings: DoctorFinding[] }).findings
      expect(findings.find((f) => f.check === 'openspec-root')?.message).toBe(
        `operating root is ${up.root.source}-sourced at ${up.root.path} (healthy per openspec doctor)`,
      )
    })

    test('from a subdirectory, the planning root wins', async () => {
      const cwd = cwds[1]!.dir
      const up = await binary('valid', ['status', '--json'], cwd)
      const res = await ours('valid', ['status', '--json'], cwd)
      expect(res.stderr).toBe(up.stderr)
      expect((JSON.parse(res.stdout) as { root: string }).root).toBe(
        (JSON.parse(up.stdout) as { root: OracleRoot }).root.path,
      )
    })

    for (const argv of CWD_ARGVS)
      for (const [c, cwdIndex] of [
        ['rootless', 0],
        ['subdirectory', 1],
      ] as const)
        test(`cospec ${argv.join(' ')} (${c}) answers as the binary does`, async () => {
          const cwd = cwds[cwdIndex]!.dir
          const up = await binary('valid', argv, cwd)
          const res = await ours('valid', argv, cwd)
          expect(up.exitCode).toBe(0)
          if (cwdIndex === 1) expect(res).toEqual(up)
          else {
            // cospec spawns in the defaultStore root (design D8's superset); the binary reads its cwd.
            expect(res.exitCode).toBe(0)
            expect(res.stdout).toBe(up.stdout)
          }
        })
  })

  describe('invalid JSON with no store registered', () => {
    // The only fixture where cospec reads the file and then relays a wrapped
    // call whose own root selection reads it again: the warning prints once.
    let bareSb!: Sandbox
    let bareConfig!: string
    beforeAll(async () => {
      bareSb = await makeSandbox([])
      bareConfig = await globalConfigPath(bareSb)
    })
    afterAll(() => placeGlobalConfig(bareConfig, 'absent'))

    // `show` relays the wrapped call, whose own selection warns again (design D7).
    for (const argv of [
      ['list', '--json'],
      ['list'],
      ['status', '--json'],
      ['show', '--json', 'x'],
    ])
      test(`cospec ${argv.join(' ')} from a rootless directory prints the warning once`, async () => {
        const cwd = bare(bareSb)
        placeGlobalConfig(bareConfig, 'invalid JSON')
        const up = await oracle([...argv], bareSb.dir, { cwd })
        const res = await cospec([...argv], { cwd, env: bareSb.env })
        const line = `Warning: Invalid JSON in ${bareConfig}, using defaults\n`
        expect(up.stderr.startsWith(line)).toBe(true)
        expect(res.stderr.split(line).length - 1).toBe(1)
        expect(res.stderr.startsWith(line)).toBe(true)
        // Otherwise as with no config file: `list` keeps design D6's implicit root.
        placeGlobalConfig(bareConfig, 'absent')
        const absent = await cospec([...argv], { cwd, env: bareSb.env })
        expect(res.stdout).toBe(absent.stdout)
        expect(res.exitCode).toBe(absent.exitCode)
        expect(res.stderr).toBe(line + absent.stderr)
        if (argv[0] !== 'list') expect(res.exitCode).toBe(up.exitCode)
      })
  })
})
