# Verification

## 1. Unknown rule keys are flagged [critical]

- [ ] 1.1 @regression (agent) config with `rules.proposals` plus valid `rules.proposal`: doctor yields exactly one WARNING naming `proposals` and listing known ids, exit code unchanged; fails before the fix -> pending
- [ ] 1.2 @manual (agent) the issue's repro script in a sandbox against the fixed CLI -> pending

## 2. No false positives

- [ ] 2.1 @unit (agent) `rules` keyed by every built-in artifact id yields no finding -> pending
- [ ] 2.2 @unit (agent) project schema declaring custom artifact `extra` makes `rules.extra` valid -> pending
- [ ] 2.3 @unit (agent) absent `rules:` and non-mapping `rules:` yield no new finding -> pending

## 3. Output shape

- [ ] 3.1 @unit (agent) `doctor --json` carries the finding with `check: config` -> pending
- [ ] 3.2 @unit (agent) an unparseable project schema is reported once and suppresses key flagging -> pending

## 4. Docs and gate

- [ ] 4.1 @integration (agent) `mise run docs:build` passes with the docs update -> pending
- [ ] 4.2 @integration (agent) `mise run check` green and `cospec validate doctor-unknown-rule-keys --strict` passes -> pending
