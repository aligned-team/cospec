import { dirname, join } from 'node:path'

import { extractEmbeddedOpenspec } from './openspec-embedded.ts'

/**
 * The exact `@fission-ai/openspec` version this repo pins for dev/CI (the
 * `package.json` dependency and the `mise.toml` tool). The contract suite runs
 * against exactly this build; the version tripwire holds it equal to the pin.
 */
export const PINNED_OPENSPEC_VERSION = '1.5.0'

/** Inclusive floor of the accepted runtime range. */
export const OPENSPEC_VERSION_FLOOR = '1.0.0'
/** Exclusive ceiling of the accepted runtime range (next major). */
export const OPENSPEC_VERSION_CEILING = '2.0.0'
/**
 * The semver range cospec accepts at runtime. Every release probed from the
 * floor through the current pin is contract-verified to leave the wrapped
 * surface (exit codes, JSON shapes, archive quirks) that cospec reads
 * unchanged; the ceiling stops at the next major, where breaking changes are
 * allowed. A version outside this range is refused before any wrapped call
 * (DESIGN §1) unless drift is explicitly overridden.
 */
export const OPENSPEC_VERSION_RANGE = `>=${OPENSPEC_VERSION_FLOOR} <${OPENSPEC_VERSION_CEILING}`

type SemverCore = [number, number, number]

/** Parse the `x.y.z` core of a semver string, ignoring any pre-release/build. */
function parseSemver(raw: string): SemverCore | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim())
  if (match === null) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a: SemverCore, b: SemverCore): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

function parseSemverOrThrow(raw: string): SemverCore {
  const parsed = parseSemver(raw)
  if (parsed === null) throw new Error(`unparseable semver constant: ${raw}`)
  return parsed
}

/**
 * True when `version` satisfies the accepted range `>=FLOOR <CEILING`. An
 * unparseable version is never in range (fail closed).
 */
export function satisfiesOpenspecRange(version: string): boolean {
  const parsed = parseSemver(version)
  if (parsed === null) return false
  return (
    compareSemver(parsed, parseSemverOrThrow(OPENSPEC_VERSION_FLOOR)) >= 0 &&
    compareSemver(parsed, parseSemverOrThrow(OPENSPEC_VERSION_CEILING)) < 0
  )
}

export interface OpenspecResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * A post-condition closure. Returns `true`/`void` when the observable state is
 * as expected, or `false`/a message string to fail the wrapped call. Every
 * wrapped call site should register one (DESIGN §1 wrapped-call discipline).
 */
export type PostCondition = (
  result: OpenspecResult,
) => boolean | string | void | Promise<boolean | string | void>

export interface RunExpectation {
  /** Exit codes that are not a failure. Defaults to `[0]`. */
  exitCodes?: number[]
  /** stdout patterns that indicate failure even on an allowed exit code. */
  denyStdout?: RegExp[]
  /** Observable post-condition (filesystem or JSON-shape). */
  postCondition?: PostCondition
}

export interface RunOptions {
  /** Absolute path the wrapped binary runs in (the target repo root). */
  cwd: string
  /** Declared expectations; omit for fully manual inspection (e.g. archive). */
  expect?: RunExpectation
}

/** Thrown when a wrapped call violates its declared expectations. */
export class OpenspecCallError extends Error {
  readonly result: OpenspecResult

  constructor(message: string, result: OpenspecResult) {
    super(message)
    this.name = 'OpenspecCallError'
    this.result = result
  }
}

let cachedPackageDir: string | undefined

/**
 * Directory of the bundled `@fission-ai/openspec` package, resolved by path (not
 * `$PATH`). Also the source of its `schemas/` for legacy-schema resolution.
 *
 * Resolution bases, in order: this module's dir (dev/from-source — inside a
 * compiled binary this is a $bunfs path with no node_modules, so it misses),
 * then the running executable's dir (the installed platform package sits in
 * the consumer's node_modules next to the main package's `@fission-ai/openspec`
 * dependency), then the invocation cwd (a consumer project that installed
 * openspec directly). Fails with an actionable error, never a raw resolve
 * throw.
 */
