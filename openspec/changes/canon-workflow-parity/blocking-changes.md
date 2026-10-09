# Dependencies

## Blocked by

None.

## Soft-blocked by

None.

## Phase Gates

<!-- Not parsed by the gate. -->

The ledger above cannot hold a change that is neither active nor archived in
this tree (`blockers/dangling-ref`), and `workflow-profiles` is on its own
branch and unmerged, so the hard blocker is recorded here. The implement stage
adds it to "Blocked by" as an archived entry in task 1.2, after rebasing onto
the `main` that carries it. This change was authored against `main` at v0.9.0;
`design.md` D1 says what the dependency provides.

- **`workflow-profiles` (R12), a hard prerequisite.** It adds the
  optional-workflow conditional grammar (`[[opsx:if-workflow <id>]]`,
  `[[opsx:else]]`, `[[opsx:end]]`) and its resolver `resolveOptionalWorkflows`
  in `harness/optional-workflow.ts`, runs that resolver in `renderHarnessFiles`
  on the raw canon body, wraps every `/cospec:<id>` reference in the twelve
  bodies in those markers, adds `core: true` to six entries of `harness.yaml`,
  and adds a canon unit test that fails on any `/cospec:<id>` outside a
  conditional branch. This change's fragment interpolates ahead of that
  resolver, its new body text is written with every cross-workflow reference
  already wrapped, and its `harness.yaml` edit sits beside R12's. Both edit
  `render.ts`, `harness.yaml` and all twelve bodies, so the change cannot apply
  until R12 has merged and this branch has rebased onto it.

Task group 1 runs first and gates everything after it. Groups 2 to 11 start only
after task 1.2 has rebased onto that `main`, because the bodies and `render.ts`
change under R12. The change cannot archive, and its PR cannot merge, before
group 1 is done.
