// `cospec view` (WI-5) — a thin read-only passthrough of `openspec view`, the
// summary dashboard. Unlike `show`, the wrapped `view` subcommand takes no
// `--json` at all — passing it is an "unknown option" from openspec itself
// (re-probed at the 1.11.0 pin: `error: unknown option '--json'`). `--store`
// was likewise rejected at 1.5.0 but IS accepted from a later minor (1.11.0
// resolves it and reports an unknown store id). cospec still threads neither
// global onto the wrapped call: the accepted runtime range starts at 1.0.0,
// where `view --store` is an unknown option, so for a store-backed root this
// command spawns `openspec view` with the store's own root as the working
// directory (`root.base`) instead. That shows the same dashboard on every
// binary in the range.
//
// cospec adds one observable pre-condition of its own rather than trusting
// the wrapped exit code alone (DESIGN §1): it checks for `openspec/` under
// `root.base` before spawning, so a missing root is reported the same way
// regardless of whether the pinned binary's own "no openspec directory"
// exit code ever drifts.

import { existsSync } from 'node:fs'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { openspecDir } from '../core/change.ts'
import { passthroughOpenspec } from '../core/openspec.ts'
import { resolveRoot } from '../core/root.ts'

export async function run(ctx: CommandContext): Promise<number> {
  const root = await resolveRoot(ctx)

  if (!existsSync(openspecDir(root.base))) {
    process.stderr.write(`cospec view: no openspec/ directory at ${root.base}\n`)
    return EXIT.failure
  }

  const result = await passthroughOpenspec(['view'], { cwd: root.base })
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return result.exitCode === 0 ? EXIT.success : EXIT.failure
}
