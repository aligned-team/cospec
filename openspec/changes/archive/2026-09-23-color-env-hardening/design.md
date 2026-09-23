# Design

## Context

`spawnRaw` in `apps/cli/src/core/openspec.ts` builds the wrapped child's
environment as `{ ...process.env, ...WRAPPED_ENV }`. That shape can only _add_
keys, never remove them, so anything the parent shell exports survives into the
child. Node's `warnOnDeactivatedColors` check (`internal:tty`) fires whenever
`NO_COLOR` and `FORCE_COLOR` are both set, printing a warning plus a stack trace
on stderr the first time any colour library touches `getColorDepth` — which the
pinned OpenSpec 1.13.1 does via `yoctocolors`.

Root cause is therefore not the warning itself but the additive env shape:
cospec asserts control over the child's colour behaviour while leaving the
variable that overrides that assertion in place.
`apps/cli/test/fixtures/ support.ts` copies the same shape, which is why the
failure reads as a flaky test rather than a product bug.

## Goals / Non-Goals

**Goals:**

- Wrapped OpenSpec output is byte-identical regardless of the parent shell's
  colour variables.
- One definition of "the colour variables", shared by product code and the test
  harness.

**Non-Goals:**

- Changing cospec's _own_ colour output. cospec's stdout still honours the
  user's `FORCE_COLOR`/`NO_COLOR`; only the wrapped child is neutralised.
- Sanitising any other inherited variable (`TZ`, locale, proxies). Out of scope
  and behaviour-affecting.

## Decisions

- **Delete the variables from the child env rather than filter the child's
  output.** Rejected alternative: strip the warning line in the stdout/stderr
  deny-list. That hides one known string while leaving the real defect — the
  child still running in forced-colour mode, so ANSI escapes can reach the
  parsers. Deleting at the source fixes the class.
- **Delete `COLORTERM`, `CLICOLOR` and `CLICOLOR_FORCE` alongside `FORCE_COLOR`,
  even though only `FORCE_COLOR` triggers Node's warning.** `chalk`,
  `picocolors` and `yoctocolors` consult the others to force colour on
  independently of Node's check, so removing only `FORCE_COLOR` would leave a
  second path to escaped output.
- **Export a builder function, not a constant.** `WRAPPED_ENV` as a plain
  `Record<string, string>` cannot express a deletion. A builder that takes the
  base env is also directly unit-testable without mutating the suite's real
  `process.env`.
- **The test harness reuses the builder rather than repeating the list.** A
  duplicated list is how the two shapes drifted apart in the first place.

## Operational surface

- **Binary versions / arches:** the wrapped binary is OpenSpec 1.13.1 run under
  the current executable (`process.execPath` with `BUN_BE_BUN=1`). The warning
  originates in the Node/Bun runtime's `internal:tty`, not in OpenSpec, so it is
  present on every platform and arch where a colour variable is exported; the
  fix is likewise platform-independent.
- **Container vs runner:** CI runners that set `FORCE_COLOR` for prettier logs
  (a common default) hit this exactly as a developer shell does. After the fix
  neither configuration changes wrapped behaviour, so contract runs are
  reproducible across local, CI, and container environments.
- **Required secrets:** none. **Bind address / connection limits:** not
  applicable — the wrapped call is a local child process, not a network surface.

## Risks / Trade-offs

- **[Risk] A future wrapped command genuinely wants coloured child output.** →
  No such command exists; every wrapped call is parsed by cospec, and colour
  would be a defect there. The builder is the single place to revisit if that
  changes.
- **[Risk] Deleting `COLORTERM` changes some library's terminal-capability
  detection beyond colour.** → Scope is limited to the wrapped child, whose
  output cospec always treats as plain text; the verification ledger pins
  parsed-result equivalence between the forced and clean environments.
- **[Risk] The builder drifts from the harness again.** → The harness imports
  the builder; a unit test asserts the stripped set, so a silent divergence
  fails the suite.
