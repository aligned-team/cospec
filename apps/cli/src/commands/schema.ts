// `cospec schema <sub>` — read-only passthrough of `openspec schema
// which|validate` (WI-6). `fork`/`init` are deliberately NOT wired: they let a
// user hand-author a project-local schema, which conflicts head-on with
// cospec's canon-managed 11-schema model (every schema is generated from
// `apps/cli/src/canon/` — a hand-authored one would carry artifacts the gate
// and validation rules don't understand). Invoking them prints guidance and
// exits 1 without ever spawning the wrapped binary, so no schema dir is
// created on disk.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { runPassthrough } from '../core/passthrough-command.ts'

const WRAPPED_SUBCOMMANDS = new Set(['which', 'validate'])
const CANON_MANAGED_SUBCOMMANDS = new Set(['fork', 'init'])

export function run(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.args

  if (sub === undefined) {
    process.stderr.write("cospec schema: missing subcommand — expected 'which' or 'validate'\n")
    return Promise.resolve(EXIT.failure)
  }

  if (CANON_MANAGED_SUBCOMMANDS.has(sub)) {
    process.stderr.write(
      `cospec: 'schema ${sub}' is not supported — cospec's 11 schemas are canon-managed ` +
        "(apps/cli/src/canon/), not hand-authored. Edit the canon and run 'mise run generate' " +
        'to change a schema, instead of forking or initializing a project-local one.\n',
    )
    return Promise.resolve(EXIT.failure)
  }

  if (!WRAPPED_SUBCOMMANDS.has(sub)) {
    process.stderr.write(`cospec: unknown 'schema' subcommand '${sub}'\n`)
    return Promise.resolve(EXIT.failure)
  }

  return runPassthrough(ctx, { args: ['schema', sub, ...rest] })
}
