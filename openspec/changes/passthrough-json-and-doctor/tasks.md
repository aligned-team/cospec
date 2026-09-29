# Tasks

Each group is one roadmap track and owns the files it names exclusively while it
runs; groups run in order. Every task ends in its own commit (conventional
`test(cli)`, `fix(cli)` or `docs(cli)`, never `--no-verify`), after
`mise run check` is green for the files it touched. Upstream strings in tests
come from `test/contract/support/upstream-oracle.ts` at test time, never a
hand-typed copy (design D12).

## 1. Tests first — every regression and differential row lands failing

Files: `apps/cli/test/contract/passthrough-json.test.ts` (new),
`apps/cli/test/contract/doctor-parity.test.ts` (new),
`apps/cli/test/contract/handover-prevalidation.test.ts` (new),
`apps/cli/test/unit/json-envelope.test.ts` (new),
`apps/cli/test/integration/doctor-relationship.test.ts`,
`apps/cli/test/integration/workset.test.ts`,
`apps/cli/test/integration/store.test.ts`, `apps/cli/test/unit/cli.test.ts`,
`apps/cli/test/unit/commands/config-args.test.ts`.

- [x] 1.1 Add `passthrough-json.test.ts` with ledger rows 1.1–1.4, 3.1–3.5,
      4.1–4.3, 5.1–5.3 and 7.1–7.2 as `test.failing` (the post-rebase rows 3.x
      and 7.x stay failing until group 9, one test per command and mode so each
      flips independently when the resolver's check lands at 9.1 and cospec's
      own at 9.2; `cospec -- workset --bogus` runs through the published bin),
      and verify each fails for the recorded "before" reason, not a fixture
      error; commit
      `test(cli): pin passthrough group refusals and relays against the binary`
- [x] 1.2 Add `doctor-parity.test.ts` with ledger rows 2.1–2.3, 2.5 and 2.7 as
      `test.failing` — the key oracle comparing `cospec doctor --json` with
      `oracleJson(['doctor', '--json'], root)` on the plain, references,
      `--store`, broken-store, `config.yml`, no-root and subdirectory fixtures —
      and verify each fails on the missing keys or findings; commit
      `test(cli): add doctor key oracle against openspec doctor --json`
- [x] 1.3 Add `handover-prevalidation.test.ts` with ledger rows 1.5, 1.6,
      6.1–6.4 as `test.failing`: the refusal-argv matrix for `workset open`,
      `config edit`, `config profile`, `config reset --all` (unknown option,
      dangling `--tool`, missing name, excess argument, short clusters,
      `--store-path`, with and without `--json`) differentially against the
      binary, with a spawn-recording stub asserting no handover child; verify
      each fails on today's handover; commit
      `test(cli): pin terminal-handover pre-validation against the binary`
- [x] 1.4 Add `test/unit/json-envelope.test.ts` with ledger rows 2.6, 4.4, 6.5
      and 6.6 as `test.failing` (doctor envelope and WARNING remedy,
      `respellLines` positives and negatives, pre-flight decisions with injected
      interactivity, the `workset open` handover env) and verify each fails on a
      missing export or the old behaviour; commit
      `test(cli): add unit rows for passthrough envelopes and respell rules`
