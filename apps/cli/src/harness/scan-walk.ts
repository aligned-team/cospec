import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/**
 * True when `abs` is the root of a nested git working tree distinct from the project's
 * own: a worktree checkout (`git worktree add` writes `.git` there as a *file* pointing at
 * the real gitdir) or an embedded clone (`.git` as a directory). Checked by existence only,
 * never `isDirectory()`, so the worktree-file case is caught too.
 */
function isNestedWorktreeRoot(abs: string): boolean {
  return existsSync(join(abs, '.git'))
}

/**
 * True when `abs` does NOT resolve (symlinks followed) to somewhere inside `cwdReal`
 * (`cwd`'s own real path). A scan root (`.claude`, `.agents`, `.agents/skills`, `openspec`)
 * is handed straight to the walk without first passing through a parent `readdirSync` — the
 * per-child `Dirent.isDirectory()` check that already skips a *nested* symlinked directory
 * never runs for the root segment itself, so a project whose `.claude` or
 * `.agents/skills` is a symlink into another project's (or a shared) directory would
 * otherwise have the scan read, list and delete files living entirely outside this project.
 * Checked by realpath containment rather than `lstatSync` so a symlink that happens to
 * resolve back inside the project (harmless) is not needlessly skipped, and so a
 * multi-segment path (`.agents/skills`) is caught regardless of which segment is the link.
 */
export function isOutsideProject(cwdReal: string, abs: string): boolean {
  let real: string
  try {
    real = realpathSync(abs)
  } catch {
    return true
  }
  const rel = relative(cwdReal, real)
  return rel === '..' || rel.startsWith(`..${sep}`) || resolve(rel) === rel
}

/**
 * The one bounded walk every project scan (opsx leftovers, doctor's harness-markdown read,
 * doctor's stale-sidecar check) descends with, so none can drift from the boundary:
 *
 * - a root that does not exist is skipped; a root that does not resolve inside the project
 *   (a symlinked `.claude` pointing elsewhere) is never read;
 * - a directory that is a nested git working tree (a worktree checkout under
 *   `.claude/worktrees/<name>/`, or any embedded clone) is never descended into — it is a
 *   distinct project;
 * - `skipDir` prunes further directories by name.
 *
 * `visit` is called for each regular file with its `/`-joined path relative to `cwd`.
 */
export function walkProjectFiles(
  cwd: string,
  roots: readonly string[],
  visit: (relpath: string) => void,
  skipDir: (name: string) => boolean = () => false,
): void {
  const cwdReal = realpathSync(cwd)
  const walk = (rel: string): void => {
    const abs = join(cwd, rel)
    if (!existsSync(abs)) return
    if (isOutsideProject(cwdReal, abs)) return
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (skipDir(entry.name) || isNestedWorktreeRoot(join(cwd, childRel))) continue
        walk(childRel)
      } else if (entry.isFile()) visit(childRel)
    }
  }
  for (const root of roots) walk(root)
}
