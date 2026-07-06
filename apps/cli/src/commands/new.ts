// `cospec new <type> <slug>` — create a typed change (DESIGN §2.4). Accepts
// either the two-arg form or a single `"<type>: <free text>"` string (slug
// derived from the text). Validates the type against the 11 cospec types and
// the slug against the kebab grammar plus active/archived collision, then
// delegates to `openspec new change` and verifies the written `.openspec.yaml`
// rather than trusting the exit code. Never pre-scaffolds artifact files
// (openspec marks artifacts done on file existence).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
} from '../core/change.ts'
import { OpenspecCallError, runOpenspec } from '../core/openspec.ts'
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

interface ParsedArgs {
  positionals: string[]
  description?: string
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = []
  let description: string | undefined
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--description') {
      description = args[++i]
      continue
    }
    if (a.startsWith('--description=')) {
      description = a.slice('--description='.length)
      continue
    }
    if (a.startsWith('-')) continue
    positionals.push(a)
  }
  return { positionals, description }
}

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

function reportUnknownType(type: string): number {
  process.stderr.write(`cospec new: unknown type '${type}'\n`)
  const suggestion = closest(type, [...COSPEC_TYPES])
  if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
  process.stderr.write(typeTableText())
  return EXIT.failure
}

export async function run(ctx: CommandContext): Promise<number> {
  const { cwd, flags } = ctx

  // Detect the missing openspec/ dir directly (as validate/update/doctor do) so a
  // common first-run mistake gets an actionable remedy rather than leaking the raw
  // wrapped-openspec spawn command + exit code from the delegation below.
  if (!existsSync(openspecDir(cwd))) {
    process.stderr.write(`cospec new: no openspec/ directory — run 'cospec init' first\n`)
    return EXIT.failure
  }

  const { positionals, description } = parseArgs(ctx.args)

  let type: string
  let slug: string | undefined
  let derivedDescription = description

  if (positionals.length === 1 && positionals[0]!.includes(':')) {
    // Form 2: "<type>: <free text>".
    const raw = positionals[0]!
    const idx = raw.indexOf(':')
    type = raw.slice(0, idx).trim()
    const free = raw.slice(idx + 1).trim()
    slug = slugify(free)
    derivedDescription ??= free.length > 0 ? free : undefined
    if (slug === undefined) {
      process.stderr.write(
        `cospec new: could not derive a slug from '${free}' — pass an explicit slug: cospec new ${type || '<type>'} <slug>\n`,
      )
      return EXIT.failure
    }
  } else {
    // Form 1: <type> <slug>.
    if (positionals.length < 2) {
      process.stderr.write(
        'cospec new: usage — cospec new <type> <slug> | cospec new "<type>: <description>"\n',
      )
      process.stderr.write(typeTableText())
      return EXIT.failure
    }
    type = positionals[0]!
    slug = positionals[1]!
  }

  if (!isCospecType(type)) return reportUnknownType(type)

  if (!SLUG_RE.test(slug)) {
    process.stderr.write(`cospec new: invalid slug '${slug}' — must match ${SLUG_RE.source}\n`)
    return EXIT.failure
  }

  // Collision: active change or archive-entry suffix (openspec only checks active).
  if (resolveChange(cwd, slug) !== undefined) {
    process.stderr.write(`cospec new: change '${slug}' already exists in openspec/changes/\n`)
    return EXIT.failure
  }
  if (readArchiveIndex(cwd).bySlug.has(slug)) {
    process.stderr.write(
      `cospec new: '${slug}' collides with an archived change suffix — choose a different slug\n`,
    )
    return EXIT.failure
  }

  // Delegate + verify the written schema pointer (never trust the exit code).
  const args = ['new', 'change', slug, '--schema', type]
  if (derivedDescription !== undefined) args.push('--description', derivedDescription)
  try {
    await runOpenspec(args, {
      cwd,
      expect: {
        exitCodes: [0],
        postCondition: () => {
          const yaml = readOpenspecYaml(`${changesDir(cwd)}/${slug}`)
          if (yaml === undefined)
            return `openspec new did not create a valid .openspec.yaml for '${slug}'`
          if (yaml.schema !== type)
            return `created change has schema '${yaml.schema}', expected '${type}'`
        },
      },
    })
  } catch (err) {
    const msg = err instanceof OpenspecCallError ? err.message : (err as Error).message
    process.stderr.write(`cospec new: ${msg}\n`)
    return EXIT.failure
  }

  stampSchemaVersion(`${changesDir(cwd)}/${slug}`)

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
