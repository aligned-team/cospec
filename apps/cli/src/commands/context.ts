// `cospec context` (WI-3) — a disciplined passthrough of `openspec context`,
// the cross-repo working-set brief. Read-only: cospec adds no gate of its
// own, only wrapped-call discipline (declared exit codes, the one-JSON-doc
// invariant on `--json`) and one observable post-condition of its own — when
// `--code-workspace <path>` is requested and the wrapped call exits 0, the
// file must actually exist on disk afterward (never trust the exit code
// alone, per DESIGN §1).
//
// The binary's reference block names bare `openspec` commands (`Fetch:` and
// `Fix:` lines, `members[].fetch`, `…status[].fix`). cospec spells them
// through cospec from the structure, never the text (design D4, D6): every
// call is `context --json`, the command-bearing fields of its document are
// respelled where their whole value is one of the binary's own remedies
// (`respellCommandFields`), and the human listing is rendered from the
// rewritten document as the binary renders its own. A failed answer is
// relayed with its remedies spelled through cospec (`relayRespelled`).

import { existsSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { flagValue, hasFlag } from '../core/command-table.ts'
import { relayRespelled } from '../core/forward-relay.ts'
import {
  type OpenspecResult,
  passthroughOpenspec,
  type PostCondition,
  threadedArgv,
  wrappedCallLabel,
} from '../core/openspec.ts'
import {
  type CommandField,
  renderJsonDocument,
  respellCommandFields,
} from '../core/passthrough-command.ts'
import { respellRemedies } from '../core/remedies.ts'
import { type ResolvedRoot, resolveRoot } from '../core/root.ts'

/** `context`'s empty payload in a `--json` root-selection failure, as upstream prints it. */
export const jsonFailurePayload = { root: null, members: [] } as const

/**
 * The command-bearing fields of the binary's working set, each with the
 * remedies its value can be (`core/working-set.js` `fetchRecipe`,
 * `core/references.js`, `core/relationship-health.js`).
 */
export const CONTEXT_FIELDS: readonly CommandField[] = [
  { path: ['members', '[]', 'fetch'], remedies: ['references/fetch'] },
  {
    path: ['members', '[]', 'status', '[]', 'fix'],
    remedies: [
      'references/clone',
      'references/get-checkout',
      'references/store-doctor-id',
      'references/store-doctor',
      'references/list-rest',
    ],
  },
  { path: ['status', '[]', 'fix'], remedies: ['references/store-doctor'] },
]

interface Diagnostic {
  message: string
  fix?: string
}

interface Member {
  role: string
  id: string
  path?: string
  fetch?: string
  status: Diagnostic[]
}

/** The binary's `context --json` document (`assembleWorkingSet`). */
interface WorkingSet {
  root: { path: string; store_id?: string }
  members: Member[]
  status: Diagnostic[]
}

/** A successful answer is one working-set document. */
const workingSetPostCondition: PostCondition = (res) => {
  if (res.exitCode !== 0) return true
  let doc: unknown
  try {
    doc = JSON.parse(res.stdout)
  } catch (err) {
    if (err instanceof SyntaxError) return 'did not emit parseable JSON'
    throw err
  }
  const ws = doc as Partial<WorkingSet> | null
  return (
    (ws !== null &&
      typeof ws.root?.path === 'string' &&
      Array.isArray(ws.members) &&
      Array.isArray(ws.status)) ||
    'did not emit the working set (root, members and status)'
  )
}

export async function run(ctx: CommandContext): Promise<number> {
  const root = await resolveRoot(ctx)
  const parsed = ctx.parsed!
  const codeWorkspace = flagValue(parsed, '--code-workspace')
  const force = hasFlag(parsed, '--force')

  const args: string[] = []
  if (codeWorkspace !== undefined) args.push('--code-workspace', codeWorkspace)
  if (force) args.push('--force')

  // openspec resolves a relative --code-workspace path against its own cwd,
  // which is root.cwd for every wrapped call cospec makes (§ Root contract).
  const workspacePath =
    codeWorkspace === undefined
      ? undefined
      : isAbsolute(codeWorkspace)
        ? codeWorkspace
        : join(root.cwd, codeWorkspace)

  // In `--json` mode the binary writes the workspace file first and then
  // prints the document; the same call answers the text mode too.
  const answer = await call(ctx, root, true, args, workspacePath)
  if (answer.exitCode === 0) {
    const doc = respellCommandFields(JSON.parse(answer.stdout) as WorkingSet, CONTEXT_FIELDS)
    process.stdout.write(ctx.flags.json ? renderJsonDocument(doc) : renderWorkingSet(doc))
    if (answer.stderr.length > 0) process.stderr.write(answer.stderr)
    return EXIT.success
  }
  if (ctx.flags.json) return relayRespelled(answer, true)

  // Text mode prints the listing before it writes, so a refused write still
  // follows the listing: read it with a call that writes nothing, and render
  // the refusal as the binary does (`Error:` and `Fix:` on stderr).
  if (codeWorkspace !== undefined) {
    const listing = await call(ctx, root, true, [], undefined)
    const refusal = lastStatus(answer)
    if (listing.exitCode === 0 && refusal !== undefined) {
      const doc = respellCommandFields(JSON.parse(listing.stdout) as WorkingSet, CONTEXT_FIELDS)
      process.stdout.write(renderWorkingSet(doc))
      if (listing.stderr.length > 0) process.stderr.write(listing.stderr)
      process.stderr.write(respellRemedies(refusalLines(refusal)))
      return EXIT.failure
    }
  }
  // Nothing to render: the binary's own text answer, remedies spelled cospec.
  return relayRespelled(await call(ctx, root, false, args, workspacePath), false)
}

/** One wrapped `context` call on `root`, `--json` or text. */
function call(
  ctx: CommandContext,
  root: ResolvedRoot,
  json: boolean,
  args: string[],
  workspacePath: string | undefined,
): Promise<OpenspecResult> {
  const threaded = [
    ...(json ? ['--json'] : []),
    ...(ctx.flags.noColor ? ['--no-color'] : []),
    ...root.storeArgs,
  ]
  const wrote: PostCondition | undefined =
    workspacePath === undefined
      ? undefined
      : (res) =>
          res.exitCode !== 0 || existsSync(workspacePath)
            ? true
            : `${wrappedCallLabel(threadedArgv(['context'], threaded, args))} reported success but did ` +
              `not write the expected --code-workspace file at ${workspacePath}`
  return passthroughOpenspec(
    { command: ['context'], threaded, args },
    {
      cwd: root.cwd,
      expect: {
        postCondition: (res) => {
          const shape = json ? workingSetPostCondition(res) : true
          return shape !== true ? shape : wrote === undefined ? true : wrote(res)
        },
      },
    },
  )
}

/** The diagnostic a failed `--json` answer ends its `status` with, if it printed one. */
function lastStatus(res: OpenspecResult): Diagnostic | undefined {
  let doc: unknown
  try {
    doc = JSON.parse(res.stdout)
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
  const status = (doc as { status?: unknown } | null)?.status
  if (!Array.isArray(status)) return undefined
  const last = status.at(-1) as Partial<Diagnostic> | undefined
  return typeof last?.message === 'string' ? (last as Diagnostic) : undefined
}

/** A failure as the binary's text mode prints it (`emitFailure`). */
function refusalLines(status: Diagnostic): string {
  return `Error: ${status.message}\n${isSet(status.fix) ? `Fix: ${status.fix}\n` : ''}`
}

const isSet = (value: string | undefined): value is string => value !== undefined && value !== ''

const isAvailable = (member: Member): boolean =>
  member.path !== undefined && member.status.length === 0

/** The binary's human listing of a working set (`printHumanWorkingSet`). */
function renderWorkingSet(ws: WorkingSet): string {
  const label = ws.root.store_id ?? basename(ws.root.path)
  const lines = [
    `Working context for ${label} (${ws.root.path})`,
    '',
    'OpenSpec root',
    `  ${label}  ${ws.root.path}`,
  ]
  const stores = ws.members.filter((m) => m.role === 'referenced_store' && isAvailable(m))
  const unavailable = ws.members.filter((m) => !isAvailable(m))
  if (stores.length > 0) {
    lines.push('', 'Referenced stores')
    for (const member of stores) {
      lines.push(`  ${member.id}  ${member.path}`)
      if (isSet(member.fetch)) lines.push(`    Fetch: ${member.fetch}`)
    }
  }
  if (ws.members.length === 0)
    lines.push(
      '',
      declaredReferenceCount(ws.root.path) > 0
        ? 'Declared references all resolve to this root; the working set is this root alone.'
        : 'No references declared; the working set is this root alone.',
    )
  if (unavailable.length > 0 || ws.status.length > 0) {
    lines.push('', 'Not available on this machine')
    for (const member of unavailable) {
      if (member.status.length === 0) {
        lines.push(`  - ${member.id}`)
        continue
      }
      for (const diagnostic of member.status) {
        lines.push(`  - ${member.id}: ${diagnostic.message}`)
        if (isSet(diagnostic.fix)) lines.push(`    Fix: ${diagnostic.fix}`)
      }
    }
    for (const diagnostic of ws.status) {
      lines.push(`  Note: ${diagnostic.message}`)
      if (isSet(diagnostic.fix)) lines.push(`  Fix: ${diagnostic.fix}`)
    }
  }
  return lines.map((line) => `${line}\n`).join('')
}

/**
 * How many references the root's config declares, as the binary's
 * declaration parser counts them (design D6): its document omits the count,
 * which only chooses the empty set's line. `config.yaml` else `config.yml`;
 * unique ids of string entries and `{id: <string>}` maps; an unreadable or
 * non-object config declares none, as the binary's reader returns none.
 */
function declaredReferenceCount(rootPath: string): number {
  const file = ['config.yaml', 'config.yml']
    .map((name) => join(rootPath, 'openspec', name))
    .find((path) => existsSync(path))
  if (file === undefined) return 0
  let raw: unknown
  try {
    raw = parseYaml(readFileSync(file, 'utf8'))
  } catch {
    // The binary's reader answers an unreadable or unparseable config with none.
    return 0
  }
  if (raw === null || typeof raw !== 'object') return 0
  const refs = (raw as Record<string, unknown>).references
  if (!Array.isArray(refs)) return 0
  const ids = new Set<string>()
  for (const entry of refs) {
    if (typeof entry === 'string') ids.add(entry)
    else if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const id = (entry as Record<string, unknown>).id
      if (typeof id === 'string') ids.add(id)
    }
  }
  return ids.size
}
