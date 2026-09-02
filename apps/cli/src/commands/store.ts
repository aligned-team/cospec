// `cospec store <sub>` (WI-2, DESIGN §1 wrapped-call discipline). First-class
// wrap of `openspec store setup|register|unregister|remove|list|ls|doctor` —
// unlike a bare passthrough, every mutating subcommand asserts its observable
// disk/registry post-condition itself (never the wrapped exit code alone),
// and a successful `setup`/`register` auto-runs `cospec init <root> --harness
// none` so a new or adopted store gets cospec's typed schemas in one command
// (opt out with `--no-cospec-init`). This reverses PR16's "store management
// stays native" split — see the change proposal.
//
// Every wrapped call appends `--json` itself, regardless of the caller's own
// `--json` flag, because the mutation/cleanup/list/doctor renderers below need
// the structured body either way; `ctx.flags.json` only selects which
// rendering (JSON passthrough vs. an ID/Location table) this command prints.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import {
  openspecStoreList,
  passthroughOpenspec,
  type OpenspecResult,
  type OpenspecStatusEntry,
  type PostCondition,
} from '../core/openspec.ts'
import { run as runInit } from './init.ts'

const SUBCOMMANDS = ['setup', 'register', 'unregister', 'remove', 'list', 'ls', 'doctor'] as const
type Subcommand = (typeof SUBCOMMANDS)[number]

function isSubcommand(value: string | undefined): value is Subcommand {
  return value !== undefined && (SUBCOMMANDS as readonly string[]).includes(value)
}

// --- typed JSON shapes (mirrors openspec's commands/store.js output
// builders — toStoreOutput/toMutationOutput/toCleanupOutput/toListOutput/
// toDoctorOutput) --------------------------------------------------------

interface StoreEntry {
  id: string
  root: string
  metadata_path?: string
}

interface MutationPayload {
  store: StoreEntry | null
  registry: { path: string; registered: boolean; already_registered: boolean } | null
  git: { is_repository: boolean; initialized: boolean; committed: boolean } | null
  created_files: string[]
  status: OpenspecStatusEntry[]
}

interface CleanupPayload {
  store: StoreEntry | null
  registry: { path: string; removed: boolean } | null
  files: { deleted: boolean; deleted_path: string | null; left_on_disk: string | null } | null
  status: OpenspecStatusEntry[]
}

interface ListPayload {
  stores: StoreEntry[]
  status: OpenspecStatusEntry[]
}

interface DoctorStoreEntry extends StoreEntry {
  openspec_root: { healthy: boolean; present: boolean | null; status: OpenspecStatusEntry[] }
  metadata: { valid: boolean; present: boolean | null; remote?: string }
  git: {
    is_repository: boolean | null
    has_commits: boolean | null
    has_uncommitted_changes: boolean | null
    has_remote: boolean | null
    origin_url?: string
  }
  status: OpenspecStatusEntry[]
}

interface DoctorPayload {
  stores: DoctorStoreEntry[]
  status: OpenspecStatusEntry[]
}

interface CospecInitSummary {
  ran: boolean
  target: string
  harnesses: string[]
}

// --- arg plumbing ------------------------------------------------------

/** Remove every occurrence of `flag` (a bare boolean flag), reporting whether it was present. */
function stripFlag(args: string[], flag: string): { rest: string[]; present: boolean } {
  let present = false
  const rest: string[] = []
  for (const tok of args) {
    if (tok === flag) {
      present = true
      continue
    }
    rest.push(tok)
  }
  return { rest, present }
}

/** Append a canonical trailing `--json` — every wrapped store call parses JSON internally. */
function withJson(args: string[]): string[] {
  return [...args, '--json']
}

// --- stdout capture for the auto cospec-init sub-step -------------------

interface Writer {
  write: (chunk: string) => boolean
}

