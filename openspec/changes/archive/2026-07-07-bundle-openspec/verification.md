## 1. Standalone binary runs wrapped calls with no node_modules/bun/npm [critical]

- [x] 1.1 @e2e (agent) compile cospec, then in a fresh temp dir with NO node_modules and bun stripped from PATH run `cospec init`, `cospec new feat demo`, `cospec validate demo --strict`, `cospec apply demo` -> 2026-07-07, clean room (`env -i`, PATH stripped of both bun AND node, fresh HOME + XDG_CACHE_HOME): `init` exit 0 (60 files), `new feat demo` exit 0 (`.openspec.yaml` written, schema `feat`), `validate demo --strict` exit 1 with the correct 5-missing-artifact verdict, `apply demo` exit 2 "blocked: missing artifacts" — all wrapped verdicts computed by the embedded bundle extracted at `$XDG_CACHE_HOME/cospec/openspec-1.5.0/vendor/bin/openspec.js`; a completed `chore` change additionally validated clean (exit 0)
- [x] 1.2 @integration (agent) the pack-standalone suite runs a real wrapped subcommand with NO openspec resolvable -> new test "standalone binary runs wrapped calls via the embedded bundle (no node_modules)" passes (fresh HOME + cache, no npm install at all): init/new/validate/apply all return wrapped verdicts and the test asserts the bundle was extracted into the per-run cache
- [~] 1.3 @manual (human) `mise use github:aligned-team/cospec && cospec init && cospec new feat x && cospec validate x --strict && cospec apply x` in a clean project -> defer: requires a published GitHub release containing this change; the identical flow is proven by 1.1/1.2 against the locally compiled binary

## 2. Embedded copy reports the pinned version [critical]

- [x] 2.1 @integration (agent) spawn the extracted embedded bundle `--version` via BUN_BE_BUN self-spawn -> a compiled probe binary with no node_modules printed `1.5.0` from the extracted bundle, and every wrapped call in 1.1 passed the in-process version assertion (an out-of-range version refuses before any call)

## 3. Project-installed openspec is still preferred

- [x] 3.1 @integration (agent) with an in-range openspec in node_modules, run a wrapped call -> the full contract suite and `cospec validate --all --strict` in this repo ran through the node_modules copy with no extraction: `~/.cache/cospec` does not exist after the dev runs (the embedded fallback is only reached when `Bun.resolveSync` misses on all three bases)

## 4. Vendored bundle is drift-gated

- [x] 4.1 @integration (agent) run the vendored-bundle `--check` against a fresh build of the pinned openspec -> `mise run vendor:openspec:check` exits 0 in sync ("bundle up to date."); appending a tamper byte to the committed bundle made it exit 1 with the drift message, and restoring returned exit 0. Wired into `mise run check` and ci.yml (ci-bun)

## 5. No regression in the existing wrapped surface

- [x] 5.1 @regression (agent) run the full contract suite (`mise run test:contract`) -> 22 pass, 0 fail against the real pinned 1.5.0 binary (dev still resolves from node_modules)
- [x] 5.2 @regression (agent) run `mise run check` -> green: lint, format, typecheck, unit (483 incl. the 2 new extraction tests), contract, integration (incl. both standalone tests), pack, generate/agents drift gates, vendor:openspec:check, cospec-validate-all, openspec schema validate