export function openspecPackageDir(): string {
  if (cachedPackageDir !== undefined) return cachedPackageDir
  const bases = [import.meta.dir, dirname(process.execPath), process.cwd()]
  for (const base of bases) {
    try {
      cachedPackageDir = dirname(Bun.resolveSync('@fission-ai/openspec/package.json', base))
      return cachedPackageDir
    } catch {
      // try the next base
    }
  }
  throw new Error(
    'could not find the @fission-ai/openspec package from the executable or the current ' +
      'directory. It installs automatically as a dependency of @aligned-team/cospec; for a ' +
      'standalone (mise/GitHub-release) install, add it to the project: ' +
      'npm i -D @fission-ai/openspec@' +
      PINNED_OPENSPEC_VERSION,
  )
}

/** Where a wrapped call resolves openspec from. */
export type OpenspecResolution =
  | { source: 'project'; packageDir: string }
  | { source: 'embedded'; version: string }

/**
 * The resolution a wrapped call would use, in order:
 *   1. the project's own `node_modules` copy (dev, and any consumer that
 *      installs openspec) — resolved by path via `openspecPackageDir()`. Its
 *      version is still asserted against the accepted range by `assertVersion`.
 *   2. the embedded bundle. This is what makes a standalone (mise /
 *      GitHub-release) install self-contained: no node_modules, no bun, no npm.
 *      The embedded copy is by construction the pin, so it satisfies the
 *      version assertion.
 * Never extracts the bundle — shared with `cospec doctor`, whose report must
 * stay read-only and must name the same source a spawn would use.
 */
export function resolveOpenspec(): OpenspecResolution {
  try {
    return { source: 'project', packageDir: openspecPackageDir() }
  } catch {
    return { source: 'embedded', version: PINNED_OPENSPEC_VERSION }
  }
}

/**
 * Path to the wrapped openspec bin for the resolved source; the embedded
 * bundle is extracted to a per-version cache dir and run via the compiled
 * binary's own bun runtime.
 */
function openspecBin(): string {
  const resolved = resolveOpenspec()
  return resolved.source === 'project'
    ? join(resolved.packageDir, 'bin', 'openspec.js')
    : extractEmbeddedOpenspec(resolved.version)
}

/**
 * Raw spawn — no version assertion, no expectation enforcement.
 *
 * The interpreter is the CURRENT executable, not a `bun` looked up on $PATH:
 * under `bun run` that IS bun, and inside a compiled standalone binary
 * BUN_BE_BUN=1 makes the executable behave as the bun runtime for the child
 * (a compiled binary otherwise always runs its embedded entrypoint). This is
 * what keeps the wrapped openspec calls working on machines with no bun.
 */
