// Readers for the generated PowerShell script's fixed layout, shared by the
// generator's own tests and the three-way parity test. The script is a data
// block whose indentation is part of the contract: a command is a `@{` at 12
// spaces, its own flags sit at 20, a subcommand's `@{` at 20 and its flags at
// 28. A reader that finds a block by indentation never mistakes a
// subcommand's flag for its parent's.

/** The text of the command named `name`, or undefined when the script omits it. */
export function commandBlock(script: string, name: string): string | undefined {
  const match = new RegExp(`^ {12}@\\{\\n {16}Name = '${name}'\\n[\\s\\S]*?\\n {12}\\}$`, 'm').exec(
    script,
  )
  return match?.[0]
}

/** Every command name, in script order. */
export function commandNames(script: string): string[] {
  return [...script.matchAll(/^ {12}@\{\n {16}Name = '([^']+)'$/gm)].map((m) => m[1]!)
}

/** The text of the subcommand `name` inside a command block. */
export function subcommandBlock(block: string, name: string): string | undefined {
  const match = new RegExp(`^ {20}@\\{\\n {24}Name = '${name}'\\n[\\s\\S]*?\\n {20}\\}$`, 'm').exec(
    block,
  )
  return match?.[0]
}

/** Every subcommand name of a command block, in script order. */
export function subcommandNames(block: string): string[] {
  return [...block.matchAll(/^ {20}@\{\n {24}Name = '([^']+)'$/gm)].map((m) => m[1]!)
}

/** A command block's own flag entries (name and tooltip), globals included. */
export function commandFlags(block: string): { name: string; description: string }[] {
  return flagEntries(block, 20)
}

/** A subcommand block's flag entries. */
export function subcommandFlags(block: string): { name: string; description: string }[] {
  return flagEntries(block, 28)
}

function flagEntries(block: string, indent: number): { name: string; description: string }[] {
  const entry = new RegExp(
    `^ {${indent}}@\\{ Name = '([^']+)'; Description = '((?:[^']|'')*)' \\}$`,
    'gm',
  )
  return [...block.matchAll(entry)].map((m) => ({ name: m[1]!, description: m[2]! }))
}

/** A `Key = @('a', 'b')` string-array line of a block at `indent`, unquoted. */
export function stringArray(block: string, key: string, indent: number): string[] {
  const line = new RegExp(`^ {${indent}}${key} = @\\((.*)\\)$`, 'm').exec(block)
  if (line === null) throw new Error(`no ${key} line at indent ${indent}`)
  return [...line[1]!.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]!.replaceAll("''", "'"))
}

/** A PowerShell single-quoted string's text: `'` doubled. */
export const quoted = (text: string): string => text.replaceAll("'", "''")
