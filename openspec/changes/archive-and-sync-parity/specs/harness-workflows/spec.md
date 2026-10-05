# Spec Delta

## ADDED Requirements

### Requirement: The sync-specs workflow syncs through cospec sync-specs

The `sync-specs` workflow body SHALL do what upstream's `sync` workflow does,
merge a change's delta specs into the main specs without archiving it, and SHALL
do it only through the CLI: preview the merge (`cospec validate <slug>` and the
change's delta files), say which main specs will be created, changed or deleted,
then run `cospec sync-specs <slug>` and report its result. It SHALL NOT instruct
the agent to edit a main spec by hand, and SHALL NOT say that a mid-flight sync
is unsupported. It SHALL say that the merge is the archive's own, byte-for-byte,
so a refusal there is the same refusal archive would give, and that the change
stays active. The workflow's `harness.yaml` description SHALL say it merges a
change's delta specs into the main specs without archiving, and SHALL keep its
natural-phrasing triggers. The `archive` workflow body SHALL say that a change
whose specs were synced early archives as a no-op merge, with both hard gates
still run.

#### Scenario: The rendered sync-specs body runs the command

- **WHEN** the `sync-specs` workflow renders for every harness
- **THEN** each body instructs `cospec sync-specs <slug>` after a preview,
  carries no "no mid-flight sync" text, and names no bare `openspec` command

#### Scenario: The rendered archive body names the early-sync no-op

- **WHEN** the `archive` workflow renders
- **THEN** it says a change synced early with `/cospec:sync-specs` archives as a
  no-op merge and still passes both hard gates
