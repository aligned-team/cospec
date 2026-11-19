## MODIFIED Requirements

### Requirement: Per-type required-row facts

With `verification` enforced, cospec SHALL require: `feat`, a non-`@unit` row in
each `[critical]` group (`verification/critical-real-layer`); `fix`, a
`@regression` row (`verification/reproduces-bug`); `perf`, an `@equivalence` row
(`verification/equivalence`); `refactor`, an `@equivalence` row
(`verification/invariant`); soft-promoted `revert`/`build`/`ci`, a real-layer
row (`verification/deploy-real-layer`: `@runtime` for `build`/`ci`, any layer
for `revert`).

#### Scenario: feat critical group without a real layer

- **WHEN** a `feat` change has a `[critical]` group whose only row is `@unit`
- **THEN** cospec emits `verification/critical-real-layer`

#### Scenario: fix without a regression row

- **WHEN** a `fix` change's `verification.md` has no `@regression` row
- **THEN** cospec emits `verification/reproduces-bug`

#### Scenario: perf missing benchmark or equivalence

- **WHEN** a `perf` change lacks an `@equivalence` row, whether or not it has a
  `@benchmark` row
- **THEN** cospec emits `verification/equivalence`

#### Scenario: perf needs no benchmark row

- **WHEN** a `perf` change's `verification.md` has an `@equivalence` row and no
  `@benchmark` row
- **THEN** cospec emits no `verification/equivalence` issue

#### Scenario: refactor without an equivalence row

- **WHEN** a `refactor` change's `verification.md` has no `@equivalence` row
- **THEN** cospec emits `verification/invariant`
