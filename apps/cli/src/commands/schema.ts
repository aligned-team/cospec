// `cospec schema <sub>` — disciplined passthrough of `openspec schema
// which|validate|fork|init` (WI-6, schema-fork-and-docs-parity). `fork`/`init`
// let a user create a project-local ("legacy") schema; every other cospec
// layer already anticipates that schema kind (`resolveSchema` classifies it,
// `validate`/`apply`/`archive` all have a legacy branch that keeps cospec's
// schema-agnostic hard gates while delegating typed-artifact checks to
// OpenSpec's own validation of the fork's artifact graph) — so cospec merely
// wraps `fork`/`init` rather than refusing to run them. The one thing cospec
// must still protect is its own canon: a fork/init that names one of the 11
// `COSPEC_TYPES` as its destination would overwrite a canon-managed
// `schema.yaml` that every other command reads, so that destination name is
// refused with exit 1 before the wrapped binary is ever spawned.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { isCospecType } from '../core/change.ts'
import { runPassthrough } from '../core/passthrough-command.ts'

const WRAPPED_SUBCOMMANDS = new Set(['which', 'validate', 'fork', 'init'])

/** `init`'s value-taking flags (`fork` has none — `--json`/`--force` are boolean). */
const INIT_VALUE_FLAGS = new Set(['--description', '--artifacts'])

/** Positional (non-flag) arguments, skipping a value-flag's following token. */
function positionals(sub: string, rest: string[]): string[] {
  const valueFlags = sub === 'init' ? INIT_VALUE_FLAGS : new Set<string>()
  const out: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    if (valueFlags.has(a)) {
      i++
      continue
    }
    if (a.startsWith('-')) continue
    out.push(a)
  }
  return out
}

/**
 * The schema name a `fork`/`init` invocation would create on disk, mirroring
 * the wrapped binary's own default-naming rule (fork: `[name] || <source>-custom`;
 * init: `<name>`). `undefined` when the required positional is missing —
 * that is the wrapped binary's error to report, not this guard's.
 */
function destinationName(sub: string, rest: string[]): string | undefined {
  const args = positionals(sub, rest)
  if (sub === 'fork') {
    const source = args[0]
    if (source === undefined) return undefined
    return args[1] ?? `${source}-custom`
  }
  // sub === 'init'
  return args[0]
}

export function run(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.args

  if (sub === undefined) {
    process.stderr.write("cospec schema: missing subcommand — expected 'which' or 'validate'\n")
    return Promise.resolve(EXIT.failure)
  }

  if (!WRAPPED_SUBCOMMANDS.has(sub)) {
    process.stderr.write(`cospec: unknown 'schema' subcommand '${sub}'\n`)
    return Promise.resolve(EXIT.failure)
  }

  if (sub === 'fork' || sub === 'init') {
    const dest = destinationName(sub, rest)
    if (dest !== undefined && isCospecType(dest)) {
      process.stderr.write(
        `cospec: refusing to ${sub} schema '${dest}' — it is one of the 11 canon cospec ` +
          "types (managed by apps/cli/src/canon/, generated via 'mise run generate') and " +
          "overwriting it would corrupt cospec's typed gates for that type. Choose a " +
          `destination name that is not one of the 11 cospec types.\n`,
      )
      return Promise.resolve(EXIT.failure)
    }
  }

  return runPassthrough(ctx, { args: ['schema', sub, ...rest] })
}
