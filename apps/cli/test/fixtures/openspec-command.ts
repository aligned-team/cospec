// The repo rule for shipped output is "no bare `openspec` COMMAND": a script,
// an rc block or a printed instruction never runs, registers or looks up the
// wrapped binary by name. The product name inside prose (a flag description
// copied from the command table, "a registered OpenSpec store", "(delegated;
// openspec >=1.9.0)") is allowed, so the check is over command positions
// outside single-quoted prose, not over every mention of the word.

/** `openspec` as a word that is not part of a longer name, path or file. */
const NAME = String.raw`openspec(?![\w./:-])`

/** A position where a shell reads the next word as a command to run. */
const COMMAND_START = String.raw`(?:^|[;&|(){}\`]|\$\(|\b(?:exec|then|do|else|sudo|env|xargs|time|nohup|which|type|Get-Command|Start-Process|Invoke-Expression|iex)\s|\bcommand(?:\s+-\S+)*\s)\s*(?:&\s*)?['"]?`

/** A registration form that binds completion to the name, which is a command name too. */
const REGISTRATION = String.raw`(?:\bcomplete\b[^\n]*\s-c\s+|-CommandName\s+['"]?|\bcompdef\b[^\n]*\s)['"]?`

const COMMAND_TOKEN = new RegExp(`(?:${COMMAND_START}|${REGISTRATION})(${NAME})`, 'gi')

/**
 * For each index of `line`, the index of the single quote that opened the
 * literal the character sits in, or -1 outside one. A backslash outside a
 * literal escapes the next character (zsh's `'\''`), and `\'` inside one is an
 * escaped quote (fish); PowerShell's `''` is two toggles and needs no case.
 */
function literalOpeners(line: string): number[] {
  const opener: number[] = []
  let open = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (open === -1) {
      opener.push(-1)
      if (ch === '\\') {
        i++
        opener.push(-1)
      } else if (ch === "'") open = i
    } else {
      opener.push(open)
      if (ch === '\\' && line[i + 1] === "'") {
        i++
        opener.push(open)
      } else if (ch === "'") open = -1
    }
  }
  return opener
}

/** Lines of `text` on which `openspec` is a command token. */
export function openspecCommandLines(text: string): string[] {
  return text.split('\n').filter((line) => {
    const opener = literalOpeners(line)
    for (const match of line.matchAll(COMMAND_TOKEN)) {
      const start = match.index + match[0].length - (match[1] as string).length
      const inside = opener[start] ?? -1
      // Prose sits inside a literal; a literal that opens right at the token
      // (`'openspec'`, `& 'openspec' list`) is a name, not prose.
      if (inside === -1 || inside === start - 1) return true
    }
    return false
  })
}
