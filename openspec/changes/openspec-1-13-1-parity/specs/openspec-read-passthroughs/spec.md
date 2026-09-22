# Spec Delta

## ADDED Requirements

### Requirement: Relayed wrapped guidance never instructs bare openspec

Guidance cospec relays out of the wrapped binary — a blocked-apply remedy, an
apply warning, or any other instructional string cospec re-emits rather than
authors — SHALL NOT reach a user or an agent naming a bare `openspec` command,
because an agent that follows such an instruction bypasses every cospec gate the
routing discipline exists to enforce. cospec SHALL rewrite the wrapped binary's
command name to its own on every relay path, in the human transcript and in
`--json` alike.

The rewrite SHALL be anchored to a backtick-delimited command span whose first
word is the wrapped binary's name, and SHALL NOT be a substitution over the
whole string. Warning text embeds an absolute metadata path ending
`.openspec.yaml`, and upstream prose names the product as well as the command; a
token-level substitution corrupts both. The rewrite SHALL apply only to verbs
cospec actually wraps, so it can never invent a command that does not exist; a
span naming any other verb SHALL be relayed unchanged rather than rewritten into
a wrong instruction.

The guard SHALL apply on every path a relay is reachable from, including the
legacy apply path that runs no cospec gate, a change grandfathered to an earlier
schema version whose narrower enforced requirements clear cospec's own gate
while the wrapped binary still reports it blocked, and a change whose tracked
task file exists but contains no task.

#### Scenario: A blocked remedy names cospec, not openspec

- **WHEN** the wrapped binary returns a blocked apply state whose remedy names a
  bare `openspec instructions` command, on the legacy apply path
- **THEN** neither the human transcript nor the `--json` document contains a
  backtick-delimited command span beginning with the wrapped binary's name

#### Scenario: A grandfathered change's relayed remedy is rewritten

- **WHEN** a change still on the earlier schema version clears cospec's apply
  gate while the wrapped binary reports it blocked on an artifact cospec does
  not enforce for that version
- **THEN** the relayed remedy names `cospec`, and the exit code is the one
  cospec's own gate decided

#### Scenario: An embedded metadata path survives the rewrite

- **WHEN** a relayed warning embeds an absolute path ending `.openspec.yaml` in
  the same string as a command span
- **THEN** the command span is rewritten and the path is byte-for-byte unchanged

#### Scenario: An unwrapped verb is relayed unchanged

- **WHEN** a relayed string names a wrapped-binary command cospec does not wrap
- **THEN** the span is left as the wrapped binary wrote it rather than rewritten
  into a cospec command that does not exist