- [x] 1.5 Invert the existing rows that encode the defect —
      `doctor-relationship.test.ts` "a local repo with no store and no
      references skips the delegated section entirely" (ledger 2.4);
      `workset.test.ts` "never threads --json onto the handover exec", "an
      unknown subcommand fails", "missing subcommand fails" and
      `store.test.ts`'s `unknown subcommand 'bogus'` row (ledger 1.2–1.5);
      `unit/cli.test.ts`'s `store help` / `workset help` rows (the binary's
      `Unknown command 'help' for 'cospec store'`, respelled) and its bare
      `config --` row (cospec's `config` help on stderr, ledger 5.2); and the
      `config-args.test.ts` missing-subcommand plan (ledger 5.2) — as
      `test.failing` asserting the corrected behaviour, and verify they fail;
      commit
      `test(cli): invert integration rows that encoded the passthrough defects`

## 2. Shared core (T7)

Files: `apps/cli/src/core/forward-relay.ts`, `apps/cli/src/core/remedies.ts`,
`apps/cli/src/core/command-table.ts` (one export),
`apps/cli/test/unit/core/forward-relay.test.ts`,
`apps/cli/test/unit/core/remedies.test.ts`,
`apps/cli/test/unit/core/command-table.test.ts`,
`apps/cli/test/contract/support/remedy-sources.ts`.

- [x] 2.1 Add `relayGroupRefusal(ctx, group, args)` to `forward-relay.ts`
      (design D1: spawn `<group> [--json] <argv>` with the `--` kept, exit code
      `1`, post-condition "commander parse rejection or one document whose
      `status[0].code` is the group's unknown-subcommand code", relay through
      `respellRemedies`) with unit rows for the post-condition, and verify a
      stubbed answer of any other shape raises a wrapped-call error; commit
      `fix(cli): relay a forwarded group's own subcommand refusal`
- [x] 2.2 Add `respellLines(text, ids)` to `remedies.ts` (design D5) and the
      `config/profile-interactive-required` sentence (design D9), move that
      line's `REMEDY_SOURCES` row from `notRelayed.PROFILE_HANDOVER` to the new
      id, and verify `remedies.test.ts` whole-line rows and
      `remedy-enumeration.test.ts` pass; commit
      `fix(cli): add whole-line respell and the profile interactive-mode sentence`
- [x] 2.3 Export a one-surface parser from `command-table.ts` (the existing
      `parseSurface`, for one row and one subcommand) and add
      `prevalidateHandover(row, sub, args)` to `forward-relay.ts` returning the
      table parser's refusal or none, and verify unit rows for each handover
      leaf's refusal text; commit
      `fix(cli): parse a terminal-handover leaf's argv before the handover`

## 3. Store (T2)

Files: `apps/cli/src/commands/store.ts`.

- [x] 3.1 Route a missing, unknown, option-shaped or `--`-guarded first token
      through `relayGroupRefusal`, and verify ledger rows 1.1 and 1.2 flip from
      `test.failing` to `test` and pass; commit
      `fix(store): answer a missing or unknown subcommand with the binary's refusal`
- [x] 3.2 Spell every rendered and relayed diagnostic through cospec (design D4:
      `fix` on a successful payload; `message` and `fix` on a failed one), text
      and `--json`, and verify ledger row 4.1 flips and passes; commit
      `fix(store): spell relayed store diagnostics through cospec`

## 4. Workset (T1)

Files: `apps/cli/src/commands/workset.ts`,
`apps/cli/test/contract/support/remedy-sources.ts`.

- [x] 4.1 Route a missing, unknown, option-shaped or `--`-guarded first token
      through `relayGroupRefusal`, and run `workset open` under `--json` as the
      piped call of design D2, and verify ledger rows 1.3–1.6 flip and pass
      (including the inverted `workset.test.ts` rows); commit
      `fix(workset): relay the binary's group refusals and refuse open --json`
- [x] 4.2 Spell the `workset create` and empty `workset list` next-step lines
      through `respellLines` (`workset/open-any-time`, `workset/none-saved`),
      remove `REACHABLE_OWNED` rows 8–9 (design, parity section), and verify
      ledger row 4.2 flips and passes and `remedy-enumeration.test.ts` stays
      green; commit
      `fix(workset): spell the binary's next-step lines through cospec`
- [x] 4.3 Pre-validate the `workset open` handover in design D8's order (parse
      refusal via `prevalidateHandover`, ported `isInteractive`, the read-only
      `workset list --json` pre-flight answering an unsaved or member-less
      workset through the piped call) and add `OPENSPEC_NO_COMPLETIONS=1` to its
      env, and verify ledger rows 6.1 (workset leaf), 6.3, 6.5 (workset half)
      and 6.6 flip and pass; commit
      `fix(workset): pre-validate workset open before handing the terminal over`

## 5. Doctor (T3)

Files: `apps/cli/src/commands/doctor.ts`.

- [x] 5.1 Run the delegated `openspec doctor --json` on every root and carry its
      `root`, `store`, `references` and `status` keys in the `--json` document
      (design D3), keeping the `openspec-root` INFO condition, and verify ledger
      rows 2.1, 2.2 and 2.4 flip and pass; commit
      `fix(doctor): fold openspec doctor --json on every root`
