// Renders the same three parity YAML files the reachability contract test
// reads (apps/cli/test/contract/reachability.test.ts), so the docs page and
// the test can never describe a different set of exceptions, deprecations or
// pending surfaces. `watch` re-runs `load()` in the VitePress dev server on
// every edit to those files; the production build reads them once.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineLoader } from 'vitepress'
import { parse } from 'yaml'

const here = fileURLToPath(new URL('.', import.meta.url))
const EXCEPTIONS_PATH = `${here}../../cli/src/canon/parity/exceptions.yaml`
const DEPRECATED_PATH = `${here}../../cli/src/canon/parity/deprecated.yaml`
const ALIASES_PATH = `${here}../../cli/src/canon/parity/aliases.yaml`
const PENDING_PATH = `${here}../../cli/test/contract/parity-pending.yaml`

interface RawException {
  readonly upstream: { readonly kind: string; readonly path: readonly string[] }
  readonly reason: string
}

interface RawAlias {
  readonly upstream: {
    readonly kind: 'workflow' | 'tool' | 'tool-alias' | 'command' | 'flag'
    readonly path?: readonly string[]
    readonly flag?: string
    readonly id?: string
  }
  readonly cospec: string
}

interface RawDeprecated {
  readonly upstream: { readonly kind: string; readonly path: readonly string[] }
  readonly mark: 'registry-description' | 'runtime-stderr'
  readonly warning?: string
}

interface RawPending {
  readonly kind: 'command' | 'flag' | 'positional' | 'positional-value' | 'tool' | 'tool-alias'
  readonly path?: readonly string[]
  readonly flag?: string
  readonly index?: number
  readonly value?: string
  readonly id?: string
  readonly target?: string
  readonly owner: string
}

export interface ParityException {
  readonly surface: string
  readonly reason: string
}

export interface ParityDeprecation {
  readonly surface: string
  readonly note: string
}

export interface ParityAlias {
  readonly surface: string
  readonly cospec: string
}

export interface ParityPendingItem {
  readonly surface: string
  readonly owner: string
}

export interface ParityData {
  readonly exceptions: readonly ParityException[]
  readonly deprecated: readonly ParityDeprecation[]
  readonly aliases: readonly ParityAlias[]
  readonly pending: readonly ParityPendingItem[]
}

// An emptied file (or one holding only comments) parses to null: that is an
// empty list, so the page renders without the section rather than failing
// the build.
function readList<T>(path: string): T[] {
  return (parse(readFileSync(path, 'utf-8')) ?? []) as T[]
}

function commandSurface(path: readonly string[]): string {
  return `cospec ${path.join(' ')}`
}

// One label per parity-pending.yaml `kind` — kept in step with the shape
// `apps/cli/src/core/command-table.ts` and reachability.test.ts agree on.
function pendingSurface(entry: RawPending): string {
  const path = entry.path ?? []
  switch (entry.kind) {
    case 'command':
      return commandSurface(path)
    case 'flag':
      return `${commandSurface(path)} ${entry.flag}`
    case 'positional':
      return `${commandSurface(path)} (positional argument ${entry.index})`
    case 'positional-value':
      return `${commandSurface(path)} ${entry.value}`
    case 'tool':
      return `--harness ${entry.id}`
    case 'tool-alias':
      return `--harness ${entry.id} (alias of ${entry.target})`
  }
}

// One label per aliases.yaml `kind` — `path`/`flag` alone would render bare
// for a `workflow` entry (no command path at all), so this mirrors
// `pendingSurface`'s per-kind switch instead of assuming every entry has one.
function aliasSurface(entry: RawAlias): string {
  const path = entry.upstream.path ?? []
  switch (entry.upstream.kind) {
    case 'flag':
      return `${commandSurface(path)} ${entry.upstream.flag}`
    case 'workflow':
      return `openspec's ${entry.upstream.id} workflow`
    case 'command':
    default:
      return commandSurface(path)
  }
}

function aliasCospecSurface(entry: RawAlias): string {
  const path = entry.upstream.path ?? []
  switch (entry.upstream.kind) {
    case 'flag':
      return `${commandSurface(path)} ${entry.cospec}`
    case 'workflow':
    case 'command':
    default:
      return `cospec ${entry.cospec}`
  }
}

export default defineLoader({
  watch: [EXCEPTIONS_PATH, DEPRECATED_PATH, ALIASES_PATH, PENDING_PATH],
  load(): ParityData {
    const exceptions = readList<RawException>(EXCEPTIONS_PATH)
    const deprecated = readList<RawDeprecated>(DEPRECATED_PATH)
    const aliases = readList<RawAlias>(ALIASES_PATH)
    const pending = readList<RawPending>(PENDING_PATH)

    return {
      exceptions: exceptions.map((entry) => ({
        surface: commandSurface(entry.upstream.path),
        reason: entry.reason.trim(),
      })),
      deprecated: deprecated.map((entry) => ({
        surface: commandSurface(entry.upstream.path),
        note:
          entry.mark === 'registry-description'
            ? "flagged deprecated in OpenSpec's own command registry"
            : (entry.warning ?? '').trim(),
      })),
      aliases: aliases.map((entry) => ({
        surface: aliasSurface(entry),
        cospec: aliasCospecSurface(entry),
      })),
      pending: pending.map((entry) => ({
        surface: pendingSurface(entry),
        owner: entry.owner,
      })),
    }
  },
})

// Needed for type support of `import { data } from './parity.data.ts'`.
export declare const data: ParityData
