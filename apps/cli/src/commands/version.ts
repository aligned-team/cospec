// `cospec version [--check] [--json]` (design decision 2). Native, not a
// passthrough: what it reports is cospec's own install, which only cospec knows.
// The document keeps upstream's `version --json` shape (`schemaVersion`,
// `version`, `install`, and with `--check` `update`) describing cospec, and puts
// the wrapped OpenSpec's facts under a key upstream never uses, `openspec`.
//
// Every install except a source checkout runs the same compiled binary: the npm
// launcher (`bin/cospec.js`) spawns it from the platform package, and mise
// fetches the release archive. So `process.execPath` alone cannot tell them
// apart: the launcher marks its spawn with `COSPEC_NPM_LAUNCHER` (its own path),
// the npm caches and mise are matched by path, and `standalone` is only the
// fallback.
//
// The wrapped OpenSpec is described without spawning it (the package's own
// `package.json`, or the embedded pin), so the report never extracts the
// embedded bundle — the same read-only resolution `cospec doctor` uses.
//
// `--check` makes one GET to the npm registry (`COSPEC_REGISTRY_URL` overrides
// the whole URL, so tests answer from a local fixture), with a 3 s budget. It
// never fails the command: an unreachable registry, a timeout or a malformed
// answer is `offline`, and `COSPEC_NO_UPDATE_CHECK=1` (or a registry override
// that is neither https nor http to this machine) is `disabled`.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import pkg from '../../package.json'
import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { hasFlag } from '../core/command-table.ts'
import {
  OPENSPEC_VERSION_RANGE,
  PINNED_OPENSPEC_VERSION,
  resolveOpenspec,
  satisfiesOpenspecRange,
} from '../core/openspec.ts'

export const PACKAGE_NAME = '@aligned-team/cospec'
export const DEFAULT_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
/** The env marker the npm launcher sets on the binary it spawns: the launcher's own path. */
export const NPM_LAUNCHER_ENV = 'COSPEC_NPM_LAUNCHER'
const CHECK_TIMEOUT_MS = 3000

export type InstallType = 'npm-global' | 'npx' | 'bunx' | 'standalone' | 'mise' | 'source'

/**
 * Upstream's `install` object (`location`, `packageManager`, `scope`, with
 * upstream's scope vocabulary) describing cospec, plus cospec's `type`.
 */
export interface InstallInfo {
  location: string | null
  packageManager: 'npm' | 'bun' | null
  scope: 'global' | 'temporary' | 'standalone' | 'source' | null
  type: InstallType
}

export interface InstallProbe {
  /** Whether this process is the compiled binary (its modules live in Bun's `$bunfs`). */
  compiled: boolean
  /** `process.execPath`. */
  execPath: string
  /** The npm launcher's path from `COSPEC_NPM_LAUNCHER`, when it spawned this process. */
  launcher?: string
  /** The source checkout's package directory (`apps/cli`), for a source run. */
  sourceDir: string
}

const slashed = (path: string): string => path.replaceAll('\\', '/')
const isMisePath = (path: string): boolean => /\/mise\/installs\//.test(slashed(path))

