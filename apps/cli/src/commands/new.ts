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

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

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
import { COMMAND_TABLE, flagValue } from '../core/command-table.ts'
import { respellRemedies } from '../core/forward-relay.ts'
import type { OpenspecResult } from '../core/openspec.ts'
import { OpenspecCallError, runOpenspec, threadedArgv } from '../core/openspec.ts'
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

/** `openspec` naming one of cospec's commands, never part of a word or a path. */
const OPENSPEC_COMMAND = new RegExp(
  `(?<![\\w./-])openspec (?=(?:${COMMAND_TABLE.map((row) => row.name).join('|')})(?![\\w-]))`,
  'g',
)

/**
 * Where the binary's schema load error starts quoting the user's own schema
 * (`resolver.js`: `Failed to parse schema at '<path>': <yaml error>`, or
 * `Invalid schema at '<path>': <validation error>`): its path and excerpt.
 */
const SCHEMA_PAYLOAD = /(?:Failed to parse|Invalid) schema at '/

/**
 * `reason` with the remedies it names spelled through cospec: the
 * `RELAYED_REMEDIES` spans, and `openspec <command>` wherever `<command>` is
 * one cospec has. Nothing from a schema load error's payload on is touched —
 * a path or a quoted excerpt of the user's schema is theirs, whatever it says.
 */
function respellReason(reason: string): string {
  const at = reason.search(SCHEMA_PAYLOAD)
  const head = at === -1 ? reason : reason.slice(0, at)
  const payload = at === -1 ? '' : reason.slice(at)
  return respellRemedies(head).replace(OPENSPEC_COMMAND, 'cospec ') + payload
}

/**
 * Why a failed wrapped `new change --json` refused: the message of its
 * document's first status entry (every failure of its own — an unparseable or
 * unknown schema, an existing change, an invalid name — answers with one),
 * else its stderr without color codes or its `✖ Error:` prefix, with its
 * remedies spelled through cospec (`respellReason`). Undefined when the
 * binary said nothing.
 */
export function wrappedNewReason(result: OpenspecResult): string | undefined {
  let reason: string | undefined
  try {
    const doc = JSON.parse(result.stdout) as { status?: { message?: unknown }[] } | null
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

export async function run(ctx: CommandContext, user: UserSchemaHome = {}): Promise<number> {
  const { flags } = ctx
  const parsed = ctx.parsed!
  const positionals = parsed.positionals
  // The table parser has refused a missing type or slug (commander's
  // `missing required argument`, ahead of every refusal here); one positional
  // is the compound `"<type>: <description>"` form.
  const freeForm = positionals.length === 1

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

  let type: string
  let slug: string | undefined
  let derivedDescription = description

  if (freeForm) {
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
  // Only a name that resolves nowhere keeps today's unknown-type error.
  const legacy = !isCospecType(type) && resolveSchema(base, type).kind === 'legacy'
  if (!isCospecType(type) && !legacy) return reportUnknownType(type, flags.json)
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
  // `--json` so a refusal carries the binary's reason as a document message.
  const args = [slug, '--schema', type, '--json']
  if (derivedDescription !== undefined) args.push('--description', derivedDescription)
  try {
    await runOpenspec(threadedArgv(['new', 'change'], root.storeArgs, args), {
      cwd: root.cwd,
      expect: {
        exitCodes: [0],
        postCondition: () => {
          const yaml = readOpenspecYaml(`${changesDir(base)}/${slug}`)
          if (yaml === undefined)
            return `the wrapped OpenSpec \`new change\` did not create a valid .openspec.yaml for '${slug}'`
          if (yaml.schema !== type)
            return `created change has schema '${yaml.schema}', expected '${type}'`
        },
      },
    })
  } catch (err) {
    if (!(err instanceof OpenspecCallError)) return refuse((err as Error).message, flags.json)
    // A post-condition failure (exit 0) keeps cospec's own account of it.
    const reason = err.result.exitCode === 0 ? undefined : wrappedNewReason(err.result)
    return refuse(reason ?? err.message, flags.json)
  }

  if (legacy) {
    // Legacy schemas never carry a cospec `schemaVersion` (that stamp is a
    // cospec-typed-change concept) and have no typed artifact plan to print.
    const note =
      'legacy schema — reduced cospec guarantees (structural checks + openspec-delegated validation only)'
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          { change: slug, type, dir: `openspec/changes/${slug}`, legacy: true, note },
          null,
          2,
        )}\n`,
      )
    } else {
      process.stdout.write(
        `Created change '${slug}' (schema: ${type}) at openspec/changes/${slug}/\n`,
      )
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
          change: slug,
          type,
          dir: `openspec/changes/${slug}`,
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
    process.stdout.write(
      `Created change '${slug}' (schema: ${type}) at openspec/changes/${slug}/\n`,
    )
    process.stdout.write(`Artifacts: ${info.summary}\n`)
    process.stdout.write(`Next: cospec instructions proposal --change ${slug}\n`)
  }
  return EXIT.success
}
