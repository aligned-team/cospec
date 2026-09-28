// `cospec help [command]` — commander's implicit program-level help command,
// as upstream's `openspec help [command]` answers it: the program's help, or
// the named command's own `--help` (hidden commands included), on stdout;
// for any other name — `help` itself included — the program's help on stderr
// and exit 1. The row is `operands: 'lenient'`, so options and excess
// operands are ignored, as commander's help command ignores them.

import type { CommandContext } from '../cli.ts'
import { commandHelpText, EXIT, programHelpText } from '../cli.ts'
import { commandRow } from '../core/command-table.ts'

export function run(ctx: CommandContext): number {
  const name = ctx.parsed!.positionals[0]
  if (name === undefined) {
    process.stdout.write(programHelpText())
    return EXIT.success
  }
  const row = name === 'help' ? undefined : commandRow(name)
  if (row === undefined) {
    process.stderr.write(programHelpText())
    return EXIT.failure
  }
  process.stdout.write(commandHelpText(row))
  return EXIT.success
}
