// A warning line printed once per invocation, however many reads hit it. The
// binary prints its config warnings once per read, an internal call count (its
// `list` reads a broken config once per change); cospec prints each distinct
// line once.

const printed = new Set<string>()

/** Write `line` to stderr unless this process already has. */
export function warnOnce(line: string): void {
  if (printed.has(line)) return
  printed.add(line)
  process.stderr.write(`${line}\n`)
}
