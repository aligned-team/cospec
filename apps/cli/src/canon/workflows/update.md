Revise a change's **existing** artifacts and keep them coherent with one
another. This workflow never creates an artifact that does not exist yet (that
is `[[opsx:if-workflow continue]]/cospec:continue[[opsx:else]]cospec instructions <artifact> --change <slug>[[opsx:end]]`) and never edits code (that is `[[opsx:if-workflow apply]]/cospec:apply[[opsx:else]]cospec apply <slug>[[opsx:end]]`).

All work goes through `cospec`. Never call `openspec` directly, and never
hand-edit the bookkeeping under `openspec/changes/`.

There is no `cospec update <slug>` CLI command for this — do not run one. (The
unrelated `cospec update` subcommand regenerates this repo's managed harness and
schema files; it has nothing to do with a change's artifacts.) This workflow is
built from `cospec status`, `cospec instructions`, and `cospec validate`.

{{ROOT_GUARD}}

## 1. Select the change

If the user named one, use it. Otherwise run `cospec list --json`. If exactly
one active change exists, use it and announce `Using change: <slug>`, naming
`[[opsx:if-workflow update]]/cospec:update <other-slug>[[opsx:else]]cospec validate <other-slug> --strict[[opsx:end]]` as the override. When several active changes exist,
choose as **Choosing a change** above says.

## 2. Read what exists

```
cospec status --change <slug> --json
```

The files in scope are `artifactPaths.<id>.existingOutputPaths` of the
artifacts reported `done`, plus one exception: a confirmed new file under a glob
artifact that already has files (step 4). Never write to a glob
`resolvedOutputPath`. An artifact with no files and status `ready` or `blocked`
is out of scope here — note it and point the user at `[[opsx:if-workflow continue]]/cospec:continue[[opsx:else]]cospec instructions <artifact> --change <slug>[[opsx:end]]`.
Leave `skipped` artifacts untouched; they are not missing.

## 3. Understand the request

- A specific revision ("the design now uses X") is the starting edit.
- A bare "update" / "make this coherent" is a coherence review: read the
  existing artifacts and check them against each other for contradictions, gaps,
  and duplication.

## 4. Reconcile

Re-read every artifact you touch from disk — never from what you remember of
this conversation; the user may have edited it since. **Draft** the requested
edit — in the conversation, not in files — then check every other existing
artifact against the drafted edit **in both directions**: an edit to `tasks.md`
can require revising `proposal.md`, not only the reverse. Dependency order is a
reading order, not a constraint on what may be revised.

If the change is already coherent, say so and **propose no revisions**.

When a substantial rewrite is needed, get that artifact's authoritative rules,
template, and output path first:

```
cospec instructions <artifact> --change <slug> --json
```

Apply `context` and `rules` as constraints; never copy them into the artifact.
`blocking-changes.md`, the `specs/**/spec.md` deltas, and `verification.md` are
machine-parsed — keep the exact format.

A glob artifact (the `specs/**/*.md` deltas) reads `done` once one file matches,
so `[[opsx:if-workflow continue]]/cospec:continue[[opsx:else]]cospec instructions <artifact> --change <slug>[[opsx:end]]` never comes back for a file it is missing. When
reconciliation finds such a file missing — a capability the proposal lists with
no delta yet — this workflow creates it:

1. Run `cospec instructions <artifact> --change <slug> --json` and follow its
   `instruction` and `template`. If it reports `skipped: true`, do not create
   the file. Re-read the dependency files from disk; if a required one is
   missing, stop and ask the user to restore it first.
2. Choose a concrete path inside the change directory that matches the
   artifact's `outputPath` and does not exist yet, and check it stays inside
   the change directory after resolving symlinked parents.
3. Propose the new file in step 5 like any other revision, and create it only
   after the user confirms — refreshing status and instructions just before,
   and stopping rather than overwriting if the path now exists.

## 5. Confirm each edit

Show each proposed revision and why, one artifact at a time, and write only
after the user confirms it. A rejected revision leaves that artifact unchanged.
This step performs every artifact write in this workflow; no earlier step edits
an artifact.

## 6. Format, validate, and hand off

If this repo has a formatter task (for example `mise run format:fix`; check its
task list / docs), run it over the change directory before validating.

```
cospec validate <slug> --strict
```

Fix every ERROR and every WARNING, re-running the formatter over anything you
edit. Then name the next step:

- artifacts with no files and status `ready` or `blocked` → `[[opsx:if-workflow continue]]/cospec:continue[[opsx:else]]cospec instructions <artifact> --change <slug>[[opsx:end]]`
- apply-ready and not yet implemented → `[[opsx:if-workflow apply]]/cospec:apply[[opsx:else]]cospec apply <slug>[[opsx:end]]`
- already implemented, and the revision changed what should be built →
  `[[opsx:if-workflow apply]]/cospec:apply[[opsx:else]]cospec apply <slug>[[opsx:end]]` again to carry the delta into code
- everything done → `[[opsx:if-workflow verify]]/cospec:verify[[opsx:else]]cospec validate <slug> --strict[[opsx:end]]`, then `[[opsx:if-workflow archive]]/cospec:archive[[opsx:else]]cospec archive <slug>[[opsx:end]]`

Guardrails: edit only the concrete files in `existingOutputPaths`, plus a
confirmed new file under a glob artifact that already has files (step 4) — that
is the only new-file scope. Do not advance the build frontier: an artifact with
no files and status `ready` or `blocked` is
[[opsx:if-workflow continue]]`/cospec:continue`'s job[[opsx:else]]a job for `cospec instructions <artifact> --change <slug>`[[opsx:end]], and `skipped` artifacts stay
untouched.

If the request changes the change's _intent_ rather than refining it, do not
rewrite it in place — recommend `[[opsx:if-workflow new]]/cospec:new <type> <new-slug>[[opsx:else]]cospec new <type> <new-slug>[[opsx:end]]` and stop.
