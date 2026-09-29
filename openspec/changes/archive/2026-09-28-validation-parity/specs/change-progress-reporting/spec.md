## ADDED Requirements

### Requirement: Ambiguous task numbering warns

For a cospec-typed change, `cospec validate` SHALL report two task-numbering
WARNINGs over `tasks.md`, ported from the wrapped binary's
`findTaskNumberingIssues`. `tasks/id-mismatch` SHALL fire on a task whose id's
leading group number differs from its enclosing `## N.` heading's number, with
leading zeros normalised on both sides. `tasks/id-duplicate` SHALL fire on every
later declaration of a task id that an earlier task already declared, naming the
line of the first declaration.

A task id SHALL be read by the exported `TASK_NUM_RE` of `core/tasks.ts`, with
the binary's task-id shape: at least two dot-separated number groups and an
optional letter suffix, followed by whitespace or end of text (`1.2`, `1.2.3`,
`1.3a`). So `1.2.3` and `1.2.4` are two ids, not two copies of `1.2`. Numbering
SHALL be read only inside a `## N.` group. Any other level-two heading ends the
group, a task outside every group SHALL NOT be checked, and a file with no
`## N.` heading SHALL be skipped entirely. Lines inside a fenced code block
SHALL NOT be read as tasks.

Both rules SHALL be WARNINGs, so `cospec validate --strict` fails on them. A
legacy-lane change keeps receiving the wrapped binary's own numbering WARNINGs
through delegation, and cospec SHALL NOT run these rules there.

#### Scenario: A task under the wrong group warns

- **WHEN** a cospec-typed change's `tasks.md` has `- [ ] 2.1 Wrong group` under
  `## 1. Impl`
- **THEN** `cospec validate` reports `tasks/id-mismatch` at WARNING on that
  line, and `cospec validate --strict` exits 1

#### Scenario: A duplicated task id warns

- **WHEN** `- [ ] 1.1 Do it` appears twice under `## 1. Impl`
- **THEN** `tasks/id-duplicate` is a WARNING on the second line, naming the
  first line

#### Scenario: Deeper ids are distinct

- **WHEN** `- [ ] 1.2.3 Deep` and `- [ ] 1.2.4 Deep sibling` sit under
  `## 1. Impl`
- **THEN** neither `tasks/id-duplicate` nor `tasks/id-mismatch` is raised

#### Scenario: A leading zero is not a mismatch

- **WHEN** `- [ ] 01.1 Padded` sits under `## 1. Impl`
- **THEN** no `tasks/id-mismatch` is raised

#### Scenario: Tasks outside a numbered group are ignored

- **WHEN** a task `- [ ] 3.1 Stray` sits under an unnumbered `## Notes` heading
  that follows `## 1. Impl`
- **THEN** no task-numbering issue is raised for it

#### Scenario: A legacy change is not double-reported

- **WHEN** a `spec-driven` change's `tasks.md` has a mismatched and a duplicated
  task id
- **THEN** the report carries the wrapped binary's two WARNINGs and no
  `tasks/id-mismatch` or `tasks/id-duplicate`