- [x] 5.2 Spell folded remedies and the carried `fix`/`message` fields through
      cospec (design D4 rule, both delegated calls), and verify the
      `doctor-parity.test.ts` respelled fields match and no doctor fixture
      prints a bare command; commit
      `fix(doctor): spell folded OpenSpec remedies through cospec`
- [x] 5.3 Read `openspec/config.yaml` else `openspec/config.yml` in
      `checkConfig` and the references probe, naming the file read, and verify
      ledger row 2.3 flips and passes; commit
      `fix(doctor): read config.yml as OpenSpec does`
- [x] 5.4 Name `cospec doctor --json` in the delegated call's failure remedy and
      keep the binary's no-root diagnostic in `status` without folding it when
      `initialized` fails, and verify ledger rows 2.5 and 2.6 flip and pass;
      commit
      `fix(doctor): name cospec in the relationship-report hint and report no root once`

## 6. Config (T4)

Files: `apps/cli/src/commands/config.ts`,
`apps/cli/test/contract/support/remedy-sources.ts`.

- [x] 6.1 Return the relayed commander parse rejection before any cospec
      envelope in `runPiped`, and verify ledger row 5.1 flips and passes; commit
      `fix(config): relay the binary's parse refusal ahead of the JSON envelope`
- [x] 6.2 Answer a missing subcommand with cospec's `config` help on stderr,
      exit 1, and relay the binary's `--json` refusal under `--json` (design
      D7), and verify ledger rows 5.2 and 5.3 flip and pass; commit
      `fix(config): print cospec's config help when no subcommand is given`
- [x] 6.3 Spell `config profile <preset>`'s next-step line through
      `respellLines` (`config/profile-applied`), remove `REACHABLE_OWNED` row
      10, and verify ledger row 4.3 flips and passes; commit
      `fix(config): spell the profile preset's next step through cospec`
- [x] 6.4 Pre-validate the three config handover leaves in design D8's order
      (parse refusal ahead of the `--json` envelope; `config profile` piped when
      stdout is not a TTY; the piped `config profile` pre-flight for an
      unreadable config), and verify ledger rows 6.1 (config leaves), 6.2, 6.4
      and 6.5 (config half) flip and pass; commit
      `fix(config): pre-validate the interactive config leaves before the handover`

## 7. The handover residual

Files: `apps/cli/test/contract/support/remedy-sources.ts`, and whichever record
the orchestrator rules for (design D11).

- [x] 7.1 Give each dist line design D11 enumerates a
      `notRelayed.HANDOVER_SESSION` reason naming its leaf, rewrite
      `notRelayed.TIP` (every spawn sets `OPENSPEC_NO_COMPLETIONS=1`), and
      verify `remedy-enumeration.test.ts` passes and that each residual line is
      reachable only on the interactive path (ledger 6.7 walk-through notes);
      commit `test(cli): classify the terminal-handover residual`
- [x] 7.2 Record the residual as the orchestrator rules on design D11 —
      recommended: the `remedy-sources.ts` reasons from 7.1 plus the docs
      passage of task 8.4, `exceptions.yaml` untouched; otherwise the ruled
      record with the reachability test's exactly-one assertion amended in the
      same commit — and verify `reachability.test.ts` and
      `remedy-enumeration.test.ts` pass; commit
      `docs(cli): record the terminal-handover residual`

## 8. Docs

Files: `apps/docs/reference/commands.md`, `apps/docs/concepts/stores.md`,
`apps/docs/reference/configuration.md`, `docs/stores.md`,
`docs/architecture.md`, `.agents/shared.md`, `CLAUDE.md`, `AGENTS.md`,
`openspec/specs/openspec-relationship-health/spec.md` (Purpose only).

- [x] 8.1 Update the `doctor`, `store`, `workset`, `config` and `context` rows
      of `apps/docs/reference/commands.md` (ledger 9.1) and verify every changed
      fact is stated only there and linked elsewhere; commit
      `docs(cli): document passthrough JSON and doctor parity in commands`
