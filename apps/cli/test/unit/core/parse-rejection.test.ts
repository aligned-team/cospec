// The completion tip is skipped when a forward row relayed a parse refusal: the
// binary's commander text, or the table parser's for the rows cospec
// pre-validates before a terminal handover. The second shape is generated here
// from the parser, so a message that drifts from the pattern fails this test.

import { describe, expect, test } from 'bun:test'

import {
  commandRow,
  parseCommandArgs,
  pending,
  parseSubcommandArgs,
  type TableCommandRow,
} from '../../../src/core/command-table.ts'
import { isRelayedParseRefusal } from '../../../src/core/parse-rejection.ts'

/** A table row by name, as the parser takes it. */
function table(name: string): TableCommandRow {
  return commandRow(name) as TableCommandRow
}

function refusal(result: ReturnType<typeof parseCommandArgs>): string {
  if (result.ok) throw new Error('expected a parse refusal')
  return result.refusal.message
}

describe('isRelayedParseRefusal', () => {
  test("commander's refusals with nothing on stdout", () => {
    for (const stderr of [
      "error: unknown option '--bogus'\n",
      "error: missing required argument 'name'\n",
      'error: too many arguments for schemas. Expected 0 arguments but got 1.\n',
      "error: option '--schema <name>' argument missing\n",
    ]) {
      expect(isRelayedParseRefusal({ stdout: '', stderr })).toBe(true)
    }
  })

  test("every shape of the table parser's refusal, generated from the parser", () => {
    const completion = table('completion')
    const open = commandRow('workset')!.subcommands!.find((s) => s.name === 'open')!
    // No shipped flag is pending any more, so `init` gets a synthetic one marked pending on a copy.
    const init = table('init')
    const pendingInit: TableCommandRow = {
      ...init,
      flags: [
        ...init.flags,
        {
          name: '--pending-fixture',
          takesValue: true,
          placeholder: '<value>',
          description: 'a synthetic pending flag',
          status: pending('workflow-profiles'),
          origin: 'upstream',
        },
      ],
    }
    const valueFlag = commandRow('validate')!.flags!.find((f) => f.placeholder !== undefined)!
    const messages = [
      refusal(parseCommandArgs(completion, ['zsh', '--bogus'])),
      refusal(parseCommandArgs(completion, ['zsh', 'x', 'y'])),
      refusal(parseCommandArgs(table('new'), [])),
      refusal(parseCommandArgs(pendingInit, ['--pending-fixture', 'fr'])),
      refusal(parseCommandArgs(table('validate'), [valueFlag.name])),
      refusal(parseSubcommandArgs(commandRow('workset')!, open, [])),
      refusal(parseSubcommandArgs(commandRow('workset')!, open, ['a', '--bogus'])),
    ]
    for (const message of messages) {
      expect(isRelayedParseRefusal({ stdout: '', stderr: message })).toBe(true)
    }
  })

  test('output that merely mentions a refusal, or a refusal beside stdout, is not one', () => {
    expect(isRelayedParseRefusal({ stdout: '', stderr: '' })).toBe(false)
    expect(isRelayedParseRefusal({ stdout: '', stderr: 'cospec: wrote 3 files\n' })).toBe(false)
    expect(
      isRelayedParseRefusal({
        stdout: 'some output\n',
        stderr: "cospec workset open: unknown option '--bogus'\n",
      }),
    ).toBe(false)
    expect(
      isRelayedParseRefusal({ stdout: '', stderr: "✖ Error: unknown option '--bogus'\n" }),
    ).toBe(false)
  })
})
