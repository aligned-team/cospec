# Verification

## 1. Unknown rule keys are flagged [critical]

- [x] 1.1 @regression (agent) config with `rules.proposals` plus valid `rules.proposal`: doctor yields exactly one WARNING naming `proposals` and listing known ids, exit code unchanged; fails before the fix -> red before fix (4 of the 6 new rows failed on unfixed source), green after: `bun test apps/cli/test/unit/init/doctor.test.ts` 33 pass, 0 fail; one WARNING naming `proposals`, exit 0
- [x] 1.2 @manual (agent) the issue's repro script in a sandbox against the fixed CLI -> repro script after the fix: doctor printed `WARNING config: openspec/config.yaml: rules.proposals is not an artifact id (known: blocking-changes, design, proposal, specs, tasks, verification); its rules are ignored — did you mean 'proposal'?`, `0 error(s), 1 warning(s)`, exit 0; before the fix it printed `All checks passed.`

## 2. No false positives

- [x] 2.1 @unit (agent) `rules` keyed by every built-in artifact id yields no finding -> `every built-in artifact id is a valid key` green
- [x] 2.2 @unit (agent) project schema declaring custom artifact `extra` makes `rules.extra` valid -> `an artifact id declared by a project schema is a valid key` green (extra valid, nope flagged)
- [x] 2.3 @unit (agent) absent `rules:` and non-mapping `rules:` yield no new finding -> `absent or non-mapping rules produce no finding` green (empty, string, list, null)

- [x] 2.4 @unit (agent) an artifact id declared by a user-global schema (private `XDG_DATA_HOME`) is a valid key -> `an artifact id of a user-global schema is a valid key` green; fails on the project-dir-only implementation
- [x] 2.5 @unit (agent) ids of an invalid (unresolvable `requires`) or unparseable schema, project or user-global, are not known and the dropped schema raises no finding -> `ids of a schema the binary rejects as invalid are not known` green; fails on the project-dir-only implementation
- [x] 2.6 @unit (agent) a project schema shadows a same-named user-global schema, so the shadowed ids are flagged -> `a project schema shadows a same-named user-global schema` green

## 3. Output shape

- [x] 3.1 @unit (agent) `doctor --json` carries the finding with `check: config` -> every new row reads findings from `doctor --json` with `check: config`; green
- [x] 3.2 @unit (agent) an unparseable project schema is dropped as the binary drops it: no finding of its own, its ids not known -> covered by `ids of a schema the binary rejects as invalid are not known` green

## 4. Docs and gate

- [x] 4.1 @integration (agent) `mise run docs:build` passes with the docs update -> `mise run docs:build` exit 0, build complete
- [ ] 4.2 @integration (agent) `mise run check` green and `cospec validate doctor-unknown-rule-keys --strict` passes -> `mise run check` exit 0 (unit 2314 pass, integration 245 pass, contract 2818 pass, 0 fail); validate --strict passed
