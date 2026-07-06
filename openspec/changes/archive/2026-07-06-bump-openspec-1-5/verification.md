## 1. Wrapped binary bump is safe against the real 1.5.0 release [critical]

- [x] 1.1 @integration (agent) run the full contract suite (archive-parity, archive-gotchas, scenario-preservation, hard-reality, version-tripwire) against the real @fission-ai/openspec@1.5.0 binary -> 22/22 contract tests pass against 1.5.0; exact-abort-on-precondition, scenario-thinning, and CHANGE_NO_DELTAS assumptions all re-confirmed unchanged (also empirically re-ran the delta-less validate: exit 1, literal "Change must have at least one delta" + additive tip)
- [x] 1.2 @integration (agent) run `cospec validate bump-openspec-1-5 --strict` and `cospec apply bump-openspec-1-5` against the bumped binary -> validate exits 0 clean; apply gate reports "clear" exit 0 with no soft blockers, so --allow-soft was never a question

## 2. Runtime version acceptance widens without breaking the exact dev pin

- [x] 2.1 @unit (agent) exercise the new semver-range assertion in apps/cli/src/core/openspec.ts against in-range, floor-boundary, and out-of-range version strings -> unit tests in openspec.test.ts cover floor 1.3.1 (pass), 1.3.0/1.2.9 (refused), pin 1.5.0 (pass), 2.0.0 ceiling + 2.1.0 (refused), unparseable (fail closed); checkVersion throws the range-naming message; all green
- [x] 2.2 @integration (agent) run generatedBy: '1.5.0'-stamped fixtures through isOpsxMarkdown() (cospec init/doctor) -> doctor/init unit tests with 1.5.0-stamped SKILL.md fixtures both still flag/clean the openspec-authored file (opsx-leftover WARNING + removal), matching pre-bump 1.3.x behavior; matcher now keys on author:openspec + bare-semver shape, not a hardcoded version
