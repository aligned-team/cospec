## Why

The artifact-matrix expansion (`verification`, `## Surfaces`, `schemaVersion`
grandfathering) shipped and updated `CLAUDE.md`/`AGENTS.md`, but both READMEs
still describe the five-artifact matrix and never mention verification. New
readers get a stale picture of what the tool enforces.

## What Changes

- `README.md` — add the `verification` column to the type table and extend the
  footnote; fold verification, `## Surfaces` triggers, and `schemaVersion`
  grandfathering into the wrapper paragraph, the commands table
  (`cospec migrate`, doctor's v1 listing), the workflow steps, and the OpenSpec
  adds-list.
- `apps/cli/README.md` — add the verification ledger to the one-line adds-list
  so the package summary matches.

## Impact

Documentation only — no code, schemas, or managed files touched. Mirrors facts
already in `apps/cli/src/core/rules/type-facts.ts`, `docs/schemas.md`, and the
shared agent block.