- [x] 8.2 Update `apps/docs/concepts/stores.md` (doctor on every root; workset
      refusals and `open --json`) and `docs/stores.md` (ledger 9.2, 9.4); commit
      `docs(cli): update the stores pages for the binary's refusals and doctor fold`
- [x] 8.3 Update `apps/docs/reference/configuration.md` (no-subcommand help,
      parse refusal under `--json`, handover pre-validation; ledger 9.3); commit
      `docs(cli): document config's help, parse relay and handover pre-validation`
- [x] 8.4 Update `docs/architecture.md` forward-row success relay and
      terminal-handover class passages (structural respell, pre-validation
      order, the D11 residual; ledger 9.5), `.agents/shared.md` (ledger 9.6)
      then `mise run agents:sync`, and the living `openspec-relationship-health`
      Purpose (ledger 9.7); commit
      `docs(cli): state the success-path respell and handover pre-validation`
- [x] 8.5 Run `mise run docs:build` and `mise run agents:check` and verify both
      succeed (ledger 9.8); commit any fix they required as
      `docs(cli): fix docs build`

## 9. POST-REBASE — after `root-resolution-parity` merged (`fad3b2f`)

Files: `apps/cli/src/commands/context.ts`, `apps/cli/src/commands/schemas.ts`,
`apps/cli/src/commands/doctor.ts`, `apps/cli/src/commands/store.ts`,
`apps/cli/src/commands/config.ts`, `apps/cli/src/commands/workset.ts`,
`apps/cli/src/core/passthrough-command.ts` (only if design D4's `sentence` kind
is missing), `apps/cli/src/core/root.ts` (only to export the resolver's
directory check, design D10), `apps/cli/test/contract/relayed-remedies.test.ts`,
`apps/cli/test/contract/support/remedy-sources.ts`.

- [x] 9.1 Rebase onto `main` with `--force-with-lease`, resolve conflicts
      against `root-resolution-parity`'s `root.ts`, `openspec.ts` and
      `passthrough-command.ts`, and verify `mise run check` is green with every
      group-1–8 row still passing; commit any conflict fix as
      `fix(cli): reconcile passthrough-json-and-doctor with the resolver`
- [x] 9.2 Check `--cwd` first in `store`, `config` and `workset` with the
      resolver's own refusal (design D10), and verify ledger rows 7.1 and 7.2
      flip and pass for all six commands; commit
      `fix(cli): refuse a missing --cwd before spawning store, config or workset`
- [x] 9.3 Respell `context` structurally through the shared field-map helper
      (design D4, D6: always `--json`, text rendered from the rewritten
      document, the declared-reference count, the two-call `--code-workspace`
      text path), remove `REACHABLE_OWNED` rows 1–7 and
      `passthrough-json-and-doctor` from `OWNERS` and
      `context`/`workset`/`config` from `SUCCESS_RELAYS`, update the
      `relayed-remedies.test.ts` context success rows, and verify ledger rows
      3.1–3.4 and 4.5 flip and pass; commit
      `fix(context): spell the reference block through cospec from its JSON structure`
- [x] 9.4 Relay `schemas`' failed answer through the allowlist (`relayRespelled`
      over `callPassthrough`), and verify ledger row 3.5 flips and passes;
      commit `fix(schemas): spell a relayed no-root answer through cospec`
- [x] 9.5 Run doctor's own checks against the resolved local root's base (design
      D3), and verify ledger row 2.7 flips and passes and every other doctor row
      still passes; commit
      `fix(doctor): diagnose the enclosing root from a subdirectory`

## 10. Review round 2

Files: `apps/cli/src/commands/workset.ts`, `apps/cli/src/commands/config.ts`,
`apps/cli/src/core/forward-relay.ts`, `apps/cli/src/core/openspec.ts`,
`apps/cli/src/core/openspec-embedded.ts`,
`apps/cli/src/core/handover-preload.ts`, their tests, the docs of group 8. Each
row lands first as `test.failing` against the binary under Node (pty rows
through `script -q` with stdin ended), and the fix flips it.

