// Shared line lexing for the checkbox-grammar artifacts (verification, tasks,
// blocking-changes). Normalizes CRLF → LF before splitting so a file saved by a
// Windows editor (or introduced with CRLF — this repo has no `.gitattributes`
// forcing LF) parses identically to its LF form; without this, a `\r` left on
// every non-final line breaks anchored row regexes that end in `$`.
export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}

/**
 * The binary's `detectLineEnding` (`utils/line-endings.js`): the dominant line
 * ending, CRLF winning a tie, or `undefined` when `content` holds no line break.
 */
export function detectLineEnding(content: string): '\r\n' | '\n' | undefined {
  const crlf = content.match(/\r\n/g)?.length ?? 0
  // LFs not preceded by CR, so a CRLF is never also counted as an LF.
  const lf = content.match(/(?<!\r)\n/g)?.length ?? 0
  if (crlf === 0 && lf === 0) return undefined
  return crlf >= lf ? '\r\n' : '\n'
}

/** The binary's `applyLineEnding`: `content` normalized to LF, then spelled with `ending`. */
export function applyLineEnding(content: string, ending: '\r\n' | '\n'): string {
  const normalized = content.replace(/\r\n/g, '\n')
  return ending === '\n' ? normalized : normalized.replace(/\n/g, '\r\n')
}

/**
 * The binary's `matchLineEnding`: `content` rewritten to `original`'s dominant
 * ending; left as is (LF, for a new file) when `original` has no line break.
 */
export function matchLineEnding(content: string, original: string): string {
  const ending = detectLineEnding(original)
  return ending === undefined ? content : applyLineEnding(content, ending)
}
