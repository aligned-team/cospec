// `cospec new <type> <slug>` — create a typed change (DESIGN §2.4). Accepts
// either the two-arg form or a single `"<type>: <free text>"` string (slug
// derived from the text). Validates the type against the 11 cospec types and
// the slug against the kebab grammar plus active/archived collision, then
// delegates to `openspec new change` and verifies the written `.openspec.yaml`
// rather than trusting the exit code. Never pre-scaffolds artifact files
// (openspec marks artifacts done on file existence).

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'

import { parse as parseYaml, stringify as stringifyYaml, YAMLError } from 'yaml'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import {
  CHANGE_ID_RE,
  changesDir,
  isCospecType,
  openspecDir,
  readArchiveIndex,
  readOpenspecYaml,
  resolveChange,
  resolveSchema,
} from '../core/change.ts'
import { flagValue, hasFlag, type ParsedArgs } from '../core/command-table.ts'
import type { OpenspecResult } from '../core/openspec.ts'
import { OpenspecCallError, runOpenspec, threadedArgv } from '../core/openspec.ts'
import { respellRemedies } from '../core/remedies.ts'
import { resolveRoot } from '../core/root.ts'
import { COSPEC_TYPES, getTypeInfo } from '../core/schema-compose.ts'
import { closest } from './apply.ts'

/** The schemaVersion `cospec new` stamps into every newly created change (DESIGN §5). */
export const NEW_SCHEMA_VERSION = 2

/** Stamp `schemaVersion: 2` into a freshly created change's `.openspec.yaml`,
 * preserving the `schema:`/`created:` fields openspec already wrote. */
function stampSchemaVersion(changeDir: string): void {
  const path = join(changeDir, '.openspec.yaml')
  const doc = (parseYaml(readFileSync(path, 'utf8')) ?? {}) as Record<string, unknown>
  doc.schemaVersion = NEW_SCHEMA_VERSION
  writeFileSync(path, stringifyYaml(doc, { lineWidth: 0 }))
}

// A change slug is exactly a change id — one canonical kebab grammar (change.ts).
const SLUG_RE = CHANGE_ID_RE

/** Derive a kebab-case slug from free text; undefined when nothing usable remains. */
export function slugify(text: string): string | undefined {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '') // slug must start with a letter
    .replace(/-+$/, '')
    .replace(/-{2,}/g, '-')
  return SLUG_RE.test(slug) ? slug : undefined
}

function typeTableText(): string {
  const rows = COSPEC_TYPES.map((type) => {
    const info = getTypeInfo(type)!
    return `  ${type.padEnd(9)} ${info.description} (${info.artifactCount} artifacts)`
  })
  return `Valid types:\n${rows.join('\n')}\n`
}

/**
 * One of `new`'s own refusals: `cospec new: <message>` on stderr, or for a
 * `--json` caller one document on stdout in the shape the wrapped
 * `new change --json` gives every failure of its own (unknown schema, existing
 * change, invalid name, unparseable schema), nothing on stderr. A missing type
 * or slug is not one: the table parser refuses it as commander's
 * `missing required argument`, text in both modes.
 */
function refuse(message: string, json: boolean): number {
  if (json) {
    const status = [{ severity: 'error', code: 'change_error', message }]
    process.stdout.write(`${JSON.stringify({ change: null, status }, null, 2)}\n`)
  } else process.stderr.write(`cospec new: ${message}\n`)
  return EXIT.failure
}

function reportUnknownType(type: string, json: boolean): number {
  const suggestion = closest(type, [...COSPEC_TYPES])
  if (json) {
    const hint = suggestion !== undefined ? ` — did you mean '${suggestion}'?` : ''
    return refuse(`unknown type '${type}'${hint} Valid types: ${COSPEC_TYPES.join(', ')}`, true)
  }
  process.stderr.write(`cospec new: unknown type '${type}'\n`)
  if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
  process.stderr.write(typeTableText())
  return EXIT.failure
}