/** Run `fn` with `process.stdout.write` buffered instead of flushed, returning both. */
function captureStdout(fn: () => number): { output: string; code: number } {
  const stream = process.stdout as unknown as Writer
  const original = stream.write.bind(stream)
  let buf = ''
  stream.write = (chunk: string): boolean => {
    buf += chunk
    return true
  }
  try {
    const code = fn()
    return { output: buf, code }
  } finally {
    stream.write = original
  }
}

/**
 * The value-add over a bare `openspec store setup|register` passthrough:
 * stamp the resolved store root with cospec's typed schemas, same as a fresh
 * local repo (`cospec init <root> --harness none`). Runs `init` in-process
 * (not a second wrapped call — it is cospec's own command) and swallows its
 * receipt, folding a summary into this command's own output instead.
 */
function autoCospecInit(root: string): CospecInitSummary {
  const initCtx: CommandContext = {
    args: [root, '--harness', 'none'],
    flags: { json: true, noColor: false, cwd: process.cwd() },
    cwd: process.cwd(),
  }
  const { output } = captureStdout(() => runInit(initCtx))
  let harnesses: string[] = []
  try {
    const parsed = JSON.parse(output) as { harnesses?: unknown }
    if (Array.isArray(parsed.harnesses))
      harnesses = parsed.harnesses.filter((h) => typeof h === 'string')
  } catch {
    // init always emits parseable JSON under --json (its own contract); an
    // unparseable capture means nothing was written, so report no harnesses
    // rather than throw past a successful store setup.
  }
  return { ran: true, target: root, harnesses }
}

// --- post-conditions: assert disk/registry state, never the exit code alone

function mutationPostCondition(): PostCondition {
  return (result) => {
    if (result.exitCode !== 0) return true // failure is relayed verbatim, nothing to assert
    let payload: MutationPayload
    try {
      payload = JSON.parse(result.stdout) as MutationPayload
    } catch {
      return 'did not emit parseable JSON'
    }
    if (payload.store === null) return true
    if (!existsSync(payload.store.root))
      return `reported success but store root ${payload.store.root} does not exist on disk`
    if (!existsSync(join(payload.store.root, 'openspec')))
      return `reported success but ${payload.store.root}/openspec is missing`
    return true
  }
}

function cleanupPostCondition(cwd: string, expectFilesDeleted: boolean): PostCondition {
  return async (result) => {
    if (result.exitCode !== 0) return true
    let payload: CleanupPayload
    try {
      payload = JSON.parse(result.stdout) as CleanupPayload
    } catch {
      return 'did not emit parseable JSON'
    }
    if (payload.store === null) return true
    if (
      expectFilesDeleted &&
      payload.files?.deleted_path !== null &&
      payload.files?.deleted_path !== undefined
    ) {
      if (existsSync(payload.files.deleted_path))
        return `reported the store folder deleted but ${payload.files.deleted_path} still exists on disk`
    }
    const { stores } = await openspecStoreList(cwd)
    if (stores.some((s) => s.id === payload.store!.id))
      return `reported success but '${payload.store!.id}' is still in the store registry`
    return true
  }
}

const listPostCondition: PostCondition = (result) => {
  if (result.exitCode !== 0) return true
  try {
    const payload = JSON.parse(result.stdout) as ListPayload
    if (!Array.isArray(payload.stores)) return 'did not emit a stores[] array'
  } catch {
    return 'did not emit parseable JSON'
  }
  return true
}

const doctorPostCondition: PostCondition = (result) => {
  if (result.exitCode !== 0) return true
  try {
    const payload = JSON.parse(result.stdout) as DoctorPayload
    if (!Array.isArray(payload.stores)) return 'did not emit a stores[] array'
  } catch {
    return 'did not emit parseable JSON'
  }
  return true
}

// --- rendering -----------------------------------------------------------

function printStatusLines(status: OpenspecStatusEntry[], write: (s: string) => void): void {
  for (const s of status) {
    write(`${s.severity === 'error' ? 'Issue' : 'Note'}: ${s.message}\n`)
    if (s.fix) write(`  Fix: ${s.fix}\n`)
  }
}

