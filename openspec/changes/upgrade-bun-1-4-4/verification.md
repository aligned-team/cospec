# Verification

## 1. The repo's gates run on Bun 1.4.4 [critical]

- [x] 1.1 @integration (agent) `mise run check` on Bun 1.4.4 -> every dependency passes: lint, format:check, typecheck, the unit, contract, integration, bench and release suites, the generate / vendor / agents drift gates, validate-all and schema validate -> exit 0: unit 3131 pass, contract 3231 pass, integration 404 pass, bench 343 pass, release 14 pass, 0 fail anywhere; `bun check` clean on 325 + 103 + 13 files; vendor, agents, generate and validate-all green
- [x] 1.2 @regression (agent) plant a type error and run `bun check -p apps/cli` -> exits 1 with TS2322 at the planted line, so the new type checker is not a no-op -> `apps/cli/src/__probe.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.`, exit 1 (probe file removed)
- [x] 1.3 @regression (agent) `bun fmt --check .` against `oxfmt --check .` (0.56.0) -> same file count, and a fixed point after the whitespace-only reformats -> both covered 1251 files; `bun fmt` flagged 5 (2 arrow-function wraps, 1 list-continuation indent, 2 archived docs), and passed after one `bun fmt` run
- [ ] 1.4 @runtime (agent) CI on this PR (ubuntu-latest) -> the mise lockfile drift gate is clean, `bun install --frozen-lockfile` passes and every job is green
- [x] 1.5 @equivalence (agent) in a copy of the tree with no parent formatter config, `bun fmt --doctor`, `--list-files` and `--check` with only `bunfig.toml` `[fmt]` -> reads only `bunfig.toml`, formats the same file set as `.oxfmtrc.json` + `.prettierignore` did, and every output difference is inside an import statement -> doctor: "No config file found. Using oxfmt's defaults. / Using bunfig.toml ([fmt])"; `--list-files` identical to the `.oxfmtrc.json` run except the deleted file itself (1255 files); 75 files differed, all inside import statements (named-import re-sort), then `--check` passed in the copy
- [x] 1.6 @regression (agent) `mise run test:bench` with the recalibrated `perf` / `perf-hard` sizes on Bun 1.4.4 -> the seeded `dedupe` misses every threshold by 4x or more, the Set-backed reference fix clears them, and the fail-before / pass-after checks pass -> seeded: perf bench ~1000ms vs 150, hidden ~1650ms vs 400 and ~1100ms vs 200; perf-hard bench ~960ms vs 150, hidden ~1970ms vs 400 (3 runs each); Set-backed ~1.7ms; `test:bench` 343 pass, 0 fail

## 2. Release artifacts build and run on Bun 1.4.4 [critical]

- [x] 2.1 @runtime (agent) `mise run test:pack:standalone` -> the host-platform compiled binary runs from a bun-less PATH under Node -> 3 pass, 0 fail
- [x] 2.2 @integration (agent) `mise run test:pack` -> the packed tarball installs and `bunx cospec` runs -> 2 pass, 0 fail
- [x] 2.3 @runtime (agent) cross-compile the seven release targets with `bun build --compile --target=<t>` on Bun 1.4.4 -> every target builds, and the host binary prints its version -> all 7 built (linux x64/arm64 gnu+musl ELF, darwin x64/arm64 Mach-O, windows x64 PE32+), 0 failures; darwin-arm64 binary `--version` printed 0.11.2
