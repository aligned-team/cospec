# Verification

## 1. The embedded bundle emits each `--json` document once [critical]

- [ ] 1.1 @regression (agent) run the pack-standalone suite's embedded-bundle test before the fix -> fails: `cospec schemas --json` and the bundle's `new change --json` each print two documents
- [ ] 1.2 @regression (agent) run the same test after regenerating the bundle -> passes: exactly one parseable document for the passthrough and for the bundle's `new change` call
- [ ] 1.3 @runtime (agent) run the regenerated bundle directly through the compiled binary in a sandbox for `schemas --json` and `new change --json` -> one document each, byte-identical in shape to the npm package's bin

## 2. The build refuses a changed upstream entry

- [ ] 2.1 @runtime (agent) run the bundle build against an entry whose self-run block is missing -> the build fails with a message naming the missing block
- [ ] 2.2 @integration (agent) run `mise run vendor:openspec:check` on the committed bundle -> up to date

## 3. Gates and docs

- [ ] 3.1 @integration (agent) run `mise run check` and `mise run test:pack` -> green
- [ ] 3.2 @manual (agent) check `apps/docs` for a page that states the embedded bundle's output behavior -> no page changes; the site already promises one document per `--json` call
