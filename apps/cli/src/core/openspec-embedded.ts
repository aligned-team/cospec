// The compiled cospec binary embeds a self-contained, single-file bundle of the
// pinned `@fission-ai/openspec` CLI (built by `mise run vendor:openspec`). This
// module extracts that embedded bundle to a per-version cache dir and returns a
// runnable path, so a standalone install (mise / GitHub release — no
// node_modules, no bun, no npm) can still run every wrapped openspec call via
// the binary's own bun runtime (`process.execPath` + BUN_BE_BUN=1).
//
// The bundle is imported with `{ type: 'file' }` so `bun build --compile`
// embeds it into $bunfs (the established canon-embed pattern); `readFileSync`
// on the returned path works in both compiled and `bun run` modes.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import openspecBundlePath from '../vendor/openspec.bundle.js.tpl' with { type: 'file' }

/** Root of the per-version extraction cache (`${XDG_CACHE_HOME:-~/.cache}/cospec`). */
function cacheRoot(): string {
  const xdg = process.env.XDG_CACHE_HOME
  const base = xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), '.cache')
  return join(base, 'cospec')
}

let extracted: string | undefined

/**
 * Extract the embedded openspec bundle for `version` and return the path to the
 * runnable bundle file. Write-once and memoized per process.
 *
 * Layout (deliberate — satisfies the bundle's runtime relative reads):
 *   <cache>/openspec-<version>/package.json          synthesized {name,version}
 *   <cache>/openspec-<version>/vendor/bin/openspec.js the bundle
 * The bundle reads `../../package.json` (relative to its own file) at load time
 * for the openspec version; from `vendor/bin/` that resolves to the synthesized
 * manifest carrying the pin. openspec's built-in `schemas/` are NOT needed: a
 * cospec-managed project always has project-local `openspec/schemas/`, which
 * wins openspec's resolution order.
 *
 * Post-condition: the published bundle file exists at the expected path with the
 * embedded byte length; otherwise this throws (the wrapped-call observable for
 * the extraction step).
 */
export function extractEmbeddedOpenspec(version: string): string {
  if (extracted !== undefined) return extracted

  const source = readFileSync(openspecBundlePath)
  const verDir = join(cacheRoot(), `openspec-${version}`)
  const binPath = join(verDir, 'vendor', 'bin', 'openspec.js')
  const manifestPath = join(verDir, 'package.json')

  const alreadyGood = existsSync(binPath) && statSync(binPath).size === source.length
  if (!alreadyGood) {
    mkdirSync(dirname(binPath), { recursive: true })
    if (!existsSync(manifestPath)) {
      writeFileSync(
        manifestPath,
        `${JSON.stringify({ name: '@fission-ai/openspec', version, type: 'module' })}\n`,
      )
    }
    // Atomic publish: write a unique temp then rename into place, so a
    // concurrent cospec never observes a partially-written bundle.
    const tmp = `${binPath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, source)
    renameSync(tmp, binPath)
  }

  if (!existsSync(binPath) || statSync(binPath).size !== source.length) {
    throw new Error(
      `embedded openspec extraction failed: ${binPath} is missing or the wrong size ` +
        `(expected ${source.length} bytes)`,
    )
  }

  extracted = binPath
  return binPath
}
