# Proposal

## Why

`yes | cospec config reset --all` reset the global config and then, on Linux,
sometimes exited 1 with `cospec: printed no answer line after its prompt`
instead of relaying the binary's `Configuration reset to defaults` and exit 0
(issue #58; the contract row flaked on `ci-bun`). The post-condition was right:
probing the wrapped call in a Linux container showed the answer line absent from
the child's stdout altogether, not merely unterminated — the config file reset,
exit 0, stdout ending in the prompt's last redraw. Under Bun the binary's
`console.log` writes past `process.stdout`'s queue, and when inquirer's redraws
(one per `y` a `yes` feeder sends) have backlogged a pipe, that line is lost at
exit; the redraws written through `process.stdout` all arrive.

## What Changes

- The handover preload routes `console.log`/`console.error` through
  `process.stdout.write`/`process.stderr.write`, as Node's console does, so
  every line the binary prints is queued behind its prompt output and flushed
  before it exits.
- `resetPiped`'s post-condition observes the binary's answer instead of a
  trailing byte: on exit 0 or 130 the last line of its stdout must be one of the
  binary's answer sentences (`Configuration reset to defaults`,
  `Reset cancelled.`); on exit 1 stderr must be non-empty, as before.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `apps/cli/src/core/handover-preload.ts` (preload source; new content address)
- `apps/cli/src/commands/config.ts` (`resetPiped` post-condition)
- `apps/cli/test/unit/core/handover-preload.test.ts` (mechanism regression)
- `docs/architecture.md`, `apps/docs/reference/configuration.md` (preload
  description)

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