- [x] 10.1 `workset open`'s pre-flight accepts the list's exit-1 answer and an
      error in its `status[]` as a refusal answered through the piped open, and
      counts every `stat` failure that means no usable folder as none (design
      D8); commit
      `fix(cli): relay a refused workset pre-flight before any handover`
- [x] 10.2 Run every handover and the piped `config reset --all` behind the
      handover preload so a closed prompt input exits 130 with the binary's
      cancellation line under Bun (design D15); commit
      `fix(cli): cancel a prompt given no input as the binary does under Node`
- [x] 10.3 `config profile`'s pre-flight relays every refusal but the
      interactive-mode one without handing over; `config reset --all` with no
      TTY on stdin runs piped and exits as the binary exits (design D8, D14);
      commit `fix(cli): hand config over only when the binary would prompt`
- [x] 10.4 The group refusal post-condition accepts a parse rejection, a
      stderr-only refusal or the group's one document whatever `--json` cospec
      parsed (design D1); commit
      `fix(cli): accept the group refusal in the mode the binary chose`
- [x] 10.5 `config`'s unknown subcommand, `list --json` refused on stderr, and
      the `path`/`get` envelopes carry the binary's answer and reason (design
      D7); commit
      `fix(cli): carry the binary's config answer and reason through --json`
- [x] 10.6 Declare `config <leaf> <extra-arg> --json` cospec-only in the
      precedence matrix on every leaf (design D13); commit
      `test(cli): declare config <leaf> <extra> --json cospec-only on every leaf`
- [x] 10.7 State the round-2 behaviour in design (D1, D7, D8, D13–D15) and on
      the configuration and commands pages, `docs/architecture.md` and
      `docs/stores.md`; commit
      `docs(cli): record the round-2 relays, preload and cospec-only rows`

## 11. Close-out

Files: `openspec/changes/passthrough-json-and-doctor/verification.md`,
`openspec/changes/passthrough-json-and-doctor/tasks.md`.

- [x] 11.1 Verify `reachability.test.ts` is green with no `parity-pending.yaml`
      entry or pending surface owned by this change (ledger 8.1), no
      `test.failing`/`test.todo` remains in the four new test files (8.2), and
      the suites of ledger 8.3 pass; run the bare-`openspec` sweep of ledger
      4.6; commit `test(cli): close out passthrough-json-and-doctor gates`
- [x] 11.2 Run `mise run check` (ledger 9.9), mark every ledger row with its
      observed result, and commit
      `docs(cli): record passthrough-json-and-doctor verification evidence`; the
      archive (`mise run cospec -- archive passthrough-json-and-doctor`) follows
      as the PR's last commit

## 12. Review round 3

Files: `apps/cli/src/core/handover-preload.ts`, `apps/cli/src/core/openspec.ts`,
`apps/cli/src/commands/config.ts`, their tests, design D14/D15, the
`openspec-config-passthrough` spec, `apps/docs/reference/configuration.md`,
`docs/architecture.md`. Each row lands first as `test.failing` against the
binary under Node, and the fix flips it.

- [x] 12.1 Write the handover preload under a per-process directory in the temp
      dir when the cache cannot be written, so every handover and the piped
      `config reset --all` still run as the binary runs (design D15); commits
      `test(cli): pin every handover with the cache directory read-only`,
      `fix(cli): write the handover preload under tmpdir when the cache is read-only`
- [x] 12.2 Strip the prompt's SGR escapes from the piped `config reset --all`
      relay and compare its stdout with the binary's byte for byte (design D14);
      commits `test(cli): compare the piped reset --all stdout byte for byte`,
      `fix(cli): relay the piped reset --all without Bun's prompt colour`
- [x] 12.3 Forward cospec's stdin to the piped `config reset --all` from its
      prompt on, matching the binary on every probed feed (design D14); commits
      `test(cli): pin the piped reset --all against the binary per stdin feed`,
      `fix(cli): forward stdin to the piped reset --all once it prompts`
- [x] 12.4 State the round-3 behaviour in design, spec and docs; commit
      `docs(cli): record the round-3 preload fallback and stdin forwarding`

## 13. Review round 4

