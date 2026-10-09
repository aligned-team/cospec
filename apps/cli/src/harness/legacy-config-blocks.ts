// The pre-opsx OpenSpec block in a project-root config file (workflow-profiles design D9),
// ported from the pinned binary's `core/legacy-cleanup.js` and `utils/file-system.js`. The
// binary never deletes such a file: it strips the block and writes the rest back, empty when
// nothing else was there. `init --remove-opsx` (or `--yes`) does the same; without consent the
// files are only listed.

import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isInsideNestedCheckout, isOutsideProject } from './scan-walk.ts'

/** `LEGACY_CONFIG_FILES`, in the binary's order. */
export const LEGACY_CONFIG_FILES: readonly string[] = [
  'CLAUDE.md',
  'CLINE.md',
  'CODEBUDDY.md',
  'COSTRICT.md',
  'QODER.md',
  'IFLOW.md',
  'AGENTS.md',
  'QWEN.md',
]

const MARKERS = { start: '<!-- OPENSPEC:START -->', end: '<!-- OPENSPEC:END -->' }

/** `hasOpenSpecMarkers`: both markers present anywhere, inline mentions included. */
export function hasOpenSpecMarkers(content: string): boolean {
  return content.includes(MARKERS.start) && content.includes(MARKERS.end)
}

function isMarkerOnOwnLine(content: string, markerIndex: number, markerLength: number): boolean {
  let left = markerIndex - 1
  while (left >= 0 && content[left] !== '\n') {
    const char = content[left]
    if (char !== ' ' && char !== '\t' && char !== '\r') return false
    left--
  }
  let right = markerIndex + markerLength
  while (right < content.length && content[right] !== '\n') {
    const char = content[right]
    if (char !== ' ' && char !== '\t' && char !== '\r') return false
    right++
  }
  return true
}

function findMarkerIndex(content: string, marker: string, fromIndex = 0): number {
  let current = content.indexOf(marker, fromIndex)
  while (current !== -1) {
    if (isMarkerOnOwnLine(content, current, marker.length)) return current
    current = content.indexOf(marker, current + marker.length)
  }
  return -1
}

/**
 * `removeMarkerBlock`: the whole start-to-end line range goes when both markers stand alone on
 * their lines, runs of three or more newlines collapse to two, and the rest is trimmed at the
 * end and keeps the file's `\r\n` or `\n` style. A file that is only the block becomes empty.
 */
export function removeMarkerBlock(content: string): string {
  const startIndex = findMarkerIndex(content, MARKERS.start)
  const endIndex =
    startIndex !== -1
      ? findMarkerIndex(content, MARKERS.end, startIndex + MARKERS.start.length)
      : findMarkerIndex(content, MARKERS.end)
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return content
  let lineStart = startIndex
  while (lineStart > 0 && content[lineStart - 1] !== '\n') lineStart--
  let lineEnd = endIndex + MARKERS.end.length
  while (lineEnd < content.length && content[lineEnd] !== '\n') lineEnd++
  if (lineEnd < content.length && content[lineEnd] === '\n') lineEnd++
  const result = (content.substring(0, lineStart) + content.substring(lineEnd)).replace(
    /(\r?\n){3,}/g,
    '\n\n',
  )
  if (result.trimEnd() === '') return ''
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  return result.trimEnd() + newline
}

export interface LegacyConfigBlock {
  relpath: string
  /** What stripping the block leaves; equal to the file's text when no marker stands alone. */
  stripped: string
  text: string
}

/**
 * The root config files holding a legacy block, in the binary's order. A file that is a link
 * leaving the project, or inside a nested checkout, is not this project's to edit and is
 * skipped, as the opsx scan skips it; one that is not a regular file is not read.
 */
export function findLegacyConfigBlocks(cwd: string): LegacyConfigBlock[] {
  const cwdReal = realpathSync(cwd)
  const out: LegacyConfigBlock[] = []
  for (const relpath of LEGACY_CONFIG_FILES) {
    const abs = join(cwd, relpath)
    let isFile: boolean
    try {
      isFile = statSync(abs).isFile()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!isFile || isOutsideProject(cwdReal, abs) || isInsideNestedCheckout(cwd, cwdReal, abs)) {
      continue
    }
    const text = readFileSync(abs, 'utf8')
    if (hasOpenSpecMarkers(text)) out.push({ relpath, text, stripped: removeMarkerBlock(text) })
  }
  return out
}

/**
 * Writes each file back without its block, never deleting one (an empty result is written
 * empty). A file whose markers are only inline mentions comes back byte-identical and is left
 * unwritten; the returned list names the files whose content changed.
 */
export function stripLegacyConfigBlocks(
  cwd: string,
  blocks: readonly LegacyConfigBlock[],
): string[] {
  const changed: string[] = []
  for (const block of blocks) {
    if (block.stripped === block.text) continue
    writeFileSync(join(cwd, block.relpath), block.stripped)
    changed.push(block.relpath)
  }
  return changed
}