async function spawnRaw(args: string[], cwd: string): Promise<OpenspecResult> {
  const proc = Bun.spawn([process.execPath, openspecBin(), '--no-color', ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    // OPENSPEC_TELEMETRY=0: openspec prints a first-run "collects anonymous
    // usage stats" notice to STDOUT (not stderr) on a HOME with no prior
    // acknowledgment, which corrupts every `--json` read (status, list, apply
    // instructions). A standalone/embedded user is always first-run, so this is
    // load-bearing for the self-contained binary — and cospec wraps the tool
    // deterministically, so it opts the wrapped calls out of telemetry too.
    env: { ...process.env, NO_COLOR: '1', BUN_BE_BUN: '1', OPENSPEC_TELEMETRY: '0' },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

/**
 * Pure version gate (extracted for testing). Throws with the DESIGN §1 message
 * on mismatch unless drift is explicitly allowed.
 */
export function checkVersion(actual: string, allowDrift: boolean): void {
  if (allowDrift) return
  const version = actual.trim()
  if (!satisfiesOpenspecRange(version))
    throw new Error(
      `wrapped openspec is ${version || '<unknown>'}, expected a version satisfying ` +
        `${OPENSPEC_VERSION_RANGE} — refusing to run (COSPEC_ALLOW_OPENSPEC_DRIFT=1 to override, ` +
        'which makes cospec version-blind but does NOT make an out-of-range binary safe to wrap)',
    )
}

let versionAsserted: Promise<void> | undefined

/** Assert the wrapped version once per process (memoized). */
function assertVersion(): Promise<void> {
  versionAsserted ??= (async () => {
    const allowDrift = process.env.COSPEC_ALLOW_OPENSPEC_DRIFT === '1'
    if (allowDrift) return
    const res = await spawnRaw(['--version'], process.cwd())
    checkVersion(res.stdout, false)
  })()
  return versionAsserted
}

/**
 * Version-asserted spawn without expectation enforcement. Use for call sites
 * (e.g. `archive`) that must inspect the raw exit code and output themselves.
 */
export async function spawnOpenspec(args: string[], cwd: string): Promise<OpenspecResult> {
  await assertVersion()
  return spawnRaw(args, cwd)
}

/**
 * Pure expectation enforcement over exit code and stdout deny-list (extracted
 * for testing). Post-conditions are enforced separately in `runOpenspec`
 * because they may be async.
 */
export function enforceExpectation(
  label: string,
  result: OpenspecResult,
  expect: RunExpectation,
): void {
  const codes = expect.exitCodes ?? [0]
  if (!codes.includes(result.exitCode))
    throw new OpenspecCallError(
      `${label} exited ${result.exitCode} (expected ${codes.join(', ')})`,
      result,
    )
  if (expect.denyStdout)
    for (const pattern of expect.denyStdout)
      if (pattern.test(result.stdout))
        throw new OpenspecCallError(
          `${label} output matched forbidden pattern /${pattern.source}/`,
          result,
        )
}

/**
 * The wrapped-call front door (DESIGN §1). Asserts the version, spawns the
 * bundled binary, and enforces the declared expectations. Throws
 * `OpenspecCallError` on any violation.
 */
export async function runOpenspec(args: string[], opts: RunOptions): Promise<OpenspecResult> {
  const result = await spawnOpenspec(args, opts.cwd)
  const expect = opts.expect
  if (expect) {
    const label = `openspec ${args.join(' ')}`
    enforceExpectation(label, result, expect)
    if (expect.postCondition) {
      const outcome = await expect.postCondition(result)
      if (outcome === false || typeof outcome === 'string')
        throw new OpenspecCallError(
          typeof outcome === 'string' ? outcome : `${label} post-condition failed`,
          result,
        )
    }
  }
  return result
}

// --- Operating root (local repo vs. registered store) ----------------------

/**
 * The OpenSpec root a command operates on. For a local repo this is just the
 * invocation cwd; for a registered store (openspec 1.5.0 `store`) it is the
 * store's on-disk root plus the `--store <id>` args every wrapped call must
 * carry. Filesystem readers (change.ts, blockers, archive verification) key on
 * `base`; wrapped openspec spawns run in `cwd` and append `storeArgs`. Because a
 * store's on-disk layout is identical to a repo's (`<base>/openspec/...`), the
 * filesystem helpers need no store-specific branch — they just take `base`.
 */
export interface Root {
  /** Filesystem base whose `openspec/` subdir holds specs + changes. */
  base: string
  /** cwd the wrapped openspec binary is spawned in. */
  cwd: string
  /** Args that target this root for wrapped calls: `['--store', id]` or `[]`. */
  storeArgs: readonly string[]
  /** Store id when the root is a registered store, else undefined. */
  store?: string
}

/** The local-repo root: base and spawn-cwd are the same, no store args. */
export function localRoot(cwd: string): Root {
  return { base: cwd, cwd, storeArgs: [], store: undefined }
}

/** One registered store from `openspec store ls --json`. */
export interface StoreListEntry {
  id: string
  root: string
}

/** Shape of `openspec store ls --json`. */
export interface StoreListJson {
  stores: StoreListEntry[]
}

/**
 * Typed `openspec store ls --json` — the machine-global store registry. Not
 * root-scoped (stores are registered per machine), so it takes a plain cwd and
 * never carries `--store`. Throws `OpenspecCallError` on a non-zero exit or an
 * unparseable body.
 */
export async function openspecStoreList(cwd: string): Promise<StoreListJson> {
  const res = await runOpenspec(['store', 'ls', '--json'], { cwd, expect: { exitCodes: [0] } })
  try {
    const parsed = JSON.parse(res.stdout) as Partial<StoreListJson>
    return { stores: Array.isArray(parsed.stores) ? parsed.stores : [] }
  } catch {
    throw new OpenspecCallError('could not parse JSON from: openspec store ls --json', res)
  }
}

// --- Typed JSON shapes for the wrapped commands (probed across the accepted
// floor-through-pin span 1.0.0–1.5.0 and found unchanged; 1.5.0 only adds
// optional fields). ---

export type ArtifactStatus = 'done' | 'ready' | 'blocked'

export interface StatusArtifact {
  id: string
  outputPath: string
  status: ArtifactStatus
}

/** Shape of `openspec status --change <id> --json`. */
export interface StatusJson {
  changeName: string
  schemaName: string
  isComplete: boolean
  applyRequires: string[]
  artifacts: StatusArtifact[]
}

export interface ListChangeEntry {
  name: string
  completedTasks: number
  totalTasks: number
  lastModified: string
  status: string
}

/** Shape of `openspec list --json`. */
export interface ListJson {
  changes: ListChangeEntry[]
}

export type ApplyState = 'ready' | 'blocked' | 'all_done'

export interface ApplyTask {
  id: string
  description: string
  done: boolean
}

/** Shape of `openspec instructions apply --change <id> --json`. */
export interface ApplyInstructionsJson {
  changeName: string
  changeDir: string
  schemaName: string
  contextFiles: Record<string, string[]>
  progress: { total: number; complete: number; remaining: number }
  tasks: ApplyTask[]
  state: ApplyState
  missingArtifacts?: string[]
  instruction: string
}

/** Shape of `openspec instructions <artifact> --change <id> --json`. */
export interface ArtifactInstructionsJson {
  changeName: string
  artifactId: string
  schemaName: string
  changeDir: string
  outputPath: string
  description: string
  instruction: string
  template: string
  dependencies: unknown[]
  unlocks: string[]
}

async function runJson<T>(root: Root, args: string[]): Promise<T> {
  const res = await runOpenspec([...args, ...root.storeArgs], {
    cwd: root.cwd,
    expect: { exitCodes: [0] },
  })
  try {
    return JSON.parse(res.stdout) as T
  } catch {
    throw new OpenspecCallError(`could not parse JSON from: openspec ${args.join(' ')}`, res)
  }
}

/** Typed `openspec status --change <id> --json`. Throws on unknown change. */
export function openspecStatus(root: Root, changeId: string): Promise<StatusJson> {
  return runJson<StatusJson>(root, ['status', '--change', changeId, '--json'])
}

/** Typed `openspec list --json`. Throws when no openspec dir exists. */
export function openspecList(root: Root): Promise<ListJson> {
  return runJson<ListJson>(root, ['list', '--json'])
}

/** Typed `openspec instructions apply --change <id> --json`. */
export function openspecApplyInstructions(
  root: Root,
  changeId: string,
): Promise<ApplyInstructionsJson> {
  return runJson<ApplyInstructionsJson>(root, [
    'instructions',
    'apply',
    '--change',
    changeId,
    '--json',
  ])
}

/** Typed `openspec instructions <artifact> --change <id> --json`. */
export function openspecArtifactInstructions(
  root: Root,
  artifact: string,
  changeId: string,
): Promise<ArtifactInstructionsJson> {
  return runJson<ArtifactInstructionsJson>(root, [
    'instructions',
    artifact,
    '--change',
    changeId,
    '--json',
  ])
}
