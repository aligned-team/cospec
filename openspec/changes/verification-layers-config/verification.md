# Verification

## 1. A project-declared layer is accepted and the issue's repro passes [critical]

- [ ] 1.1 @regression (agent) run #68's repro script in a sandboxed HOME against the built CLI -> exit 1 with `verification/layer-unknown` before the fix, exit 0 with no `layer-unknown` after
- [ ] 1.2 @unit (agent) `readValidateContext(base)` returns `verificationLayers: ['uat']` for block-list, flow-list, `@uat` and `config.yml` spellings -> bun test green
- [ ] 1.3 @integration (agent) `cospec validate --strict` exits 0 for an `@uat` row with `uat` declared and still emits `verification/layer-unknown` for `@staging` -> bun test green
- [ ] 1.4 @integration (agent) `cospec apply` and `cospec archive` clear the validation gate for a declared layer -> bun test green
- [ ] 1.5 @unit (agent) the `verification-artifact` scenario "Project-extended layer is accepted" has a passing test through the config-to-context path -> bun test green

## 2. A malformed declaration never crashes a gate and doctor warns [critical]

- [ ] 2.1 @unit (agent) missing config, unparseable YAML, `verification:` not a mapping, `layers:` not a list, and non-string or whitespace entries yield no extra layer and no throw -> bun test green
- [ ] 2.2 @unit (agent) `cospec doctor` emits a `config` WARNING for each malformed shape and none for a well-formed or absent declaration -> bun test green
- [ ] 2.3 @unit (agent) the `layer-unknown` hint names declared layers and is byte-identical to today's when none are declared -> bun test green

## 3. Docs and gate

- [ ] 3.1 @manual (agent) `apps/docs/concepts/verification.md` states the key's shape and doctor warning, the other pages agree -> pages read, `mise run docs:build` exits 0
- [ ] 3.2 @manual (agent) `mise run check` exits 0 and `cospec validate verification-layers-config --strict` is clean -> exit codes observed
