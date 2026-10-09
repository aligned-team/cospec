// The detector behind ledger rows 3.1 and 8.1: it flags a line where `openspec`
// is a command token and passes the product name inside prose.

import { describe, expect, test } from 'bun:test'

import { openspecCommandLines } from '../fixtures/openspec-command.ts'

const flagged = [
  'openspec list',
  '  openspec completion zsh',
  'eval "$(openspec completion zsh)"',
  'x=`openspec list`',
  'foo && openspec list',
  'foo | openspec validate',
  'exec openspec list',
  'command openspec list',
  'command -v openspec',
  'which openspec',
  '& openspec list',
  "& 'openspec' list",
  'Get-Command openspec',
  'complete -c openspec -a x',
  'compdef _x openspec',
  "Register-ArgumentCompleter -Native -CommandName 'openspec' -ScriptBlock {",
  'OpenSpec list',
  "echo 'x' && openspec list",
]

const allowed = [
  "'store:Manage registered OpenSpec stores'",
  "complete -c cospec -n __fish_use_subcommand -a view -d 'Show the OpenSpec dashboard'",
  "@{ Name = '--tools'; Description = 'OpenSpec''s spelling of --harness (same values)' }",
  "@{ Name = '--remove-opsx'; Description = 'Delete provably openspec-generated leftover files' }",
  "Description = 'Store goal metadata in the change''s .openspec.yaml'",
  "'feedback:File feedback about cospec (--upstream files OpenSpec'\\''s)'",
  '# OPENSPEC:START',
  'export OPENSPEC_NO_AUTO_CONFIG=1',
  "'archive:Archive (delegated; openspec >=1.9.0)'",
  "complete -c cospec -a x -d 'OpenSpec\\'s change; openspec list'",
  "'a'\\''b; openspec x'",
  'cospec completion zsh',
  'fpath=(~/.zsh/completions $fpath) # _openspec stays',
]

describe('openspecCommandLines', () => {
  for (const line of flagged) {
    test(`flags ${JSON.stringify(line)}`, () => {
      expect(openspecCommandLines(line)).toEqual([line])
    })
  }
  for (const line of allowed) {
    test(`allows ${JSON.stringify(line)}`, () => {
      expect(openspecCommandLines(line)).toEqual([])
    })
  }
})
