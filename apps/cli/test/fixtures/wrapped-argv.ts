/**
 * A wrapped spawn's argv from the bin path on: `cmd` without the executable and every leading
 * `--preload <file>` — the readdir preload every wrapped call runs behind, and a handover's own.
 * For `Bun.spawn` stubs that read the wrapped argv by position.
 */
export function fromBinPath(cmd: readonly string[]): string[] {
  let at = 1
  while (cmd[at] === '--preload') at += 2
  return cmd.slice(at)
}
