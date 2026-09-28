# Verification

## 1. The embedded bundle emits each `--json` document once [critical]

- [x] 1.1 @regression (agent) run the pack-standalone suite's embedded-bundle test before the fix -> fails: `cospec schemas --json` and the bundle's `new change --json` each print two documents -> red on the unfixed bundle: `cospec schemas --json` exited 1 with "the wrapped OpenSpec call `schemas --json` did not emit a single parseable JSON document on stdout" (1 pass, 1 fail); a direct run of the unfixed bundle for `new change --json` printed two identical documents
- [x] 1.2 @regression (agent) run the same test after regenerating the bundle -> passes: exactly one parseable document for the passthrough and for the bundle's `new change` call -> `mise run test:pack:standalone` 2 pass, 0 fail, 44 expect() calls
- [x] 1.3 @runtime (agent) run the regenerated bundle directly through the compiled binary in a sandbox for `schemas --json` and `new change --json` -> one document each, byte-identical in shape to the npm package's bin -> unfixed bundle printed two identical `schemas` documents (also through a symlinked path); fixed bundle printed one `schemas` document and one `new change` document, both parse whole; `--version` prints `1.13.1`

## 2. The build refuses a changed upstream entry

- [x] 2.1 @runtime (agent) run the bundle build against an entry whose self-run block is missing -> the build fails with a message naming the missing block -> sandbox copy of the package with the block rewritten: build exits non-zero with "expected exactly one main-module self-run block in …/dist/cli/index.js, found 0", no output file written
- [x] 2.2 @integration (agent) run `mise run vendor:openspec:check` on the committed bundle -> up to date -> "bundle and third-party notices up to date"; a plugin-free build through the same API is byte-identical to the previous committed bundle, so the only bundle change is the stripped block

## 3. Gates and docs

- [x] 3.1 @integration (agent) run `mise run check` and `mise run test:pack` -> green -> `mise run check` exit 0 (unit 1459, contract 828, integration 166 incl. pack-standalone, bench 339, release 14; all 0 fail); `mise run test:pack` 2 pass
- [x] 3.2 @manual (agent) check `apps/docs` for a page that states the embedded bundle's output behavior -> no page changes; the site already promises one document per `--json` call -> no `apps/docs` page describes the bundle build; `docs/architecture.md` gains a sentence on the single-run transform