/**
 * The user-level schema directory the wrapped binary reads (its
 * `getUserSchemasDir()`, `<global data dir>/schemas`): `$XDG_DATA_HOME/openspec`
 * when that is set, else `%LOCALAPPDATA%\openspec` on Windows, else
 * `~/.local/share/openspec` — never `~/.config`, which holds only its config.
 */
export function userSchemasDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const xdg = env.XDG_DATA_HOME
  if (xdg !== undefined && xdg.length > 0) return join(xdg, 'openspec', 'schemas')
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA
    return local !== undefined && local.length > 0
      ? join(local, 'openspec', 'schemas')
      : join(home, 'AppData', 'Local', 'openspec', 'schemas')
  }
  return join(home, '.local', 'share', 'openspec', 'schemas')
}

/**
 * Whether the wrapped binary can resolve cospec type `type` from `base`, where
 * it looks before its package built-ins (OpenSpec's own schemas, never a
 * cospec type): the project's `openspec/schemas`, then the user-level
 * directory (`userSchemasDir`). Like the binary, a candidate counts only when
 * its `schema.yaml` resolves inside its directory.
 */
export function cospecSchemaInstalled(
  base: string,
  type: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): boolean {
  return [join(openspecDir(base), 'schemas'), userSchemasDir(env, home)].some((schemas) => {
    const dir = join(schemas, type)
    const file = join(dir, 'schema.yaml')
    if (!existsSync(file)) return false
    const rel = relative(realpathSync(dir), realpathSync(file))
    return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
  })
}

