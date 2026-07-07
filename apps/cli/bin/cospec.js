#!/usr/bin/env node
// Runtime-agnostic launcher for the `cospec` bin.
//
// The npm package ships NO runtime source: `@aligned-team/cospec` is a thin
// launcher plus seven `optionalDependencies`, one per platform
// (`@aligned-team/cospec-<platform>`), each carrying a single standalone
// `bun build --compile` executable. npm/pnpm/bun install only the platform
// package whose `os`/`cpu`/`libc` match the host, so exactly one binary lands
// on disk. Linux ships separate `-gnu` (glibc) and `-musl` packages — verified
// empirically (bun 1.3.14): the glibc build fails on Alpine and the musl build
// fails on Debian/Ubuntu, so one Linux binary cannot cover both (the
// oxlint/swc pattern, not the "static musl" one).
//
// This file must run on stock Node >=18, Deno (node-compat), and Bun with NO
// dependencies and NO bundler — it is published verbatim. It resolves the
// installed platform binary, runs it with argv passthrough and inherited
// stdio, and propagates the child's exit code and terminating signal.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * True on musl-libc Linux (Alpine et al). `process.report` is the standard
 * runtime probe (used by rollup/swc launchers): glibc reports
 * `glibcVersionRuntime`; musl does not. Fail toward glibc — the mainstream
 * case — when the report API is unavailable (e.g. some Deno versions).
 */
function isMusl() {
  try {
    const report = process.report?.getReport()
    if (report && typeof report === 'object') {
      return !report.header?.glibcVersionRuntime
    }
  } catch {
    // fall through to the glibc default
  }
  return false
}

/** The platform package for this host. Keep in lockstep with the release matrix. */
function platformPackage() {
  const { platform, arch } = process
  if (platform === 'linux' && (arch === 'x64' || arch === 'arm64')) {
    return `@aligned-team/cospec-linux-${arch}-${isMusl() ? 'musl' : 'gnu'}`
  }
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
    return `@aligned-team/cospec-darwin-${arch}`
  }
  if (platform === 'win32' && arch === 'x64') {
    return '@aligned-team/cospec-win32-x64'
  }
  return undefined
}

const SUPPORTED =
  'linux-x64-gnu, linux-x64-musl, linux-arm64-gnu, linux-arm64-musl, ' +
  'darwin-x64, darwin-arm64, win32-x64'

function resolveBinary() {
  const pkg = platformPackage()
  if (pkg === undefined) {
    throw new Error(
      `cospec: unsupported platform '${process.platform} ${process.arch}'. ` +
        `Supported platforms: ${SUPPORTED}.`,
    )
  }
  const binName = process.platform === 'win32' ? 'cospec.exe' : 'cospec'
  try {
    // No "exports" field on the platform package, so this resolves straight to
    // the file on disk (require.resolve returns an exact-match file as-is).
    return require.resolve(`${pkg}/bin/${binName}`)
  } catch {
    throw new Error(
      `cospec: the platform package '${pkg}' for '${process.platform} ${process.arch}' is not ` +
        'installed. It is an optional dependency and should install automatically; if your ' +
        'install skipped optional dependencies, reinstall with them enabled ' +
        '(e.g. `npm install --include=optional`).',
    )
  }
}

let binary
try {
  binary = resolveBinary()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' })

if (result.error !== undefined && result.error !== null) {
  process.stderr.write(`cospec: failed to launch ${binary}: ${result.error.message}\n`)
  process.exit(1)
}

// A child killed by a signal reports status === null + signal set. Re-raise the
// same signal on ourselves so the parent shell sees the real cause of death.
if (result.signal !== null && result.signal !== undefined) {
  process.kill(process.pid, result.signal)
}

process.exit(result.status === null ? 1 : result.status)
