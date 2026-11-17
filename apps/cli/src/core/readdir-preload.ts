// The script Bun preloads ahead of the wrapped binary on every wrapped call,
// first: it makes the binary's directory listings come back in Node's order.
//
// Under Node, a non-recursive `fs.readdir`, `fs.readdirSync` or
// `fs.promises.readdir` returns a directory's entries sorted by the bytes of
// each name — libuv's Unix `scandir` sorts them with `strcmp` — while libuv on
// Windows does not sort. Bun returns the filesystem's own order on every
// platform, so each list OpenSpec builds from a listing (`Available changes`,
// spec and schema discovery) came out of cospec in another order than OpenSpec
// prints it, wherever the filesystem does not keep names sorted (APFS and ext4
// store them by hash). The preload sorts each result as `strcmp` does: by the
// UTF-8 bytes of the name (bytes as they are, a Dirent by its name). It leaves
// Windows alone, and recursive reads, which the pinned dist never makes — a
// contract row enumerates the dist's directory listings and fails a pin that
// reaches for one, or for `opendir` or `fs.glob`.
//
// It patches `fs` through `require()`, before anything imports `node:fs` as an
// ES module: Bun builds a builtin's ES-module namespace from its CommonJS
// exports on first import and never re-syncs it (`syncBuiltinESMExports` does
// nothing), and its runtime plugins cannot intercept a builtin. Patched first,
// every import form the dist uses — the `node:fs` and `fs` namespaces,
// `promises`, `node:fs/promises`, named imports — sees the sorted functions.
// So it is CommonJS, and it runs ahead of every other preload.

import { materializePreload, type PreloadFile, writePreloadInto } from './preload-file.ts'

/** The preload's source: CommonJS, run by the child's Bun before anything else. */
export const READDIR_PRELOAD_SOURCE = `// cospec: list directories in Node's order, sorted by the bytes of each name.
'use strict'
if (process.platform !== 'win32') {
  const fs = require('node:fs')
  const fsPromises = require('node:fs/promises')
  // A name is a string, or bytes (Bun answers \`encoding: 'buffer'\` with Uint8Arrays);
  // a Dirent carries one as its \`name\`.
  const bytesOf = (entry) => {
    if (entry instanceof Uint8Array) return entry
    if (typeof entry === 'object' && entry !== null) return bytesOf(entry.name)
    return Buffer.from(String(entry))
  }
  const byBytes = (a, b) => Buffer.compare(bytesOf(a), bytesOf(b))
  const recursive = (options) =>
    typeof options === 'object' && options !== null && options.recursive === true
  const sorted = (entries, options) =>
    Array.isArray(entries) && !recursive(options) ? entries.sort(byBytes) : entries

  const readdirSync = fs.readdirSync
  fs.readdirSync = function (path, options) {
    return sorted(readdirSync.apply(this, arguments), options)
  }

  const readdir = fs.readdir
  fs.readdir = function (...args) {
    const callback = args[args.length - 1]
    if (typeof callback !== 'function') return readdir.apply(this, args)
    const options = args.length > 2 ? args[1] : undefined
    args[args.length - 1] = (error, entries) =>
      callback(error, error == null ? sorted(entries, options) : entries)
    return readdir.apply(this, args)
  }

  const promisesReaddir = fsPromises.readdir
  const sortedPromisesReaddir = async function (path, options) {
    return sorted(await promisesReaddir.apply(this, arguments), options)
  }
  fsPromises.readdir = sortedPromisesReaddir
  if (fs.promises !== fsPromises) fs.promises.readdir = sortedPromisesReaddir
}
`

const READDIR_PRELOAD: PreloadFile = {
  stem: 'readdir-preload',
  extension: 'cjs',
  source: READDIR_PRELOAD_SOURCE,
}

/** Writes the readdir preload into `root` (see `writePreloadInto`) and returns its path. */
export function writeReaddirPreloadInto(root: string): string {
  return writePreloadInto(root, READDIR_PRELOAD)
}

/** The readdir preload's path, in cospec's cache or its temp-dir fallback (`materializePreload`). */
export function readdirPreload(): string {
  return materializePreload(READDIR_PRELOAD)
}
