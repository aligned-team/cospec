import { dirname, join } from 'node:path'

import { extractEmbeddedOpenspec } from './openspec-embedded.ts'

/**
 * The exact `@fission-ai/openspec` version this repo pins for dev/CI (the
 * `package.json` dependency and the `mise.toml` tool). The contract suite runs
 * against exactly this build; the version tripwire holds it equal to the pin.
 */
export const PINNED_OPENSPEC_VERSION = '1.13.1'

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
 * Environment overrides forced onto EVERY wrapped openspec spawn. Exported so
 * the discipline is testable rather than buried in the spawn call.
 *
 * - `NO_COLOR` alone is not enough: if the invoking shell also exports
 *   `FORCE_COLOR` (or `COLORTERM`/`CLICOLOR`/`CLICOLOR_FORCE`), the wrapped
 *   binary's Node/Bun runtime prints "The 'NO_COLOR' env is ignored due to
 *   the 'FORCE_COLOR' env being set" (`internal:tty` `warnOnDeactivatedColors`)
 *   on stderr — which `runPassthrough` relays verbatim to a real user running
 *   e.g. `cospec config get` from a shell with `FORCE_COLOR` exported, and
 *   which also corrupts every parsed-stderr expectation in the test suites.
 *   `spawnRaw` strips these keys from the inherited env before applying
 *   `WRAPPED_ENV` so the child never sees a conflicting color signal.
 * - `NO_COLOR` / `BUN_BE_BUN`: deterministic, parseable output, and the child
 *   behaves as the bun runtime even under a compiled standalone binary.
 * - `OPENSPEC_TELEMETRY=0`: openspec prints a first-run "collects anonymous
 *   usage stats" notice to STDOUT (not stderr) on a HOME with no prior
 *   acknowledgment, which corrupts every `--json` read (status, list, apply
 *   instructions). A standalone/embedded user is always first-run, so this is
 *   load-bearing for the self-contained binary — and cospec wraps the tool
 *   deterministically, so it opts the wrapped calls out of telemetry too. It is
 *   ALSO what disables openspec's own update check: that check is wired into
 *   openspec's CLI entry, so it runs on every command rather than just
 *   `init`/`update`, and its `isCheckEnabled()` returns false precisely because
 *   `OPENSPEC_TELEMETRY` is `'0'`. Dropping this key would silently re-enable an
 *   outbound npm registry request on every wrapped call.
 * - `OPENSPEC_NO_COMPLETIONS=1`: 1.10.0 added a SECOND one-shot first-run
 *   notice — "Tip: Run 'openspec completion install' for shell completions" —
 *   on stderr, behind its own env gate rather than the telemetry one.
 *   `runPassthrough` relays wrapped stderr verbatim, and cospec users must
 *   never be told to run a bare `openspec` command. Honoured only >=1.10.0; an
 *   unrecognised env var is inert on older runtimes in the accepted range.
 */
export const WRAPPED_ENV: Readonly<Record<string, string>> = {
  NO_COLOR: '1',
  BUN_BE_BUN: '1',
  OPENSPEC_TELEMETRY: '0',
  OPENSPEC_NO_COMPLETIONS: '1',
}

/**
 * Color-forcing env vars the wrapped runtime's tty color-depth detection
 * reads. Deleted from the child's inherited env (see `WRAPPED_ENV` above)
 * so a parent shell that exports one alongside `NO_COLOR` can never trigger
 * the deactivated-colors warning on the wrapped binary's stderr.
 */
export const COLOR_FORCING_ENV_KEYS: readonly string[] = [
  'FORCE_COLOR',
  'COLORTERM',
  'CLICOLOR',
  'CLICOLOR_FORCE',
]

/**
 * `process.env` merged with `WRAPPED_ENV`, minus every `COLOR_FORCING_ENV_KEYS`
 * entry the parent shell may have exported. Extracted so the env-building
 * discipline is unit-testable independent of a real spawn.
 */
export function buildWrappedSpawnEnv(
  parentEnv: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...parentEnv }
  for (const key of COLOR_FORCING_ENV_KEYS) delete out[key]
  return { ...out, ...WRAPPED_ENV }
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
    env: buildWrappedSpawnEnv(),
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
 * How a wrapped-call violation names the call in cospec's output: the argv
 * handed to the wrapped binary, never spelled as a bare `openspec` command a
 * user could copy and run outside cospec.
 */
