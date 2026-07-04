import { dirname, join } from 'node:path'

/**
 * The exact bundled openspec version cospec is built and tested against. A
 * mismatch is refused before any wrapped call (DESIGN §1) — the wrapped surface
 * (exit codes, JSON shapes, archive quirks) is a moving target across releases.
 */
export const EXPECTED_OPENSPEC_VERSION = '1.3.1'

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
 */
export function openspecPackageDir(): string {
  cachedPackageDir ??= dirname(
    Bun.resolveSync('@fission-ai/openspec/package.json', import.meta.dir),
  )
  return cachedPackageDir
}

function openspecBin(): string {
  return join(openspecPackageDir(), 'bin', 'openspec.js')
}

/** Raw spawn — no version assertion, no expectation enforcement. */
async function spawnRaw(args: string[], cwd: string): Promise<OpenspecResult> {
  const proc = Bun.spawn(['bun', openspecBin(), '--no-color', ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
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
  if (version !== EXPECTED_OPENSPEC_VERSION)
    throw new Error(
      `wrapped openspec is ${version || '<unknown>'}, expected ${EXPECTED_OPENSPEC_VERSION} — ` +
        'refusing to run (COSPEC_ALLOW_OPENSPEC_DRIFT=1 to override)',
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

// --- Typed JSON shapes for the wrapped commands (probed against 1.3.1). ---

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

async function runJson<T>(cwd: string, args: string[]): Promise<T> {
  const res = await runOpenspec(args, { cwd, expect: { exitCodes: [0] } })
  try {
    return JSON.parse(res.stdout) as T
  } catch {
    throw new OpenspecCallError(`could not parse JSON from: openspec ${args.join(' ')}`, res)
  }
}

/** Typed `openspec status --change <id> --json`. Throws on unknown change. */
export function openspecStatus(cwd: string, changeId: string): Promise<StatusJson> {
  return runJson<StatusJson>(cwd, ['status', '--change', changeId, '--json'])
}

/** Typed `openspec list --json`. Throws when no openspec dir exists. */
export function openspecList(cwd: string): Promise<ListJson> {
  return runJson<ListJson>(cwd, ['list', '--json'])
}

/** Typed `openspec instructions apply --change <id> --json`. */
export function openspecApplyInstructions(
  cwd: string,
  changeId: string,
): Promise<ApplyInstructionsJson> {
  return runJson<ApplyInstructionsJson>(cwd, [
    'instructions',
    'apply',
    '--change',
    changeId,
    '--json',
  ])
}

/** Typed `openspec instructions <artifact> --change <id> --json`. */
export function openspecArtifactInstructions(
  cwd: string,
  artifact: string,
  changeId: string,
): Promise<ArtifactInstructionsJson> {
  return runJson<ArtifactInstructionsJson>(cwd, [
    'instructions',
    artifact,
    '--change',
    changeId,
    '--json',
  ])
}