/** How cospec was installed (pure; `currentProbe` reads the real process). */
export function detectInstall(probe: InstallProbe): InstallInfo {
  if (!probe.compiled)
    return { location: probe.sourceDir, packageManager: null, scope: 'source', type: 'source' }
  if (probe.launcher !== undefined && probe.launcher.length > 0) {
    const path = slashed(probe.launcher)
    // `<package>/bin/cospec.js` → the package directory.
    const location = dirname(dirname(probe.launcher))
    if (path.includes('/_npx/'))
      return { location, packageManager: 'npm', scope: 'temporary', type: 'npx' }
    if (/\/bunx-|\/\.bun\/install\//.test(path))
      return { location, packageManager: 'bun', scope: 'temporary', type: 'bunx' }
    if (isMisePath(path)) return { location, packageManager: null, scope: null, type: 'mise' }
    return { location, packageManager: 'npm', scope: 'global', type: 'npm-global' }
  }
  const location = dirname(probe.execPath)
  if (isMisePath(probe.execPath))
    return { location, packageManager: null, scope: null, type: 'mise' }
  return { location, packageManager: null, scope: 'standalone', type: 'standalone' }
}

/** Whether a module path is inside a `bun build --compile` binary's virtual filesystem. */
export function isCompiledModulePath(path: string): boolean {
  return path.startsWith('/$bunfs/') || /^[A-Za-z]:[\\/]~BUN[\\/]/.test(path)
}

function currentProbe(env: NodeJS.ProcessEnv = process.env): InstallProbe {
  const launcher = env[NPM_LAUNCHER_ENV]
  return {
    compiled: isCompiledModulePath(import.meta.path),
    execPath: process.execPath,
    ...(launcher !== undefined && launcher.length > 0 ? { launcher } : {}),
    sourceDir: resolve(import.meta.dir, '../..'),
  }
}

/** The install of the running cospec. */
export function currentInstall(env: NodeJS.ProcessEnv = process.env): InstallInfo {
  return detectInstall(currentProbe(env))
}

/** The command that upgrades an install of `type`, or null where there is none to give. */
export function upgradeCommand(type: InstallType): string | null {
  switch (type) {
    case 'npm-global':
      return `npm install -g ${PACKAGE_NAME}@latest`
    case 'npx':
      return `npx ${PACKAGE_NAME}@latest`
    case 'bunx':
      return `bunx ${PACKAGE_NAME}@latest`
    case 'mise':
      return 'mise upgrade'
    case 'standalone':
      return 'cospec install'
    case 'source':
      return null
  }
}

/** The wrapped OpenSpec as cospec resolves it, without spawning it. */
export interface WrappedOpenspecInfo {
  version: string
  /** `package`: a copy resolved from node_modules; `embedded`: the bundle inside cospec. */
  source: 'package' | 'embedded'
  inRange: boolean
  range: string
  /** Set only when `inRange` is false: what to do about it. */
  remedy?: string
}

export function wrappedOpenspecInfo(): WrappedOpenspecInfo {
  const resolved = resolveOpenspec()
  let version = PINNED_OPENSPEC_VERSION
  let source: WrappedOpenspecInfo['source'] = 'embedded'
  if (resolved.source === 'project') {
    source = 'package'
    version = readPackageVersion(resolved.packageDir) ?? 'unknown'
  }
  return describeWrapped(version, source)
}

/** The `openspec` facts for a resolved `version` (pure). */
export function describeWrapped(
  version: string,
  source: WrappedOpenspecInfo['source'],
): WrappedOpenspecInfo {
  const inRange = satisfiesOpenspecRange(version)
  return {
    version,
    source,
    inRange,
    range: OPENSPEC_VERSION_RANGE,
    ...(inRange
      ? {}
      : {
          remedy:
            `the wrapped OpenSpec ${version} is outside ${OPENSPEC_VERSION_RANGE}, so cospec ` +
            `refuses to run it: install a version in range (npm i -D @fission-ai/openspec@${PINNED_OPENSPEC_VERSION}) ` +
            `or remove the project's copy so cospec runs its embedded ${PINNED_OPENSPEC_VERSION}`,
        }),
  }
}

function readPackageVersion(packageDir: string): string | undefined {
  try {
    const raw = readFileSync(join(packageDir, 'package.json'), 'utf8')
    const version = (JSON.parse(raw) as { version?: unknown }).version
    return typeof version === 'string' ? version : undefined
  } catch (error) {
    // A copy whose manifest cannot be read is reported as an unknown version (never in range).
    if ((error as NodeJS.ErrnoException).code !== undefined || error instanceof SyntaxError)
      return undefined
    throw error
  }
}

// --- the update check ------------------------------------------------------------

export type UpdateStatus = 'available' | 'current' | 'disabled' | 'offline'

export interface UpdateCheck {
  status: UpdateStatus
  latest: string | null
}

/**
 * The registry URL to ask, or null when the check is disabled: by
 * `COSPEC_NO_UPDATE_CHECK`, or by an override that is not https (or http to
 * this machine), whose answer anyone on the path could choose.
 */
export function registryUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const off = env.COSPEC_NO_UPDATE_CHECK
  if (off !== undefined && off !== '' && off !== '0') return null
  const override = env.COSPEC_REGISTRY_URL
  if (override === undefined || override === '') return DEFAULT_REGISTRY_URL
  let url: URL
  try {
    url = new URL(override)
  } catch {
    return null
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username !== '' || url.password !== '') return null
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.href
  return null
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Semver precedence of two release versions; a prerelease sorts below its release. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a)
  const pb = SEMVER.exec(b)
  if (pa === null || pb === null) throw new Error(`not a semver version: ${pa === null ? a : b}`)
  for (const i of [1, 2, 3]) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d !== 0) return d
  }
  if (pa[4] === pb[4]) return 0
  if (pa[4] === undefined) return 1
  if (pb[4] === undefined) return -1
  return pa[4] < pb[4] ? -1 : 1
}

