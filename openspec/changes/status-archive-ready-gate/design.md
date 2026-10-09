# Design

## Context

`archiveReady` is documented as archive-readiness and exists so automation can
decide whether `cospec archive` will proceed. Three places compute inputs to
that decision independently:

- `commands/status.ts` computes
  `archiveReady = requiredDone && tasksDone && gate.state === 'clear'`.
  `requiredDone` is `artifactDone` over the schemaVersion-filtered required
  artifacts, and `artifactDone('verification')` is only "the file exists". The
  verdict (`computeVerificationVerdict`) is computed after the flag and is never
  fed back into it.
- `commands/list.ts` repeats the formula with no verification input, and reads
  the unfiltered `TYPE_ARTIFACTS[type].applyRequires` rather than
  `enforcedApplyRequires(type, schemaVersion)`, so it also disagrees with
  `status` on a grandfathered change.
- `commands/archive.ts` gates on
  `computeVerificationVerdict(true, text) .blockedReasons.length > 0`, but only
  when `enforcedApplyRequires` includes `verification`.

So the flag and the gate read different inputs, and `list` and `status` read
different `apply.requires` sets.

## Goals / Non-Goals

**Goals:**

- `archiveReady` is false whenever the verification gate would refuse
  (`verification.blockedReasons` non-empty), in `status` and `list`, and true
  again once every row is `[x]` or `[~] ... -> defer: ...`.
- `status` and `list` agree for the same change, including grandfathered v1
  changes and the types that forbid or do not require `verification`.
- One definition of the formula, so the two commands cannot drift again.

**Non-Goals:**

- Modelling `archive/scenario-preservation` or validation errors outside
  `verification.md` (delta specs, proposal, design) in `archiveReady`. The docs
  state what the flag covers instead.
- Changing `Next:`; it follows the documented algorithm (`cospec apply <id>`
  once every required artifact exists).
- Changing any JSON key or text-line shape; only the flag's value changes.

## Decisions

1. **Fold the verdict into the flag; do not add a new key.** The issue's
   recommended option: `archiveReady` becomes
   `requiredDone && tasksDone && gate.state === 'clear' && verdict.blockedReasons.length === 0`.
   The verdict is already grandfather-aware (`declared` is
   `applyRequires.has('verification')` and an undeclared verdict has no
   reasons), so v1 changes and types that forbid or omit `verification` are
   unaffected. Rejected: a separate `verificationReady` key. It would leave
   `archiveReady` lying and force every consumer to learn the extra key (and
   JSON documents are additive-only).
2. **One helper, `isArchiveReady`, beside `computeGate` in
   `commands/apply.ts`**, taking `{ requiredDone, tasks, gate, verdict }`.
   `status` and `list` both call it. `apply.ts` already owns the gate,
   `artifactDone` and the tasks rules that `list` imports. Rejected: a core
   module, since the helper needs the `Gate` type and sits with the gate it
   summarises.
3. **One reader, `readVerificationVerdict(changeDir, change, applyRequires)`, in
   `core/verification-verdict.ts`**, reading `verification.md` when present,
   calling `computeVerificationVerdict` (unresolved and unparseable rows, the
   archive gate's own computation) and adding one reason per `verification/*`
   ERROR that `verificationRules` raises at `strict: false` (`structure`,
   `deferred-reason`, `evidence-required`, `layer-unknown`, `owner-unknown` and
   the per-type required rows), which is what `cospec archive`'s validation step
   refuses on. `row-grammar` is skipped (already the "do not parse" reason) and
   WARNINGs are skipped (a surface-promoted row rule is an ERROR under
   `--strict` only, and archive validates without it). It lives apart from
   `core/verification.ts` because the rules import that parser. `status` and
   `list` use it; `archive`'s hard gate keeps `computeVerificationVerdict` and
   its own read because it also lists the offending rows, and `--no-validate`
   still skips validation's ledger rules as before.
4. **`list` adopts `status`'s required set.** `list` reads the change's
   `schemaVersion` from `.openspec.yaml` and uses `enforcedApplyRequires`, so
   the two commands agree on a grandfathered change (the gates already do).
5. **Docs ownership.** The archive-readiness fact is owned by the
   `cospec status` row of `apps/docs/reference/commands.md`; the `list` row
   links to it in words rather than restating it. `docs/architecture.md` only
   mentions archive-readiness in passing and needs no change.

## Risks / Trade-offs

- [Consumers that treated `archiveReady: true` as "tasks done" see it flip to
  false while verification rows remain] -> this is the intended correction and
  is called out as a value-only BREAKING note in the proposal.
- [The flag still ignores `archive/scenario-preservation` and validation errors
  outside `verification.md`] -> documented on the owning docs page; a change can
  still be refused by those gates.
- [`list` now reads one more file per change] -> only for cospec-typed,
  non-empty changes whose schemaVersion enforces `verification`.

## Operational surface

The interactive surface here is CLI output only (`cospec status` and
`cospec list`, text and `--json`). There is no bind address, container-vs-runner
choice, required secret, connection limit or binary arch involved: both commands
run from the installed package, read only the change directory's files, and make
no wrapped-binary call beyond what `list` already delegates.
