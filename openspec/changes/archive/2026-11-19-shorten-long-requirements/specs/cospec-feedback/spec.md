# Spec Delta

## MODIFIED Requirements

### Requirement: Upstream feedback is an explicit, version-asserted verbatim relay

`cospec feedback --upstream` SHALL relay the invocation to the wrapped
`openspec feedback`, which files at `Fission-AI/OpenSpec`, after one stderr note
naming that destination. The relay SHALL assert the wrapped binary's version,
spawn it piped, and relay stdout, stderr, and exit code verbatim. It SHALL
declare no `expect.exitCodes` allow-list — the documented exception, since
upstream propagates gh's arbitrary exit status.

#### Scenario: The destination is named before relaying

- **WHEN** `cospec feedback --upstream "<message>"` runs
- **THEN** a stderr note states that the issue is being filed at
  `Fission-AI/OpenSpec` rather than `aligned-team/cospec`, and the wrapped
  `openspec feedback` is invoked

#### Scenario: The child's exit code survives the relay

- **WHEN** the wrapped `openspec feedback` exits with a code the shared
  passthrough allow-list would reject
- **THEN** `cospec feedback --upstream` exits with exactly that code and relays
  the wrapped stdout and stderr unchanged

#### Scenario: The upstream relay needs no terminal

- **WHEN** `cospec feedback --upstream "<message>"` runs with no TTY attached
- **THEN** the wrapped `openspec feedback` is spawned piped, prompts for
  nothing, and its `gh auth status` check still runs
