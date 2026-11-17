// The files Bun preloads ahead of the wrapped binary (`--preload <file>`): the
// readdir preload on every wrapped call (`readdir-preload.ts`) and the handover
// preload wherever the binary may prompt (`handover-preload.ts`). Each is plain
// JavaScript cospec writes content-addressed to its cache, or — when that
// directory cannot be written — to a directory of this process's own under the
// temp dir, removed when the process exits, so a read-only cache never stops a
// wrapped call.

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cacheRoot } from './openspec-embedded.ts'

/** One preload: what it is called, how Bun loads it, and its source. */
export interface PreloadFile {
  /** The file name's stem, e.g. `handover-preload`; the content digest follows it. */
  stem: string
  /** `mjs` for an ES module, `cjs` for CommonJS. */
  extension: 'mjs' | 'cjs'
  source: string
}

/**
 * Writes `file` into `root` (content-addressed, atomic, self-healing like the
 * embedded bundle's extraction) and returns its path. Throws when the file on
 * disk does not hold the source afterwards.
 */
export function writePreloadInto(root: string, file: PreloadFile): string {
  const digest = createHash('sha256').update(file.source).digest('hex')
  const path = join(root, `${file.stem}-${digest.slice(0, 16)}.${file.extension}`)
  if (existsSync(path) && readFileSync(path, 'utf8') === file.source) return path
  mkdirSync(root, { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, file.source)
  renameSync(tmp, path)
  if (!existsSync(path) || readFileSync(path, 'utf8') !== file.source)
    throw new Error(`cospec: could not write the preload file ${path}`)
  return path
}

/** The `errno` codes that mean a directory cannot take a preload's file. */
const UNWRITABLE = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOTDIR', 'EEXIST'])

function isUnwritable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code !== undefined && UNWRITABLE.has(code)
}

let fallbackDir: string | undefined

/**
 * `file`'s path: in cospec's cache (`${XDG_CACHE_HOME:-~/.cache}/cospec`), or —
 * when that directory cannot be written — in this process's own directory under
 * the temp dir, removed when the process exits.
 */
export function materializePreload(file: PreloadFile): string {
  try {
    return writePreloadInto(cacheRoot(), file)
  } catch (error) {
    if (!isUnwritable(error)) throw error
  }
  if (fallbackDir === undefined) {
    const dir = mkdtempSync(join(tmpdir(), 'cospec-preload-'))
    process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
    fallbackDir = dir
  }
  return writePreloadInto(fallbackDir, file)
}
