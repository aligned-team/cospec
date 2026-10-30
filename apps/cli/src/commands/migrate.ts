// `cospec migrate <slug>` (DESIGN §5) — the opt-in, never-automatic v1→v2
// retrofit. Scaffolds a fully-deferred `verification.md` from the change's type
// template (when the type declares one) and bumps the change's stamped
// `x-cospec-schema-version` to 2; a current change still stamped under the
// legacy `schemaVersion` key has only its key rewritten. atlas retro-gated ~20 in-flight changes by bumping a
// LIVE `apply.requires`; cospec keys on change-creation version instead, and
// this command is the only thing that ever moves that version forward for an
// existing change.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import {
  isCospecType,
  LEGACY_SCHEMA_VERSION_KEY,
  listChanges,
  resolveChange,
  SCHEMA_VERSION_KEY,
} from '../core/change.ts'
import { resolveRoot } from '../core/root.ts'
import { composeTemplates } from '../core/schema-compose.ts'
import { closest } from './apply.ts'

const DEFER_REASON = 'pre-v2 change, verified out-of-band'
/** A template row: `- [ ] N.M @layer [(owner)] probe -> result` — same shape
 * `core/verification.ts`'s ROW_PREFIX/LAYER_RE/ARROW parse. */
const TEMPLATE_ROW_RE = /^- \[[ xX~]\] (\d+\.\d+ .*?) -> .*$/

/** Rewrite every row in a verification template to `[~] … -> defer: <reason>`
 * (DESIGN §5) — the frozen row grammar every row carries a ` -> ` result, so
 * deferral lives entirely in the RHS. */
export function scaffoldDeferredVerification(templateBody: string): string {
  return templateBody
    .split('\n')
    .map((line) => {
      const m = line.match(TEMPLATE_ROW_RE)
      return m === null ? line : `- [~] ${m[1]} -> defer: ${DEFER_REASON}`
    })
    .join('\n')
}

/**
 * Write `x-cospec-schema-version: <version>` into a change's `.openspec.yaml`,
 * in the legacy `schemaVersion` key's place when it carries one (that key is
 * dropped), else after every other key.
 */
function rewriteStamp(changeDir: string, version: number): void {
  const yamlPath = join(changeDir, '.openspec.yaml')
  const doc = (parseYaml(readFileSync(yamlPath, 'utf8')) ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(doc)) {
    if (key === SCHEMA_VERSION_KEY) continue
    if (key === LEGACY_SCHEMA_VERSION_KEY) out[SCHEMA_VERSION_KEY] = version
    else out[key] = value
  }
  out[SCHEMA_VERSION_KEY] = version
  writeFileSync(yamlPath, stringifyYaml(out, { lineWidth: 0 }))
}

/** The one `--json` document both outcomes print; `migrated: false` is the already-current no-op. */
function migrateJson(
  change: string,
  schemaVersion: number,
  migrated: boolean,
  verificationScaffolded: boolean,
): string {
  return `${JSON.stringify({ change, schemaVersion, migrated, verificationScaffolded }, null, 2)}\n`
}

export async function run(ctx: CommandContext): Promise<number> {
  const root = await resolveRoot(ctx)
  const base = root.base
  // Required in the table: the parser has refused a missing one.
  const slug = ctx.parsed!.positionals[0]!

  const change = resolveChange(base, slug)
  if (change === undefined) {
    process.stderr.write(`cospec migrate: unknown change '${slug}'\n`)
    const suggestion = closest(
      slug,
      listChanges(base).map((c) => c.id),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return EXIT.failure
  }

  if (!isCospecType(change.schema)) {
    process.stderr.write(`cospec migrate: '${change.id}' is not a cospec-typed change\n`)
    return EXIT.failure
  }

  const currentVersion = change.schemaVersion ?? 1
  if (currentVersion >= 2) {
    if (change.legacyStamp === true) {
      // Already current, but stamped under the legacy key: only the key moves.
      rewriteStamp(change.dir, currentVersion)
      if (ctx.flags.json) process.stdout.write(migrateJson(change.id, currentVersion, true, false))
      else
        process.stdout.write(
          `Rewrote '${change.id}' stamp to ${SCHEMA_VERSION_KEY}: ${currentVersion}.\n`,
        )
      return EXIT.success
    }
    if (ctx.flags.json) process.stdout.write(migrateJson(change.id, currentVersion, false, false))
    else
      process.stdout.write(
        `cospec migrate: '${change.id}' is already on schemaVersion ${currentVersion} — nothing to do\n`,
      )
    return EXIT.success
  }

  const verificationPath = join(change.dir, 'verification.md')
  let scaffolded = false
  if (!existsSync(verificationPath)) {
    const template = composeTemplates(change.schema)['verification.md']
    if (template !== undefined) {
      writeFileSync(verificationPath, scaffoldDeferredVerification(template))
      scaffolded = true
    }
  }

  rewriteStamp(change.dir, 2)

  if (ctx.flags.json) {
    process.stdout.write(migrateJson(change.id, 2, true, scaffolded))
  } else {
    process.stdout.write(`Migrated '${change.id}' to schemaVersion 2.\n`)
    if (scaffolded)
      process.stdout.write(
        'Scaffolded verification.md with every row deferred (pre-v2 change, verified out-of-band).\n',
      )
  }
  return EXIT.success
}