/** The registry's answer read as a version, or undefined when it is not one. */
export function latestFromRegistry(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  const version = (body as Record<string, unknown>).version
  return typeof version === 'string' && SEMVER.test(version) ? version : undefined
}

/** Ask the registry for the latest cospec. Never throws. */
export async function checkForUpdate(
  current: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UpdateCheck> {
  const url = registryUrl(env)
  if (url === null) return { status: 'disabled', latest: null }
  let body: unknown
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { accept: 'application/json' },
      redirect: 'follow',
    })
    if (!response.ok) return { status: 'offline', latest: null }
    body = await response.json()
  } catch {
    // Unreachable, refused, timed out, or not JSON: all the same to the user.
    return { status: 'offline', latest: null }
  }
  const latest = latestFromRegistry(body)
  if (latest === undefined) return { status: 'offline', latest: null }
  return { status: compareVersions(latest, current) > 0 ? 'available' : 'current', latest }
}

// --- the report --------------------------------------------------------------------

export interface VersionDocument {
  schemaVersion: 1
  version: string
  install: InstallInfo
  update?: {
    status: UpdateStatus
    latest: string | null
    command: string | null
    /** cospec never upgrades itself (`exceptions.yaml`): always false. */
    canSelfUpgrade: false
  }
  openspec: WrappedOpenspecInfo
}

export function buildDocument(
  version: string,
  install: InstallInfo,
  openspec: WrappedOpenspecInfo,
  update?: UpdateCheck,
): VersionDocument {
  return {
    schemaVersion: 1,
    version,
    install,
    ...(update === undefined
      ? {}
      : {
          update: {
            ...update,
            command: update.status === 'available' ? upgradeCommand(install.type) : null,
            canSelfUpgrade: false as const,
          },
        }),
    openspec,
  }
}

/** The text report, upstream's lines spelled for cospec, plus the wrapped binary. */
export function renderText(doc: VersionDocument): string {
  const lines = [`cospec ${doc.version} (${doc.install.type})`]
  const range = doc.openspec.inRange ? 'in range' : 'OUT OF RANGE'
  lines.push(
    `OpenSpec ${doc.openspec.version} (${doc.openspec.source}, ${range} ${doc.openspec.range})`,
  )
  if (doc.openspec.remedy !== undefined) lines.push(`  ${doc.openspec.remedy}`)
  const update = doc.update
  if (update !== undefined) {
    if (update.status === 'available') {
      lines.push(`Update available: ${update.latest}`)
      if (update.command !== null) lines.push(`  ${update.command}`)
    } else if (update.status === 'current') lines.push('cospec is up to date.')
    else if (update.status === 'disabled') lines.push('Update check disabled.')
    else lines.push('Could not check for updates.')
  }
  return `${lines.join('\n')}\n`
}

export async function run(ctx: CommandContext): Promise<number> {
  const check = hasFlag(ctx.parsed!, '--check')
  const update = check ? await checkForUpdate(pkg.version) : undefined
  const doc = buildDocument(pkg.version, currentInstall(), wrappedOpenspecInfo(), update)
  process.stdout.write(ctx.flags.json ? `${JSON.stringify(doc, null, 2)}\n` : renderText(doc))
  return EXIT.success
}