function printMutation(
  ctx: CommandContext,
  title: string,
  payload: MutationPayload,
  init: CospecInitSummary | undefined,
): void {
  if (ctx.flags.json) {
    process.stdout.write(`${JSON.stringify({ ...payload, cospecInit: init ?? null }, null, 2)}\n`)
    return
  }
  const store = payload.store!
  const registry = payload.registry!
  process.stdout.write(`${title}: ${store.id}\n`)
  process.stdout.write(`Location: ${store.root}\n`)
  process.stdout.write(
    `Registry: ${registry.already_registered ? 'already registered' : 'registered'}\n`,
  )
  printStatusLines(payload.status, (s) => process.stdout.write(s))
  if (init === undefined) {
    process.stdout.write('cospec-init: skipped (--no-cospec-init)\n')
  } else if (init.harnesses.length > 0) {
    process.stdout.write(
      `cospec-init: schemas + harness(${init.harnesses.join(',')}) written to ${init.target}\n`,
    )
  } else {
    process.stdout.write(`cospec-init: schemas written to ${init.target}\n`)
  }
}

function printCleanup(ctx: CommandContext, title: string, payload: CleanupPayload): void {
  if (ctx.flags.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }
  const store = payload.store!
  const files = payload.files!
  process.stdout.write(`${title}: ${store.id}\n`)
  if (files.deleted_path !== null) process.stdout.write(`Deleted: ${files.deleted_path}\n`)
  else if (files.left_on_disk !== null)
    process.stdout.write(`Files kept at: ${files.left_on_disk}\n`)
  else if (!files.deleted) process.stdout.write(`Files were already missing: ${store.root}\n`)
  printStatusLines(payload.status, (s) => process.stdout.write(s))
}

/** Print the failure envelope (openspec's `status:[...]` diagnostic array). */
function printFailure(ctx: CommandContext, payload: { status: OpenspecStatusEntry[] }): number {
  if (ctx.flags.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return EXIT.failure
  }
  if (payload.status.length === 0) process.stderr.write('cospec store: failed with no diagnostic\n')
  printStatusLines(payload.status, (s) => process.stderr.write(s))
  return EXIT.failure
}

/** A wrapped-call violation (deny-list, disallowed exit code, bad post-condition) — a cospec bug, not a user error. */
function printCallError(ctx: CommandContext, err: unknown): number {
  const message = err instanceof Error ? err.message : String(err)
  if (ctx.flags.json) {
    process.stdout.write(
      `${JSON.stringify({ status: [{ severity: 'error', code: 'cospec_store_wrapped_call', message }] }, null, 2)}\n`,
    )
  } else {
    process.stderr.write(`cospec store: ${message}\n`)
  }
  return EXIT.failure
}

// --- subcommands -----------------------------------------------------------

async function runSetupOrRegister(
  ctx: CommandContext,
  sub: 'setup' | 'register',
  rawArgs: string[],
): Promise<number> {
  const { rest, present: noCospecInit } = stripFlag(rawArgs, '--no-cospec-init')
  let result: OpenspecResult
  try {
    result = await passthroughOpenspec(withJson(['store', sub, ...rest]), {
      cwd: ctx.cwd,
      expect: { postCondition: mutationPostCondition() },
    })
  } catch (err) {
    return printCallError(ctx, err)
  }
  const payload = JSON.parse(result.stdout) as MutationPayload
  if (result.exitCode !== 0) return printFailure(ctx, payload)

  const init = noCospecInit ? undefined : autoCospecInit(payload.store!.root)
  printMutation(ctx, sub === 'setup' ? 'Store ready' : 'Store registered', payload, init)
  return EXIT.success
}

