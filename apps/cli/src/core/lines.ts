// Shared line lexing for the checkbox-grammar artifacts (verification, tasks,
// blocking-changes). Normalizes CRLF → LF before splitting so a file saved by a
// Windows editor (or introduced with CRLF — this repo has no `.gitattributes`
// forcing LF) parses identically to its LF form; without this, a `\r` left on
// every non-final line breaks anchored row regexes that end in `$`.
export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}
