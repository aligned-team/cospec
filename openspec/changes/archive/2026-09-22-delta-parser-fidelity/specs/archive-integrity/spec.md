## MODIFIED Requirements

### Requirement: Scenario-preservation archive gate

`cospec archive` SHALL run an explicit `archive/scenario-preservation` step
before `openspec archive` executes, for specs-bearing changes only. For each
`## MODIFIED Requirements` delta, it SHALL read the current living spec for the
delta's capability — resolved through the shared recursive spec discovery, so a
delta at `specs/<area>/<capability>/spec.md` is compared against the living
`<capability>` and not against `<area>` — and compare the delta block's
scenarios against the living requirement's, using cospec's normalising parser
(BOM, CRLF, HTML-comment, and fence-aware). A `#### ` header with no body — no
non-blank line before the next header or end of input — SHALL NOT be counted as
a scenario, and this SHALL apply identically to the delta side and the living
side, so the gate neither passes a delta that hollows a real scenario out to a
bare header nor refuses a merge the wrapped binary accepts because the living
spec carries one. The comparison SHALL be by scenario **name**, counted with
multiplicity: every living scenario name whose occurrences are not all matched
by an occurrence of the same name in the delta block is a missing scenario.
Names SHALL be compared case-sensitively, so a case-only rename is a drop. The
existing count comparison SHALL be retained as a second arm, and the step SHALL
refuse with exit 1 when either arm reports a loss. There SHALL be no escape
hatch: neither a `Scenario removed:` note nor any other annotation excuses a
name-identity or count drop, and a requirement dropped through `## REMOVED`
carries no MODIFIED operation and so is never seen by this gate. This SHALL
catch scenario thinning and same-count scenario renaming that `openspec archive`
would otherwise wave through at exit 0 on the lower half of the accepted
`>=1.0.0 <2.0.0` range. From OpenSpec 1.8.0 the wrapped binary carries its own
overlapping check; cospec's gate SHALL still run first, with cospec's own
message and rule id, because it remains the only defence on 1.0.0 through 1.7.x.

#### Scenario: Dropped scenario refuses archive

- **WHEN** a MODIFIED delta reduces a requirement's scenario count below the
  living spec's
- **THEN** `cospec archive` refuses with exit 1 before delegating

#### Scenario: Matched removal is allowed

- **WHEN** a requirement's scenarios disappear because the whole requirement is
  dropped through a `## REMOVED` operation, so no MODIFIED operation names it
- **THEN** the `archive/scenario-preservation` step does not apply to that
  requirement and passes, while a delta that both REMOVEs and ADDs the same
  requirement name is refused by the wrapped binary itself

#### Scenario: Refusal precedes a green openspec archive

- **WHEN** a scenario-thinning delta runs against a wrapped binary in the
  1.0.0–1.7.x part of the accepted range, which returns exit 0 for it
- **THEN** cospec refuses first, and a contract test against the pinned binary
  asserts this refusal

#### Scenario: Gate resolves a nested capability correctly

- **WHEN** a MODIFIED delta lives at `specs/<area>/<capability>/spec.md` and
  thins a scenario
- **THEN** the gate compares against the living `<capability>` spec and refuses
  with exit 1, rather than finding no living spec and passing

#### Scenario: Fenced and commented headers do not fake preservation

- **WHEN** a MODIFIED delta's only remaining `#### Scenario:` headers sit inside
  a code fence or an HTML comment
- **THEN** the gate counts them as absent and refuses, rather than treating the
  requirement's scenarios as preserved

#### Scenario: Upstream's own check is not double-reported

- **WHEN** the wrapped binary also reports the same scenario loss for the same
  file
- **THEN** cospec's refusal is the one the user sees, and the delegated
  duplicate is suppressed in the merged report

#### Scenario: Same-count name swap refuses archive

- **WHEN** a MODIFIED delta replaces one scenario's name with a different name,
  leaving the scenario count unchanged
- **THEN** the gate refuses with exit 1 and names the dropped scenario

#### Scenario: Duplicate scenario names are counted, not deduped

- **WHEN** the living requirement carries one scenario name twice and the
  MODIFIED delta carries it once
- **THEN** the gate reports exactly one missing scenario and refuses

#### Scenario: A case-only scenario rename is a drop

- **WHEN** a MODIFIED delta renames a scenario only by letter case
- **THEN** the gate treats the original name as missing and refuses

#### Scenario: A hollowed-out scenario is still a drop

- **WHEN** a MODIFIED delta keeps a living scenario's header but removes its
  body, leaving a bare `#### Scenario: Foo` line
- **THEN** the gate counts `Foo` as missing and refuses with exit 1, rather than
  crediting the empty header as preservation

#### Scenario: A bodyless living scenario is not a phantom loss

- **WHEN** the living spec carries a bodyless `#### Scenario: Foo` header that
  the MODIFIED delta does not repeat
- **THEN** the gate does not report a loss, matching the wrapped binary, rather
  than refusing an archive the binary accepts
