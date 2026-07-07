// The compiled cospec binary embeds a self-contained, single-file bundle of the
// pinned `@fission-ai/openspec` CLI (built by `mise run vendor:openspec`). This
// module extracts that embedded bundle to a content-addressed cache dir and
// returns a runnable path, so a standalone install (mise / GitHub release — no
// node_modules, no bun, no npm) can still run every wrapped openspec call via
// the binary's own bun runtime (`process.execPath` + BUN_BE_BUN=1).
//
// The bundle is imported with `{ type: 'file' }` so `bun build --compile`
// embeds it into $bunfs (the established canon-embed pattern); `readFileSync`
// on the returned path works in both compiled and `bun run` modes.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import openspecBundlePath from '../vendor/openspec.bundle.js.tpl' with { type: 'file' }

/** Root of the extraction cache (`${XDG_CACHE_HOME:-~/.cache}/cospec`). */
function cacheRoot(): string {
  const xdg = process.env.XDG_CACHE_HOME
  const base = xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), '.cache')
  return join(base, 'cospec')
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

let extracted: string | undefined

/**
 * Extract the embedded openspec bundle into `root` (the cache root) for
 * `version` and return the path to the runnable bundle file. Content-addressed
 * and self-healing; not memoized (the process-level cache lives in
 * `extractEmbeddedOpenspec`), so it is safe to call repeatedly — the primitive
 * the unit tests exercise directly.
 *
 * Layout (deliberate — satisfies the bundle's runtime relative reads):
 *   <root>/openspec-<version>-<hash>/package.json           synthesized manifest
 *   <root>/openspec-<version>-<hash>/vendor/bin/openspec.js  the bundle
 * The bundle reads `../../package.json` (relative to its own file) at load time
 * for the openspec version; from `vendor/bin/` that resolves to the synthesized
 * manifest carrying the pin. openspec's built-in `schemas/` are NOT needed: a
 * cospec-managed project always has project-local `openspec/schemas/`, which
 * wins openspec's resolution order.
 *
 * The cache dir is keyed on the embedded bundle's content hash, not the openspec
 * version alone: a re-vendored bundle at the SAME pinned version (a bun-toolchain
 * bump, a bundled transitive-dep patch) lands in a fresh dir instead of silently
 * reusing a byte-length-equal stale copy, and on-disk corruption that preserves
 * length is caught by re-hashing the extracted file. The manifest is written
 * (and repaired) independently of the bundle, so a bin-good/manifest-missing
 * cache from an interrupted first run self-heals instead of handing back a path
 * whose sibling manifest is absent (which crashes the spawned openspec with
 * "Cannot find module ../../package.json").
 *
 * Post-condition: the extracted bundle exists at the expected path and its
 * content hash equals the embedded bundle's; otherwise this throws (the
 * wrapped-call observable for the extraction step).
 */
export function extractEmbeddedOpenspecInto(root: string, version: string): string {
  const source = readFileSync(openspecBundlePath)
  const digest = sha256(source)
  const verDir = join(root, `openspec-${version}-${digest.slice(0, 16)}`)
  const binPath = join(verDir, 'vendor', 'bin', 'openspec.js')
  const manifestPath = join(verDir, 'package.json')

  mkdirSync(dirname(binPath), { recursive: true })

  // Write or repair the manifest whenever it is missing or wrong — the bundle's
  // load-time `../../package.json` read must always resolve, even on a warm
  // cache whose bin is present but whose manifest never landed.
  const manifest = `${JSON.stringify({ name: '@fission-ai/openspec', version, type: 'module' })}\n`
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifest) {
    writeFileSync(manifestPath, manifest)
  }

  // Re-hash the on-disk bundle (not just its length): any corruption that
  // changes the bytes — length-preserving or not — fails the check and forces a
  // re-extract.
  const onDisk = existsSync(binPath) ? readFileSync(binPath) : undefined
  if (onDisk === undefined || sha256(onDisk) !== digest) {
    // Atomic publish: write a unique temp then rename into place, so a
    // concurrent cospec never observes a partially-written bundle.
    const tmp = `${binPath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, source)
    renameSync(tmp, binPath)

    const written = existsSync(binPath) ? readFileSync(binPath) : undefined
    if (written === undefined || sha256(written) !== digest) {
      throw new Error(
        `embedded openspec extraction failed: ${binPath} is missing or its content hash ` +
          `does not match the embedded bundle`,
      )
    }
  }

  return binPath
}

/**
 * Extract the embedded openspec bundle for `version` and return the path to the
 * runnable bundle file. Memoized per process over `extractEmbeddedOpenspecInto`.
 */
export function extractEmbeddedOpenspec(version: string): string {
  extracted ??= extractEmbeddedOpenspecInto(cacheRoot(), version)
  return extracted
}