async function runCleanup(
  ctx: CommandContext,
  sub: 'unregister' | 'remove',
  rawArgs: string[],
): Promise<number> {
  let result: OpenspecResult
  try {
    result = await passthroughOpenspec(withJson(['store', sub, ...rawArgs]), {
      cwd: ctx.cwd,
      expect: { postCondition: cleanupPostCondition(ctx.cwd, sub === 'remove') },
    })
  } catch (err) {
    return printCallError(ctx, err)
  }
  const payload = JSON.parse(result.stdout) as CleanupPayload
  if (result.exitCode !== 0) return printFailure(ctx, payload)
  printCleanup(ctx, sub === 'remove' ? 'Removed store' : 'Unregistered store', payload)
  return EXIT.success
}

async function runList(ctx: CommandContext, rawArgs: string[]): Promise<number> {
  let result: OpenspecResult
  try {
    result = await passthroughOpenspec(withJson(['store', 'list', ...rawArgs]), {
      cwd: ctx.cwd,
      expect: { postCondition: listPostCondition },
    })
  } catch (err) {
    return printCallError(ctx, err)
  }
  const payload = JSON.parse(result.stdout) as ListPayload
  if (ctx.flags.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return result.exitCode === 0 ? EXIT.success : EXIT.failure
  }
  if (result.exitCode !== 0) return printFailure(ctx, payload)
  if (payload.stores.length === 0) {
    process.stdout.write('No stores registered.\n')
    return EXIT.success
  }
  const idWidth = Math.max(...payload.stores.map((s) => s.id.length), 2)
  const lines = [`${'ID'.padEnd(idWidth)}  Location`]
  for (const s of payload.stores) lines.push(`${s.id.padEnd(idWidth)}  ${s.root}`)
  process.stdout.write(`${lines.join('\n')}\n`)
  return EXIT.success
}

async function runDoctor(ctx: CommandContext, rawArgs: string[]): Promise<number> {
  let result: OpenspecResult
  try {
    result = await passthroughOpenspec(withJson(['store', 'doctor', ...rawArgs]), {
      cwd: ctx.cwd,
      expect: { postCondition: doctorPostCondition },
    })
  } catch (err) {
    return printCallError(ctx, err)
  }
  const payload = JSON.parse(result.stdout) as DoctorPayload
  if (ctx.flags.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return result.exitCode === 0 ? EXIT.success : EXIT.failure
  }
  if (result.exitCode !== 0) return printFailure(ctx, payload)
  if (payload.stores.length === 0) {
    process.stdout.write('No stores registered.\n')
    return EXIT.success
  }
  const lines: string[] = ['Store doctor']
  for (const store of payload.stores) {
    lines.push('')
    lines.push(store.id)
    lines.push(`  Location: ${store.root}`)
    lines.push(`  OpenSpec root: ${store.openspec_root.healthy ? 'ok' : 'incomplete'}`)
    lines.push(`  Metadata: ${store.metadata.valid ? 'ok' : 'missing/invalid'}`)
    if (store.status.length === 0) {
      lines.push('  Issues: none')
      continue
    }
    lines.push('  Issues:')
    for (const s of store.status) {
      lines.push(`    - ${s.message}`)
      if (s.fix) lines.push(`      Fix: ${s.fix}`)
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`)
  return EXIT.success
}

// --- entrypoint --------------------------------------------------------

export async function run(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.args
  if (!isSubcommand(sub)) {
    process.stderr.write(
      `cospec store: unknown subcommand '${sub ?? ''}'. Subcommands: ${SUBCOMMANDS.join(', ')}\n`,
    )
    return EXIT.failure
  }
  switch (sub) {
    case 'setup':
      return runSetupOrRegister(ctx, 'setup', rest)
    case 'register':
      return runSetupOrRegister(ctx, 'register', rest)
    case 'unregister':
      return runCleanup(ctx, 'unregister', rest)
    case 'remove':
      return runCleanup(ctx, 'remove', rest)
    case 'list':
    case 'ls':
      return runList(ctx, rest)
    case 'doctor':
      return runDoctor(ctx, rest)
  }
}
