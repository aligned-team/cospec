# Verification

## 1. Doctor is healthy on a standalone install [critical]

- [x] 1.1 @regression (agent) unit: doctor check, no resolvable copy -> failed pre-fix (no injectable resolution; export missing), passes post-fix: INFO openspec-resolve names 1.5.0, zero ERRORs
- [x] 1.2 @e2e (agent) compiled binary `doctor`, no node_modules/bun -> exit 0; output: "INFO openspec-resolve: no project @fission-ai/openspec; wrapped calls use the embedded pinned 1.5.0"
- [x] 1.3 @runtime (agent) inspect cospec cache dir after 1.2 -> XDG_CACHE_HOME empty after the doctor run; no openspec-\* extraction dir
- [x] 1.4 @unit (agent) full unit suite -> 42 pass, 0 fail (test/unit/init)

## 2. Project-copy diagnostics unchanged

- [x] 2.1 @unit (agent) doctor check with in-range project copy -> no findings, version read from project package (doctor-openspec-resolve.test.ts)
- [x] 2.2 @unit (agent) doctor check with out-of-range project copy -> openspec-version ERROR on 0.9.0, remedy text unchanged

## 3. README caveat removed

- [x] 3.1 @integration (agent) grep both READMEs for the caveat -> no match for "doctor still resolves" / "needs a project install" / "additionally needs"; prose coherent
