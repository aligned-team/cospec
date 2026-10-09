// What the pinned binary's OpenCode command adapter writes, and the one shape test that tells
// it from a user's own file. Lives here, not in `commands/`, because it spells workflow ids
// that are also tool ids (`continue`): a tool name in `commands/` is a branch on a tool.

import { splitFrontmatter } from '../core/managed-files.ts'

/**
 * The 12 workflow file names the pinned 1.13.1 dist ever writes, across every adapter (dist
 * `core/command-generation/workflowIdsByFileName`, confirmed against the vendored bundle):
 * `opsx-<id>.md` for exactly these `<id>`s, never an arbitrary `opsx-*` spelling. Matching the
 * id list, not a bare `opsx-[^/]+` wildcard, is itself part of the provenance — a user's own
 * `.opencode/commands/opsx-status.md` (or any id the pinned dist never generates) can never
 * satisfy it regardless of its frontmatter or body.
 */
const OPENCODE_OPSX_IDS = [
  'apply',
  'archive',
  'bulk-archive',
  'continue',
  'explore',
  'ff',
  'new',
  'onboard',
  'propose',
  'sync',
  'update',
  'verify',
] as const

/**
 * The exact path the pinned 1.13.1 OpenCode command adapter (dist
 * `core/command-generation/adapters/opencode.js`) writes to: `.opencode/commands/opsx-<id>.md`
 * for one of `OPENCODE_OPSX_IDS`. cospec's own OpenCode commands live at
 * `.opencode/commands/cospec-<id>.md` and never match this.
 */
const OPENCODE_OPSX_COMMAND_RE = new RegExp(
  `^\\.opencode/commands/opsx-(?:${OPENCODE_OPSX_IDS.join('|')})\\.md$`,
)

/**
 * The pinned dist's shared `PROJECT_ROOT_GUARD` template's distinctive lead sentence,
 * interpolated verbatim into all but one of its workflow bodies (probed from the pinned
 * binary's own `init --tools opencode` output). Requiring this whole sentence, not only the
 * bare `` `openspec list --json` `` command reference it goes on to make, is itself part of
 * the provenance check: a user's own command that happens to document or invoke that same
 * command (e.g. "run `openspec list --json` and summarize each change") would otherwise
 * satisfy a bare-substring check while never containing this exact upstream boilerplate
 * sentence, which only the pinned dist's own generated bodies ever carry.
 */
const PROJECT_ROOT_GUARD_LEAD =
  '**Project check:** These steps expect a project that already uses OpenSpec.'

/**
 * OpenCode's command adapter emits frontmatter with only `description` — no `name`, no
 * `metadata` — so neither frontmatter marker `isOpsxLeftover` reads ever matches a real OpenCode
 * opsx leftover (probed from the pinned binary's own `init --tools opencode` output).
 * Detected instead by the combination the adapter's output always has: the exact path it
 * writes to (one of the 12 ids the dist ever generates), frontmatter with no key but
 * `description`, and the `PROJECT_ROOT_GUARD` lead sentence plus the literal bare
 * `` `openspec list --json` `` reference every opsx workflow body carries — a string
 * cospec's own shipped bodies never contain, since cospec always respells its own commands
 * as `cospec`, never bare `openspec`. The combination is provenance, not a path/name
 * convention: a hand-written `.opencode/commands/opsx-notes.md` with its own prose body, or
 * a user's own command at a path outside the 12 ids, never matches.
 */
export function isOpenCodeOpsxCommand(relpath: string, text: string): boolean {
  const { frontmatter, body } = splitFrontmatter(text)
  if (!OPENCODE_OPSX_COMMAND_RE.test(relpath)) return false
  if (frontmatter === null || typeof frontmatter !== 'object') return false
  const keys = Object.keys(frontmatter as Record<string, unknown>)
  if (keys.length !== 1 || keys[0] !== 'description') return false
  return body.includes(PROJECT_ROOT_GUARD_LEAD) && body.includes('`openspec list --json`')
}

/** Where OpenCode's current adapter writes commands; the shape test alone decides there. */
export const OPENCODE_COMMANDS_PREFIX = '.opencode/commands/'
