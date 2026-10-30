---
name: cospec-verify-change
description: Dress-rehearse a change before archiving — validate strictly, walk the verification ledger, and name the hard archive gates. Also use when the user says "cospec verify" or "openspec verify".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.11.2
  contentHash: sha256:4a6bdd47ec9a00d80a6925c4a39d0527e78be868fff38ed637f85e04a8621c5a
---

Dress-rehearse a change before archiving it. This workflow does not archive — it
runs `cospec validate --strict`, checks the delta specs against the code, walks
the verification ledger to observed evidence, and names the hard gates `/cospec-archive` will enforce.

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

**Project check:** These steps expect a project that already uses cospec. Before
the first step that writes anything (`cospec new`, `cospec archive`,
`cospec sync-specs`, or authoring an artifact file), confirm the project has a
root: run `cospec list --json` (with `--store <id>` when a store is selected,
since the store is then the root) and read `root`. A root object means the
project is set up. `"root": null` means it is not — there is no `openspec/`
directory here, and a write such as `cospec new` would create one as a side
effect. The command also exits non-zero, which is that answer rather than a
broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` entry's `message` starts
with `Declared in` or `Invalid store declaration in` and names this project's
`openspec/config.yaml` (or `config.yml`), the project does use cospec through a
store it declares, which this machine cannot resolve (the store is not
registered, or the `store:` line is malformed). Do not treat it as uninitialized
and do not take either branch below: stop before writing and show the user that
entry's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was
reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming
  cospec, naming this skill, or running its command. Stop using cospec and
  answer the request normally, as you would with no cospec installed. Do not ask
  them to set anything up and do not mention cospec setup.
- **Explicit cospec request**: the user named cospec, named this skill, or ran
  its command. Stop before writing and ask how to proceed: set this project up
  (`cospec init`), target a store they already have (`--store <id>`), or
  continue without cospec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run
`cospec init` until the user asks for it, do not hand-create `openspec/` files,
and do not let a command create it.

**Choosing a change:** When a step asks you to choose among changes and the
choice is not obvious, run `cospec list --json` (with `--store <id>` when a
store is selected) and keep its order, which is most recently modified first.
Never pass `--sort name`. Present the top 3-4 changes as options, each showing
its name, its type, its gate state, its task progress (for example "0/5 tasks",
"complete", or "no tasks"), and how recently it was modified, read from the
`lastModified` field. Mark the first option "(Recommended)", since the most
recently modified change is the likeliest one. Ask the user to pick, and never
guess.

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`: if exactly
one active change exists, use it and announce `Using change: <slug>`. When
several active changes exist, choose as **Choosing a change** above says.

## 2. Validate

```
cospec validate <slug> --strict
```

Fix every ERROR and every WARNING it reports before continuing. This includes
the archive-precondition checks (targets exist, no zero-op deltas, no ADDED
collisions, scenarios are well-formed) — do not proceed to the ledger walk with
a validation failure outstanding.

## 3. Check spec coverage

Run `cospec status --change <slug> --json`. Artifact ids come from the change's
schema, so find inputs by output path, never by an assumed id: the spec
artifacts are those whose `artifactPaths.<id>.outputPath` is under `specs/`,
and the design artifact is the one whose output path is or ends in `design.md`.
If the change's type has no spec artifact, or status reports it skipped, report
spec coverage as **Not applicable**; likewise design adherence when there is no
design artifact. If a spec or design artifact exists but its files are absent,
empty, or hold no usable requirements, scenarios, or decisions, mark the checks
it feeds as **Not verified** with the reason — never as clean.

Read each delta spec file and note the section every requirement sits under. The
section decides what you look for:

- **ADDED / MODIFIED** — search the code for the behavior (for MODIFIED, the
  text in the delta, not the old wording) and for tests covering each of its
  scenarios. A requirement that appears unimplemented is a CRITICAL finding.
- **REMOVED** — the behavior must be gone, so the check is inverted. The block
  carries only the name and its Reason/Migration notes, so first read the
  baseline requirement from the living spec at
  `<planningHome.root>/openspec/specs/<capability-path>/spec.md`, matched by
  exact name: the heading text after `Requirement:`, trimmed, with a closing
  `#` run dropped only when a space or tab precedes it, compared
  case-sensitively. A similarly worded heading is not a match. If that file no
  longer holds it (an early `/cospec-sync-specs`, or a similarly named ADDED
  requirement replaced it), recover it from that file's history with
  `git -C "<planningHome.root>" log -p -- openspec/specs/<capability-path>/spec.md`
  — empty output means the path matched nothing, not that there is no
  baseline. Search the code for the baseline's behavior, never for the name
  alone; finding none is the passing result. A baseline that cannot be
  recovered, or only restates its own title, is unusable: report that entry as
  **Not verified** and do not search. Behavior still present is a CRITICAL
  finding naming the file and lines, never "Requirement not found".
- **RENAMED** — the name changes, the behavior stays. Never report the `FROM`
  name as missing, and do not require code symbols to be renamed. Check the
  `TO` requirement's behavior against the baseline (under the `FROM` name, or
  the `TO` name when the living spec is already synced); a `TO` name that also
  appears under MODIFIED is checked there instead. An unreadable baseline makes
  the entry **Not verified**.

Skip scenarios under a REMOVED requirement. A change with only REMOVED or
RENAMED requirements has no implementation mapping to check: report that as
**Not applicable**, with each removal and rename settled above. If a design
artifact exists, check the implementation against its decisions and report each
contradiction as a WARNING.

## 4. Walk the verification ledger

Read `openspec/changes/<slug>/verification.md`. For each row shaped
`- [ ] N.M @layer (owner) probe -> result`:

- Run the probe.
- Record the actual observed result after `->`, replacing the placeholder.
- Flip the box to `[x]` once the observed result is recorded.
- If you will not run a row, do not fake it: write
  `- [~] N.M @layer (owner) probe -> defer: <honest reason>` instead.

No bare `- [ ]` row may remain when this step is done. Do not edit the ledger to
invent evidence for a probe you did not actually run.

## 5. Confirm tasks are complete

Run `cospec list --json` and find the one `changes` entry whose `name` is the
slug exactly. Its `totalTasks` and `completedTasks` count every file the
change's schema tracks, so do not infer progress from a single `tasks.md` or
from artifact status; only `x`/`X` boxes count as done, and plain bullets under
`## Workflow follow-up` are not tracked. If `completedTasks` is below
`totalTasks`, finish the remaining work (or tell the user which are
outstanding) before moving on. If the lookup fails or the entry is missing,
duplicated, or carries invalid counts, report task completion as **Not
verified**.

## 6. Name the gates archive will enforce

Tell the user `/cospec-archive` runs two hard gates, neither of which accepts
`--force`:

- `archive/verification-incomplete` — fails if any ledger row is still a bare
  `- [ ]`.
- `archive/scenario-preservation` — fails if a spec delta would drop a scenario
  the living spec already has.

This workflow only checks these preconditions; it does not run the archive.

## 7. Hand off

Report each check as passed, with its findings, **Not applicable**, or **Not
verified (<reason>)**. Never score a skipped or partly checked check as passing.
Report REMOVED and RENAMED requirements separately from the ADDED and MODIFIED
count (for example, "1 removal confirmed, 1 rename verified").

Only when every applicable check ran and no CRITICAL finding remains, tell the
user the change is dress-rehearsed and the next step is
`/cospec-archive`.
If any check was not verified, do not claim it is ready: say "No critical issues
found in the checks that ran", name each check that was not verified and why,
and leave the decision to the user. Verification is advisory: never invent an
optional or intentionally omitted artifact to obtain a clean report.
