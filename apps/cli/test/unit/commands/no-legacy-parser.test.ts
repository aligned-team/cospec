// Verification row 1.6: every `table` command reads its argv from `ctx.parsed`
// (the command-table parse `cli.ts` performs before loading the module) and
// no `table` module still hand-scans `ctx.args`. `forward` modules are exempt:
// they hand `ctx.args` to the wrapped binary, which is the unknown-option
// authority there.

import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { COMMAND_TABLE, type TableCommandRow } from '../../../src/core/command-table.ts'

const COMMANDS_DIR = join(import.meta.dir, '..', '..', '..', 'src', 'commands')

const TABLE_ROWS = COMMAND_TABLE.filter((row): row is TableCommandRow => row.parse === 'table')

function modulePath(row: TableCommandRow): string {
  return join(COMMANDS_DIR, `${row.name === '__complete' ? 'complete' : row.name}.ts`)
}

/** A row that declares no positional, flag or subcommand has nothing to read. */
function declaresArgv(row: TableCommandRow): boolean {
  return row.positionals.length > 0 || row.flags.length > 0 || (row.subcommands?.length ?? 0) > 0
}

/** `ctx.parsed`, or `parsed` destructured off `ctx`. */
const READS_PARSED = /\bctx\.parsed\b|\{[^}]*\bparsed\b[^}]*\}\s*=\s*ctx\b/

const LEGACY_PATTERNS: readonly RegExp[] = [
  /\bargs\.includes\(/,
  /\bargs\.find\(/,
  /\bargs\.indexOf\(/,
  /startsWith\(\s*'-'\s*\)/,
  /\bctx\.args\[/,
]

describe('table command modules read ctx.parsed, never ctx.args', () => {
  test('the table has table rows to check', () => {
    expect(TABLE_ROWS.length).toBeGreaterThan(0)
  })

  for (const row of TABLE_ROWS) {
    test(`${row.name}: module exists`, () => {
      expect(existsSync(modulePath(row))).toBe(true)
    })

    if (declaresArgv(row)) {
      test(`${row.name}: reads ctx.parsed`, () => {
        expect(READS_PARSED.test(readFileSync(modulePath(row), 'utf8'))).toBe(true)
      })
    }

    test(`${row.name}: no hand-rolled argv scan`, () => {
      const source = readFileSync(modulePath(row), 'utf8')
      const hits = LEGACY_PATTERNS.filter((pattern) => pattern.test(source)).map(String)
      expect(hits).toEqual([])
    })
  }
})