export function wrappedCallLabel(args: readonly string[]): string {
  return `the wrapped OpenSpec call \`${args.join(' ')}\``
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
    const label = wrappedCallLabel(args)
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
 * invocation cwd; for a registered store (openspec `store`, added in 1.5.0) it is the
 * store's on-disk root plus the `--store <id>` args every wrapped call must
 * carry. Filesystem readers (change.ts, blockers, archive verification) key on
 * `base`; wrapped openspec spawns run in `cwd` and thread `storeArgs` right
 * after the command path (`threadedArgv`). Because a store's on-disk layout is
 * identical to a repo's (`<base>/openspec/...`), the filesystem helpers need no
 * store-specific branch — they just take `base`.
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

/** One entry of `openspec store ls --json`'s `status` array. */
export interface StoreListDiagnostic {
  severity: string
  code: string
  message: string
  target?: string
  fix?: string
}

/** Shape of `openspec store ls --json`. */
export interface StoreListJson {
  stores: StoreListEntry[]
}

/**
 * Every code the pinned binary raises as a `StoreError` (`dist/core/store/*.js`,
 * enumerated against the pinned dist by `root-resolution.test.ts`). Upstream's
 * resolver turns only a `StoreError` into a `RootSelectionError`
 * (`fromStoreError`); any other failure reading the registry — an errno such as
 * `EACCES` — is rethrown raw, and `store ls` reports it under its fallback code
 * `store_error`.
 */
export const STORE_ERROR_CODES: ReadonlySet<string> = new Set([
  'invalid_store_id',
  'invalid_store_metadata',
  'invalid_store_pointer',
  'invalid_store_registry',
  'no_store_registry',
  'store_git_commit_failed',
  'store_git_identity_missing',
  'store_git_init_failed',
  'store_id_conflict',
  'store_metadata_id_mismatch',
  'store_metadata_missing',
  'store_not_found',
  'store_path_conflict',
  'store_path_missing',
  'store_path_not_directory',
  'store_path_required',
  'store_register_identity_confirmation_required',
  'store_register_root_unhealthy',
  'store_registry_busy',
  'store_registry_changed',
  'store_remote_empty',
  'store_remote_requires_hand_edit',
  'store_remove_contains_registered_store',
  'store_remove_metadata_missing',
  'store_remove_path_not_directory',
  'store_root_pointer_declared',
  'store_setup_inside_git_repo',
  'store_setup_non_empty_directory',
  'store_setup_path_changed',
  'store_setup_path_not_directory',
  'store_setup_path_required',
])

/**
 * `openspec store ls --json` could not read the registry and said why: exit 1
 * with an `error` entry in its `status`. Still a wrapped-call failure for a
 * caller that only lists; root selection reports it as upstream's resolver
 * does. `storeError` says whether upstream raised it as a `StoreError`
 * (`invalid_store_registry`, naming the file to repair), which its resolver
 * turns into a selection diagnostic, or as a raw error (an errno such as
 * `EACCES`, under `store ls`'s fallback code), which it rethrows as is.
 */
export class StoreRegistryError extends OpenspecCallError {
  readonly diagnostic: StoreListDiagnostic
  readonly storeError: boolean

  constructor(message: string, result: OpenspecResult, diagnostic: StoreListDiagnostic) {
    super(message, result)
    this.name = 'StoreRegistryError'
    this.diagnostic = diagnostic
    this.storeError = STORE_ERROR_CODES.has(diagnostic.code)
  }
}

/**
 * Typed `openspec store ls --json` — the machine-global store registry. Not
 * root-scoped (stores are registered per machine), so it takes a plain cwd and
 * never carries `--store`. A registry the binary cannot read (exit 1 with an
 * `error` diagnostic) throws `StoreRegistryError`; any other failure, or an
 * unparseable body, throws `OpenspecCallError`.
 */
export async function openspecStoreList(cwd: string): Promise<StoreListJson> {
  const label = wrappedCallLabel(['store', 'ls', '--json'])
  const res = await runOpenspec(['store', 'ls', '--json'], { cwd, expect: { exitCodes: [0, 1] } })
  let parsed: Partial<StoreListJson>
  try {
    parsed = JSON.parse(res.stdout) as Partial<StoreListJson>
  } catch {
    throw new OpenspecCallError(`could not parse JSON from ${label}`, res)
  }
  if (res.exitCode !== 0) {
    const status = (parsed as { status?: unknown }).status
    const error = Array.isArray(status)
      ? (status as StoreListDiagnostic[]).find((d) => d.severity === 'error')
      : undefined
    if (error === undefined)
      throw new OpenspecCallError(`${label} exited ${res.exitCode} with no error diagnostic`, res)
    throw new StoreRegistryError(`${label} reported ${error.code}: ${error.message}`, res, error)
  }
  return { stores: Array.isArray(parsed.stores) ? parsed.stores : [] }
}

// --- Typed JSON shapes for the wrapped commands (probed across the accepted
// floor-through-pin span 1.0.0–1.13.1). Each declares only the fields cospec
// reads; upstream emits more, and every release in the span has only added
// fields to these payloads. ---

/**
 * Per-artifact status in `openspec status --json`. `'skipped'` was added in
 * 1.7.0 for artifacts satisfied by a change's `skip_specs` marker.
 */
export type ArtifactStatus = 'done' | 'skipped' | 'ready' | 'blocked'

export interface StatusArtifact {
  id: string
  outputPath: string
  status: ArtifactStatus
}

/**
 * Shape of `openspec status --change <id> --json`.
 *
 * 1.8.0 renamed `isComplete` to `isPlanningComplete` and kept `isComplete` as a
 * compatibility alias, so both are present across the whole accepted range;
 * `isComplete` is declared required and `isPlanningComplete` optional so a
 * reader is correct from the floor up.
 */
export interface StatusJson {
  changeName: string
  schemaName: string
  isComplete: boolean
  isPlanningComplete?: boolean
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

/**
 * Shape of `openspec instructions apply --change <id> --json`.
 *
 * Field names are unchanged across the accepted range, but 1.8.0 changed how
 * `progress` is counted: it now covers every checkbox line in `tasks.md`,
 * nested sub-tasks included, while `tasks[]` still lists only the entries with
 * a description. cospec's own `core/tasks.ts` counts top-level `- [ ] N.M`
 * lines only, so the two can legitimately disagree on a file with nested
 * checkboxes — see the apply-command reconciliation.
 */
export interface ApplyInstructionsJson {
  changeName: string
  changeDir: string
  schemaName: string
  contextFiles: Record<string, string[]>
  progress: { total: number; complete: number; remaining: number }
  tasks: ApplyTask[]
  state: ApplyState
  missingArtifacts?: string[]
  /**
   * The transitive closure of the schema's `apply.requires` still to build, in
   * build order (1.13.0). Can be longer than `missingArtifacts`, which stops at
   * the first hop apply blocks on.
   */
  missingPrerequisites?: string[]
  /**
   * Non-blocking problems reported alongside the instruction (1.13.0). Upstream
   * `collectApplyWarnings` is async as of 1.13.1 and emits a second string
   * there — one per delta file under `specs/` that is not a capability's
   * `spec.md`, on top of the no-delta-specs/`skip_specs` warning.
   */
  warnings?: string[]
  instruction: string
}

/**
 * Shape of `openspec instructions <artifact> --change <id> --json`.
 *
 * `instruction` is optional upstream (a schema need not define one), and 1.10.0
 * added `skipped` for an artifact a change's `skip_specs` marker satisfies —
 * when it is true the consumer is told not to create the artifact at all.
 */
export interface ArtifactInstructionsJson {
  changeName: string
  artifactId: string
  schemaName: string
  changeDir: string
  outputPath: string
  description: string
  instruction?: string
  template: string
  dependencies: unknown[]
  unlocks: string[]
  skipped?: boolean
}

async function runJson<T>(root: Root, command: string[], args: string[]): Promise<T> {
  const argv = threadedArgv(command, ['--json', ...root.storeArgs], args)
  const res = await runOpenspec(argv, { cwd: root.cwd, expect: { exitCodes: [0] } })
  try {
    return JSON.parse(res.stdout) as T
  } catch {
    throw new OpenspecCallError(`could not parse JSON from ${wrappedCallLabel(argv)}`, res)
  }
}

/** Typed `openspec status --change <id> --json`. Throws on unknown change. */
export function openspecStatus(root: Root, changeId: string): Promise<StatusJson> {
  return runJson<StatusJson>(root, ['status'], ['--change', changeId])
}

/** Typed `openspec list --json`. Throws when no openspec dir exists. */
export function openspecList(root: Root): Promise<ListJson> {
  return runJson<ListJson>(root, ['list'], [])
}

/** Typed `openspec instructions apply --change <id> --json`. */
export function openspecApplyInstructions(
  root: Root,
  changeId: string,
): Promise<ApplyInstructionsJson> {
  return runJson<ApplyInstructionsJson>(root, ['instructions', 'apply'], ['--change', changeId])
}

/** Typed `openspec instructions <artifact> --change <id> --json`. */
export function openspecArtifactInstructions(
  root: Root,
  artifact: string,
  changeId: string,
): Promise<ArtifactInstructionsJson> {
  return runJson<ArtifactInstructionsJson>(root, ['instructions', artifact], ['--change', changeId])
}

// --- Disciplined passthrough plumbing ---------------------------------------
//
// For read-only/mirror commands (`show`, `context`, `workset`, `schemas`, …)
// cospec adds no gate of its own — it only owes wrapped-call discipline:
// declared exit codes, a stdout deny-list, and (for `--json` callers) the
// guarantee that stdout is exactly one JSON document, even on failure.
// openspec's own failure envelope is `{ status: [{ severity, code, message,
// fix? }, …] }`; `openspec show <unknown> --json` is the documented quirk
// where that envelope is emitted while the process still exits 0 — proof that
// cospec must never trust the raw exit code alone for a `--json` passthrough.

/** One entry of openspec's `status: [...]` diagnostic envelope. */
export interface OpenspecStatusEntry {
  severity: 'error' | 'warning' | 'info' | string
  code: string
  message: string
  fix?: string
}

/**
 * True when `body` is openspec's own failure envelope: a top-level `status`
 * array containing at least one `severity: "error"` entry. Pure and exported
 * for direct unit testing (mirrors `enforceExpectation`).
 */
export function isOpenspecErrorStatus(body: unknown): boolean {
  if (body === null || typeof body !== 'object') return false
  const status = (body as Record<string, unknown>).status
  if (!Array.isArray(status)) return false
  return status.some(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      (entry as { severity?: unknown }).severity === 'error',
  )
}

/**
 * Enforce the one-JSON-doc invariant for a `--json` passthrough call (pure,
 * extracted for testing). Throws `OpenspecCallError` when stdout does not
 * parse as a single JSON document — a passthrough call must never hand the
 * caller partial/corrupted JSON. When it parses but carries openspec's
 * failure envelope while the raw exit code was 0, the returned result's
 * `exitCode` is normalized to 1 so cospec's own exit-code contract holds;
 * this never throws past a well-formed openspec-reported failure — the
 * failure body IS the one JSON document, which is the point. With
 * `textFailure`, a failed call (non-zero exit) that printed nothing on stdout
 * is relayed as it is: that is the binary's own answer, not a violation.
 */
export function enforcePassthroughJson(
  label: string,
  result: OpenspecResult,
  textFailure = false,
): OpenspecResult {
  // A command whose upstream action renders every failure as text (see
  // `PassthroughOptions.textFailure`) answers a failure with stderr only.
  if (textFailure && result.exitCode !== 0 && result.stdout === '') return result
  let body: unknown
  try {
    body = JSON.parse(result.stdout)
  } catch {
    throw new OpenspecCallError(
      `${label} did not emit a single parseable JSON document on stdout`,
      result,
    )
  }
  if (result.exitCode === 0 && isOpenspecErrorStatus(body)) return { ...result, exitCode: 1 }
  return result
}

export interface PassthroughOptions {
  /** Absolute path the wrapped binary runs in (the target repo root). */
  cwd: string
  /**
   * Declared expectations. `exitCodes` defaults to `[0, 1]` — unlike
   * `runOpenspec`'s gate-call default of `[0]`, a read-only passthrough
   * routinely exits 1 for an ordinary negative result (unknown item,
   * validation failure) that is not a wrapped-call violation, only a result
   * to relay verbatim. `denyStdout`/`postCondition` still apply.
   */
  expect?: RunExpectation
  /**
   * The wrapped command's upstream action renders its failures as text even
   * under `--json` (`templates`: `failWithError(error)` with no JSON option),
   * so a failed call with nothing on stdout is its answer, relayed as it is.
   * A success still owes one JSON document, and a failure that printed
   * anything on stdout must still parse as one.
   */
  textFailure?: boolean
}

/**
 * A wrapped call's argv: the command path (`['store', 'setup']`, `['show']`),
 * then the flags cospec threads onto it (`--json`, `--no-color`, `--store
 * <id>`), then the user's own argv (`args`). Threaded flags must precede every
 * user token: commander gives a required-value option the next token whatever
 * it looks like, so a flag appended after a user's dangling `--path` would
 * become its value and the binary would run (`store setup s1 --path --json`
 * sets a store up at `./--json`), and after a user's `--` it would be an
 * operand. Right after the full command path — never between a command and
 * its subcommand, where the leaf's own option would be unknown to the parent.
 */
export function threadedArgv(
  command: readonly string[],
  threaded: readonly string[],
  args: readonly string[] = [],
): string[] {
  return [...command, ...threaded, ...args]
}

/** One passthrough call, in the three parts `threadedArgv` joins. */
export interface WrappedCall {
  /** The command path: `['show']`, `['store', 'setup']`. */
  readonly command: readonly string[]
  /** Flags cospec threads onto the call (`--json`, `--no-color`, `--store <id>`). */
  readonly threaded?: readonly string[]
  /** The user's own argv (or cospec's operands), after the threaded flags. */
  readonly args?: readonly string[]
}

/**
 * Exact stderr lines cospec already printed itself (the ignored-pointer warning
 * and the store banner `resolveRoot` writes). A wrapped call spawned in the
 * same directory re-derives the same root and prints the same line again, so
 * `passthroughOpenspec` drops each registered line from the stderr it returns.
 */
const suppressedStderrLines = new Set<string>()

/** Register a line (without its newline) to drop from relayed wrapped stderr. */
export function suppressRelayedStderrLine(line: string): void {
  suppressedStderrLines.add(line)
}

/** Drop every whole line registered with `suppressRelayedStderrLine` (pure on the set). */
export function stripSuppressedStderr(stderr: string): string {
  if (suppressedStderrLines.size === 0 || stderr.length === 0) return stderr
  return stderr
    .split(/(?<=\n)/u)
    .filter((line) => !suppressedStderrLines.has(line.replace(/\r?\n$/u, '')))
    .join('')
}

/**
 * The disciplined passthrough front door (DESIGN §1, WI-1). Version-asserted
 * spawn via `runOpenspec` (which itself spawns through `spawnOpenspec`) of
 * `threadedArgv(call…)`, enforcing the declared `RunExpectation` — and, when
 * cospec threaded `--json`, the one-JSON-doc-on-failure invariant via
 * `enforcePassthroughJson`. A `--json` among the user's own `args` is theirs
 * (possibly another flag's value) and holds the call to nothing. Returns the
 * (possibly exit-code-normalized) `OpenspecResult`; throws `OpenspecCallError`
 * on a deny-list hit, a disallowed exit code, or (in `--json` mode)
 * unparseable stdout. Lines `resolveRoot` already printed are dropped from
 * the returned stderr.
 */
export async function passthroughOpenspec(
  call: WrappedCall,
  opts: PassthroughOptions,
): Promise<OpenspecResult> {
  const argv = threadedArgv(call.command, call.threaded ?? [], call.args)
  const expect: RunExpectation = { exitCodes: [0, 1], ...opts.expect }
  const raw = await runOpenspec(argv, { cwd: opts.cwd, expect })
  const result = { ...raw, stderr: stripSuppressedStderr(raw.stderr) }
  if (call.threaded?.includes('--json') !== true) return result
  return enforcePassthroughJson(wrappedCallLabel(argv), result, opts.textFailure === true)
}