// oxlint-disable-next-line no-control-regex -- matching the ESC that opens an SGR sequence
const ANSI_SGR = /\x1b\[[0-9;]*m/g

/**
 * Where the binary's reason starts quoting the user's own schema
 * (`resolver.js`: `Failed to parse schema at '<path>': <yaml error>`, or
 * `Invalid schema at '<path>': <validation error>`): its path and excerpt,
 * the user's content, which is relayed as is even where it copies one of
 * upstream's sentences.
 */
const SCHEMA_PAYLOAD = /(?:Failed to parse|Invalid) schema at '/

/**
 * `reason` with each of upstream's own sentences it holds spelled through
 * cospec (`respellRemedies`, an allowlist of exact sentences), up to any
 * schema payload; every other byte — a path, a name, a schema's quoted
 * excerpt, prose — relayed verbatim.
 */
function respellReason(reason: string): string {
  const at = reason.search(SCHEMA_PAYLOAD)
  if (at === -1) return respellRemedies(reason)
  return respellRemedies(reason.slice(0, at)) + reason.slice(at)
}

/**
 * Why a failed wrapped `new change --json` refused: the message of its
 * document's first status entry (every failure of its own — an unparseable or
 * unknown schema, an existing change, an invalid name, a failed mkdir —
 * answers with one, after any warning line it logged first),
 * else its stderr without color codes or its `✖ Error:` prefix, with its
 * remedies spelled through cospec (`respellReason`). Undefined when the
 * binary said nothing.
 */
export function wrappedNewReason(result: OpenspecResult): string | undefined {
  let reason: string | undefined
  try {
    // A stat warning line (EACCES, ENOTDIR) can precede the document on stdout.
    const start = result.stdout.search(/^\{/m)
    const doc = JSON.parse(result.stdout.slice(Math.max(start, 0))) as {
      status?: { message?: unknown }[]
    } | null
    const message = doc?.status?.[0]?.message
    if (typeof message === 'string') reason = message
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
  }
  if (reason === undefined || reason.trim().length === 0) {
    const stderr = result.stderr.replace(ANSI_SGR, '')
    const marker = stderr.indexOf('✖ Error:')
    reason = marker === -1 ? stderr : stderr.slice(marker + '✖ Error:'.length)
  }
  reason = reason.trim()
  return reason.length === 0 ? undefined : respellReason(reason)
}

/** The environment and home directory `run` finds the user-level schema directory from. */
export interface UserSchemaHome {
  env?: NodeJS.ProcessEnv
  home?: string
}

/**
 * The options upstream's `new change` removed, each refused (before root
 * resolution, after name validation, as the binary does in
 * `commands/workflow/new-change.js`) with the binary's own message and code.
 */
const REMOVED_OPTIONS = [
  {
    flag: '--initiative',
    code: 'initiative_option_removed',
    message:
      '--initiative is no longer supported. Normal changes no longer attach to initiatives; --store <id> selects the OpenSpec root.',
  },
  {
    flag: '--areas',
    code: 'areas_option_removed',
    message:
      '--areas is no longer supported. Workspace affected areas are not part of the normal OpenSpec root path.',
  },
] as const

/**
 * The first removed option `parsed` carries, answered as the binary answers
 * it: `✖ Error: <message>` on stderr, or for a `--json` caller one
 * `{change: null, status}` document on stdout.
 */
function refuseRemovedOption(parsed: ParsedArgs, json: boolean): number | undefined {
  const removed = REMOVED_OPTIONS.find((option) => hasFlag(parsed, option.flag))
  if (removed === undefined) return undefined
  if (json) {
    const status = [
      { severity: 'error', code: removed.code, message: removed.message, target: 'change.options' },
    ]
    process.stdout.write(`${JSON.stringify({ change: null, status }, null, 2)}\n`)
  } else process.stderr.write(`✖ Error: ${removed.message}\n`)
  return EXIT.failure
}

/**
 * The root's default schema, as upstream's `new change` resolves it with no
 * `--schema` (`readProjectConfig` in `core/project-config.js`):
 * `openspec/config.yaml`'s `schema:` (else `config.yml`'s), else
 * `spec-driven`. A config it cannot use falls back to `spec-driven` with the
 * binary's own warning on stderr: one it cannot read or parse, one that is not
 * a YAML object, or one whose `schema:` is not a non-empty string.
 */
export function defaultSchema(base: string): string {
  for (const name of ['config.yaml', 'config.yml']) {
    const path = join(openspecDir(base), name)
    if (!existsSync(path)) continue
    let doc: unknown
    try {
      doc = parseYaml(readFileSync(path, 'utf8'))
    } catch (err) {
      const unreadable = err instanceof Error && 'code' in err
      if (!(err instanceof YAMLError) && !unreadable) throw err
      const reason = (err as Error).message.split('\n')[0]
      process.stderr.write(`Warning: could not parse ${path} (${reason}); ignoring it.\n`)
      return 'spec-driven'
    }
    if (typeof doc !== 'object' || doc === null) {
      process.stderr.write('openspec/config.yaml is not a valid YAML object\n')
      return 'spec-driven'
    }
    const schema = (doc as { schema?: unknown }).schema
    if (typeof schema === 'string' && schema.length > 0) return schema
    if (schema !== undefined)
      process.stderr.write("Invalid 'schema' field in config (must be non-empty string)\n")
    return 'spec-driven'
  }
  return 'spec-driven'
}

/** The wrapped `new change --json` document's two objects, lifted into cospec's own. */
interface WrappedChange {
  readonly change: Record<string, unknown>
  readonly root: Record<string, unknown>
}

/**
 * The first top-level JSON object on `stdout` (from the first line that opens
 * one), or undefined. Only the first: a warning line may precede it, and the
 * embedded single-file bundle a standalone cospec runs prints its `--json`
 * document twice.
 */
function firstJsonObject(stdout: string): string | undefined {
  const start = stdout.search(/^\{/m)
  if (start === -1) return undefined
  let depth = 0
  let inString = false
  for (let i = start; i < stdout.length; i++) {
    const ch = stdout[i]!
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth++
    else if ((ch === '}' || ch === ']') && --depth === 0) return stdout.slice(start, i + 1)
  }
  return undefined
}

function wrappedDocument(stdout: string): WrappedChange | undefined {
  const text = firstJsonObject(stdout)
  if (text === undefined) return undefined
  try {
    const doc = JSON.parse(text) as Record<string, unknown> | null
    const change = doc?.['change']
    const root = doc?.['root']
    if (typeof change !== 'object' || change === null) return undefined
    if (typeof root !== 'object' || root === null) return undefined
    return { change: change as Record<string, unknown>, root: root as Record<string, unknown> }
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    return undefined
  }
}

/**
 * `cospec new <type> <slug>` and upstream's spelling of it, `cospec new
 * change <name> [--schema <type>]`: one lane for both, the type taken from
 * the positional, or from `--schema` / the root's default schema.
 */
export async function run(ctx: CommandContext, user: UserSchemaHome = {}): Promise<number> {
  const { flags } = ctx
  const parsed = ctx.parsed!
  const upstreamSpelling = parsed.subcommand === 'change'
  const positionals = parsed.positionals
  // The table parser has refused a missing type or slug (commander's
  // `missing required argument`, ahead of every refusal here); one positional
  // is the compound `"<type>: <description>"` form.
  const freeForm = !upstreamSpelling && positionals.length === 1

  if (upstreamSpelling) {
    const name = positionals[0]!
    if (!SLUG_RE.test(name))
      return refuse(`invalid slug '${name}' — must match ${SLUG_RE.source}`, flags.json)
    const removed = refuseRemovedOption(parsed, flags.json)
    if (removed !== undefined) return removed
  }

  const root = await resolveRoot(ctx)
  const base = root.base

  // Detect the missing openspec/ dir directly (as validate/update/doctor do) so a
  // common first-run mistake gets an actionable remedy rather than leaking the raw
  // wrapped-openspec spawn command + exit code from the delegation below.
  if (!existsSync(openspecDir(base))) {
    return refuse(
      root.store !== undefined
        ? `store '${root.store}' has no openspec/ directory — run 'cospec init ${root.base}' first`
        : `no openspec/ directory — run 'cospec init' first`,
      flags.json,
    )
  }

  const description = flagValue(parsed, '--description')
  const goal = flagValue(parsed, '--goal')

  let type: string
  let slug: string | undefined
  let derivedDescription = description

  if (upstreamSpelling) {
    // An empty `--schema` is no schema, as the binary's `if (options.schema)` reads it.
    const schema = flagValue(parsed, '--schema')
    type = schema !== undefined && schema.length > 0 ? schema : defaultSchema(base)
    slug = positionals[0]!
  } else if (freeForm) {
    // Form 2: "<type>: <free text>".
    const raw = positionals[0]!
    const idx = raw.indexOf(':')
    type = raw.slice(0, idx).trim()
    const free = raw.slice(idx + 1).trim()
    slug = slugify(free)
    derivedDescription ??= free.length > 0 ? free : undefined
    if (slug === undefined) {
      return refuse(
        `could not derive a slug from '${free}' — pass an explicit slug: cospec new ${type || '<type>'} <slug>`,
        flags.json,
      )
    }
  } else {
    // Form 1: <type> <slug>.
    type = positionals[0]!
    slug = positionals[1]!
  }

  // A name that is not one of the 11 cospec types may still resolve as a
  // project/user/package ("legacy") schema (e.g. one created by `cospec
  // schema fork/init`) — that rides the legacy lane through validate/apply/
  // archive, so `new` delegates to it too rather than rejecting it outright.
  // A name that resolves nowhere keeps cospec's unknown-type table on
  // `new <type>`; on upstream's `new change --schema` spelling it is
  // delegated, so the binary's own `Schema '<s>' not found` answer is relayed.
  const legacy = !isCospecType(type)
  if (legacy && !upstreamSpelling && resolveSchema(base, type).kind !== 'legacy')
    return reportUnknownType(type, flags.json)
  // A cospec type the repo has no schema for (an OpenSpec repo cospec has not
  // adopted yet) is the user's setup to fix, not a wrapped-call failure: the
  // wrapped `new change` would refuse it as `Schema '<type>' not found`.
  if (isCospecType(type) && !cospecSchemaInstalled(base, type, user.env, user.home)) {
    return refuse(
      root.store !== undefined
        ? `schema '${type}' is not installed in store '${root.store}' — run 'cospec init ${root.base}' first`
        : `schema '${type}' is not installed in this repo — run 'cospec init' first`,
      flags.json,
    )
  }

  if (!SLUG_RE.test(slug))
    return refuse(`invalid slug '${slug}' — must match ${SLUG_RE.source}`, flags.json)

  // Collision: active change or archive-entry suffix (openspec only checks active).
  if (resolveChange(base, slug) !== undefined)
    return refuse(`change '${slug}' already exists in openspec/changes/`, flags.json)
  if (readArchiveIndex(base).bySlug.has(slug)) {
    return refuse(
      `'${slug}' collides with an archived change suffix — choose a different slug`,
      flags.json,
    )
  }

  // Delegate + verify the written schema pointer (never trust the exit code).
  // `--json` so a refusal carries the binary's reason as a document message,
  // and a success its `change` and `root` objects.
  const args = [slug, '--schema', type, '--json']
  if (derivedDescription !== undefined) args.push('--description', derivedDescription)
  if (goal !== undefined) args.push('--goal', goal)
  let wrapped: WrappedChange
  try {
    const result = await runOpenspec(threadedArgv(['new', 'change'], root.storeArgs, args), {
      cwd: root.cwd,
      expect: {
        exitCodes: [0],
        postCondition: (wrappedRun) => {
          const yaml = readOpenspecYaml(`${changesDir(base)}/${slug}`)
          if (yaml === undefined)
            return `the wrapped OpenSpec \`new change\` did not create a valid .openspec.yaml for '${slug}'`
          if (yaml.schema !== type)
            return `created change has schema '${yaml.schema}', expected '${type}'`
          if (wrappedDocument(wrappedRun.stdout) === undefined)
            return 'the wrapped OpenSpec `new change --json` printed no {change, root} document'
        },
      },
    })
    wrapped = wrappedDocument(result.stdout)!
  } catch (err) {
    if (!(err instanceof OpenspecCallError)) return refuse((err as Error).message, flags.json)
    // A post-condition failure (exit 0) keeps cospec's own account of it.
    const reason = err.result.exitCode === 0 ? undefined : wrappedNewReason(err.result)
    return refuse(reason ?? err.message, flags.json)
  }

  // Upstream's spelling answers with upstream's `change` object; cospec's
  // with the change id, as it always has.
  const change = upstreamSpelling ? wrapped.change : slug
  const dir = `openspec/changes/${slug}`

  if (legacy) {
    // Legacy schemas never carry a cospec `schemaVersion` (that stamp is a
    // cospec-typed-change concept) and have no typed artifact plan to print.
    const note =
      'legacy schema — reduced cospec guarantees (structural checks + openspec-delegated validation only)'
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify({ change, root: wrapped.root, type, dir, legacy: true, note }, null, 2)}\n`,
      )
    } else {
      process.stdout.write(`Created change '${slug}' (schema: ${type}) at ${dir}/\n`)
      process.stdout.write(`${note}\n`)
    }
    return EXIT.success
  }

  stampSchemaVersion(`${changesDir(base)}/${slug}`)

  const info = getTypeInfo(type)!
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          change,
          root: wrapped.root,
          type,
          dir,
          artifacts: {
            required: info.requiredArtifacts,
            optional: info.optionalArtifacts,
            forbidden: info.forbiddenArtifacts,
            summary: info.summary,
          },
        },
        null,
        2,
      )}\n`,
    )
  } else {
    process.stdout.write(`Created change '${slug}' (schema: ${type}) at ${dir}/\n`)
    process.stdout.write(`Artifacts: ${info.summary}\n`)
    process.stdout.write(`Next: cospec instructions proposal --change ${slug}\n`)
  }
  return EXIT.success
}
