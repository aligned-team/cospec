// Build the vendored single-file openspec bundle (called by
// scripts/mise-tasks/vendor/openspec). Usage: bun run openspec-bundle.ts <bin-entry> <outfile>
//
// openspec starts its CLI from two places: `bin/openspec.js` calls `runCli()`,
// and `dist/cli/index.js` ends with a main-module self-run that calls it again
// when `process.argv[1]` resolves to its own `import.meta.url`. In the npm
// layout those are two files, so only the bin call runs. Folded into one
// bundle, `import.meta.url` IS the bundle, the self-run fires too, and every
// command runs twice (two `--json` documents, side effects doubled). The
// self-run block is stripped at load time so the bin's own call is the only
// run; the build fails unless the block is found exactly once, so an upstream
// rewrite can never ship a bundle that runs twice or not at all.

import { dirname, join } from 'node:path'

const SELF_RUN_BLOCK =
  'if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {\n' +
  '    runCli();\n' +
  '}\n'

const [binEntry, outfile] = process.argv.slice(2)
if (binEntry === undefined || outfile === undefined) {
  console.error('usage: openspec-bundle.ts <bin-entry> <outfile>')
  process.exit(2)
}

const cliModule = join(dirname(dirname(binEntry)), 'dist', 'cli', 'index.js')

/** Remove the one self-run block from openspec's CLI module source. */
function stripSelfRun(source: string, file: string): string {
  const count = source.split(SELF_RUN_BLOCK).length - 1
  if (count !== 1)
    throw new Error(
      `vendor:openspec: expected exactly one main-module self-run block in ${file}, ` +
        `found ${count} — the openspec CLI entry changed shape; re-probe before re-vendoring`,
    )
  return source.replace(SELF_RUN_BLOCK, '')
}

let stripped = 0
const result = await Bun.build({
  entrypoints: [binEntry],
  target: 'bun',
  minify: true,
  plugins: [
    {
      name: 'openspec-single-run',
      setup(build) {
        build.onLoad({ filter: /[\\/]dist[\\/]cli[\\/]index\.js$/ }, async (args) => {
          if (args.path !== cliModule) return undefined
          const source = await Bun.file(args.path).text()
          stripped += 1
          return { contents: stripSelfRun(source, args.path), loader: 'js' }
        })
      },
    },
  ],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
// The transform must have run: a resolved path that never matched `cliModule`
// would otherwise build the double-running bundle without complaint.
if (stripped !== 1) {
  console.error(`vendor:openspec: the self-run transform ran ${stripped} times on ${cliModule}`)
  process.exit(1)
}
const [artifact] = result.outputs
if (artifact === undefined || result.outputs.length !== 1) {
  console.error(`vendor:openspec: expected one bundle output, got ${result.outputs.length}`)
  process.exit(1)
}
await Bun.write(outfile, artifact)
