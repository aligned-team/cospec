#!/usr/bin/env bun
// Generate THIRD-PARTY-LICENSES.md for the vendored openspec bundle.
//
// The compiled cospec binary embeds a `bun build` bundle of the pinned
// `@fission-ai/openspec` CLI (apps/cli/src/vendor/openspec.bundle.js.tpl), which
// inlines openspec plus its production dependency closure. `bun --minify` strips
// the upstream LICENSE files that MIT/ISC require to travel with a redistributed
// copy, so this script reproduces each bundled package's copyright + permission
// notice into a single file that ships in every package and release archive.
//
// It emits the FULL declared production closure of the pinned openspec — a safe
// superset of what tree-shaking keeps in the bundle (over-inclusion never
// breaches a license; under-inclusion does). Output is written to stdout;
// `scripts/mise-tasks/vendor/openspec` writes it to the committed file and
// drift-checks it, so it is byte-deterministic for a given lockfile.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const scriptDir = import.meta.dir
const repoRoot = join(scriptDir, '..', '..', '..')
const cliDir = join(repoRoot, 'apps', 'cli')

interface Pkg {
  name: string
  version: string
  license: string
  notice: string
}

// Canonical permission bodies (no copyright line — that is prepended per
// package) for packages whose published tarball ships no license file.
const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const ISC_BODY = `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`

function resolvePkgDir(spec: string, fromDir: string): string | undefined {
  try {
    return dirname(Bun.resolveSync(`${spec}/package.json`, fromDir))
  } catch {
    return undefined
  }
}

function authorHolder(manifest: Record<string, unknown>): string {
  const author = manifest.author
  if (typeof author === 'string' && author.length > 0) return author
  if (author !== null && typeof author === 'object') {
    const name = (author as { name?: unknown }).name
    if (typeof name === 'string' && name.length > 0) return name
  }
  return `the ${String(manifest.name)} authors`
}

// The verbatim upstream license text if the package ships one, else a
// synthesized copyright + permission notice from its declared SPDX id.
function noticeFor(dir: string, manifest: Record<string, unknown>): string {
  const files = readdirSync(dir).toSorted()
  const licenseFile = files.find((f) => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(f))
  if (licenseFile !== undefined) {
    // Normalize CRLF/CR to LF: some upstream license files ship with Windows
    // endings, but the committed notices file is LF (git's autocrlf/normalization
    // stores LF), so the drift gate would fail on a fresh checkout if the
    // generator reproduced CRLF. Deterministic, EOL-independent output.
    return readFileSync(join(dir, licenseFile), 'utf8').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  }
  const license = String(manifest.license ?? '')
  const holder = authorHolder(manifest)
  if (license === 'MIT') return `MIT License\n\nCopyright (c) ${holder}\n\n${MIT_BODY}`
  if (license === 'ISC') return `ISC License\n\nCopyright (c) ${holder}\n\n${ISC_BODY}`
  return `Copyright (c) ${holder}\n\nLicensed under ${license || 'its declared license'}.`
}

function collect(): Pkg[] {
  const start = resolvePkgDir('@fission-ai/openspec', cliDir)
  if (start === undefined) {
    throw new Error('could not resolve @fission-ai/openspec from apps/cli — run `bun install`')
  }
  const seen = new Map<string, Pkg>()
  const walk = (dir: string): void => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    const name = String(manifest.name)
    const version = String(manifest.version)
    const key = `${name}@${version}`
    if (seen.has(key)) return
    seen.set(key, {
      name,
      version,
      license: String(manifest.license ?? 'UNKNOWN'),
      notice: noticeFor(dir, manifest),
    })
    const deps = manifest.dependencies
    if (deps !== null && typeof deps === 'object') {
      for (const dep of Object.keys(deps)) {
        const depDir = resolvePkgDir(dep, dir)
        if (depDir !== undefined) walk(depDir)
      }
    }
  }
  walk(start)
  return [...seen.values()].toSorted((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  )
}

function render(pkgs: Pkg[]): string {
  const header = `# Third-party licenses

The \`cospec\` standalone binaries embed a \`bun build\` bundle of the pinned
\`@fission-ai/openspec\` CLI, which inlines openspec and its production
dependency closure. This file reproduces the copyright and permission notices
for every bundled package, as required by their MIT/ISC licenses. It is a
generated, drift-gated file — run \`mise run vendor:openspec\` to regenerate it,
never edit it by hand.

${pkgs.length} packages are covered (the full declared production closure of the
pinned openspec; a superset of what the minified bundle retains).
`
  const sections = pkgs.map(
    (p) => `## ${p.name}@${p.version} — ${p.license}\n\n\`\`\`\n${p.notice}\n\`\`\``,
  )
  return `${[header, ...sections].join('\n\n')}\n`
}

process.stdout.write(render(collect()))