Files: `apps/cli/src/core/openspec.ts`, `handover-prevalidation.test.ts`, design
D14, the `openspec-config-passthrough` spec,
`apps/docs/reference/configuration.md`, `docs/architecture.md`. Rows land first
(declared rows as `test.failing`), and the fix flips them.

- [x] 13.1 Forward cospec's stdin to the piped `config reset --all` unmodified,
      with no cospec-side dropping before the prompt; pin the deterministic
      feeds as parity rows against the binary with telemetry off, the
      typed-ahead feeds as cospec's declared answer, and the binary's
      telemetry-dependent answer to typed-ahead input (design D14); commits
      `test(cli): pin typed-ahead reset --all answers as cospec's own`,
      `fix(cli): forward stdin to the piped reset --all unmodified`
- [x] 13.2 State the round-4 behaviour in design, spec and docs; commit
      `docs(cli): record the piped reset --all typed-ahead answer`

## 14. Review round 5

Files: `apps/cli/src/commands/doctor.ts`, `doctor-parity.test.ts`,
`test/unit/commands/doctor-stderr.test.ts`, design D3, the
`openspec-relationship-health` spec, `apps/docs/reference/commands.md`,
`apps/docs/concepts/stores.md`. Rows land first as `test.failing`, and the fix
flips them.

- [x] 14.1 Fold each line of the wrapped `openspec doctor --json` call's stderr
      (its config warnings) that cospec did not already print into cospec's
      document as an `openspec-stderr` WARNING finding, spelled through the
      remedies allowlist, so `--json` carries it and text prints it (design D3);
      commits `test(cli): pin doctor's folded OpenSpec stderr warnings`,
      `fix(cli): fold OpenSpec doctor's stderr warnings into findings`
- [x] 14.2 State the stderr fold and the explicit `--store` carve-out (cospec's
      own checks read the invocation directory; a bare workspace gets the
      `initialized` ERROR where OpenSpec exits 0) in design, spec and docs;
      commit `docs(cli): state doctor's stderr fold and --store carve-out`

## 15. Review round 6

Files: `apps/cli/src/commands/doctor.ts`, `doctor-parity.test.ts`,
`test/integration/doctor-relationship.test.ts`, design D3, the
`openspec-relationship-health` spec, `apps/docs/reference/commands.md`,
`apps/docs/concepts/stores.md`. Rows land first as `test.failing`, and the fix
flips them.

- [x] 15.1 Run cospec's own checks (manifest, schema, config, `initialized`)
      against the store an explicit `--store <id>` selects, as for a pointer or
      `defaultStore` root (design D3); commits
      `test(cli): pin doctor --store checks on the selected store`,
      `fix(cli): run doctor's own checks on an explicit --store root`
- [x] 15.2 State what now holds in design, spec and docs, the `--store`
      carve-out wording removed; commit
      `docs(cli): state doctor's --store checks on the selected store`

## 16. Merge stage

Files: `test/contract/handover-prevalidation.test.ts`. Found rebasing onto
`root-resolution-parity` (#52), `standalone-json-once` (#56), `pin-node-oracle`
(#57) and `upstream-spellings` (#55): `ci-bun` (Linux, ubuntu-24.04) was red on
every prior CI run of this branch, including its own pre-rebase tip (`69e454c`)
— nothing here, so this predates and is independent of the rebase.

- [x] 16.1 Normalize each root's own path before comparing the read-only-cache
      `workset open w1 on a terminal` row's terminal text: two separate roots
      (`upRoot`/`coRoot`) are deliberate (the changed-files check needs them),
      but the binary's "no saved tool" refusal embeds root-specific workspace
      and member paths that only differ from each other, not from a real defect
      — CI (no `code`/`cursor` on PATH) always takes this refusal path; a dev
      machine with either installed takes a path-free prompt instead, so the gap
      was invisible locally; commit
      `fix(cli): normalize root paths in the read-only-cache pty comparison`
- [ ] 16.2 Fix the other four `ci-bun` failures (two Ctrl-D-cancellation
      timeouts, two more read-only-cache timeouts): `util-linux script`'s relay
      of Ctrl-D into a raw-mode child pty on Linux — see verification 16.2 for
      the isolated evidence. Not fixed in this session; blocks archive until
      resolved or explicitly waived with `--force-incomplete`.
