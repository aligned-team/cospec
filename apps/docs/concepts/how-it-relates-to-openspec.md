---
title: How cospec relates to OpenSpec
description:
  cospec wraps OpenSpec rather than replacing it — the version pin, the
  resolution rules, and the three failure modes cospec closes.
---

# How cospec relates to OpenSpec

cospec is a wrapper, not a fork. It owns no spec-format logic that
[OpenSpec](https://github.com/Fission-AI/OpenSpec) already implements correctly
— it constrains, validates, and verifies the real OpenSpec binary, and closes a
handful of failure modes that make raw OpenSpec unsafe to hand to an agent.

If you already know OpenSpec, most of what you know still applies: the same
[concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md),
the same
[delta format](https://github.com/Fission-AI/OpenSpec/blob/main/docs/writing-specs.md),
the same
[glossary](https://github.com/Fission-AI/OpenSpec/blob/main/docs/glossary.md).
cospec adds typed schemas, a real gate, and a verified archive on top.

## The version pin

cospec accepts OpenSpec **`>=1.0.0 <2.0.0`** at runtime — that range is asserted
the first time cospec calls out to it in a process, and an out-of-range binary
is refused outright. cospec's own dev and CI pin one exact build inside that
range, **`1.5.0`**, which is the version its contract test suite runs against.
Those two numbers are meant to drift apart over time (the accepted range is
wide; the pin is narrow and load-bearing) but never to fall out of sync with
each other — a version tripwire test fails first if they do.

## cospec never replaces OpenSpec

cospec spawns OpenSpec; it never imports it. Two rules keep the boundary solid:

- **Resolved by path, never `$PATH`.** cospec looks for a project-local install
  first, falls back to an embedded copy bundled into the compiled binary, and
  always spawns by resolved path with a fixed working directory — never whatever
  happens to be on your shell's `$PATH`. You get the same OpenSpec behavior
  regardless of what else is installed on the machine.
- **Version-asserted before every session.** See the pin above — cospec refuses
  to drive a binary outside the accepted range rather than silently behaving
  unpredictably against it.

On top of that wrapped binary, cospec adds:

- **Typed schemas** — eleven schemas, one per conventional-commit type, each
  with its own required/optional/forbidden artifact matrix instead of one
  generic workflow. See [Types and artifacts](/concepts/types-and-artifacts).
- **Real validation** — stable, greppable rule IDs as a superset of the OpenSpec
  checks that actually apply to your change.
- **A gated `apply`** — a deterministic exit code an agent can't rationalize
  past. See [Apply and archive](/concepts/apply-and-archive).
- **A verified `archive`** — filesystem verification that catches the
  silent-abort failure mode below, plus a scenario-preservation check.
- **A verification ledger** — a machine-parsed acceptance-evidence artifact that
  archive gates on. See [Verification](/concepts/verification).

None of this touches how OpenSpec itself parses or merges specs — for that,
OpenSpec's own
[commands reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md)
and
[getting-started guide](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md)
are the source of truth, and cospec links out to them rather than restating
them.

cospec is also **store-aware**: the same typed workflow — schemas, the gate, the
verified archive, the blocking-changes ledger — runs identically against a
registered OpenSpec store as it does against the local repo. Store lifecycle
itself stays OpenSpec's job; cospec only adds `--store <id>` to the commands
that touch a change. See [Stores](/concepts/stores) for the mechanics and the
full split of what each CLI owns.

## Three failure modes cospec defends against

Raw OpenSpec has a few behaviors that are easy to miss in a terminal but
dangerous when an agent — not a human — is reading the exit code.

**1. It can exit 0 having done nothing.** When an archive can't actually merge —
say a delta targets a requirement that no longer exists — OpenSpec prints an
abort notice and exits `0` anyway. An agent that trusts the exit code alone
would report success on a change that never moved. cospec's archive checks the
filesystem directly (the change directory must actually be gone, a dated archive
entry must actually exist) and refuses to call it done until it verifies that.

**2. It can quietly thin a spec.** A modified requirement that drops acceptance
scenarios merges cleanly with no complaint — the spec loses coverage and nothing
in the output says so. cospec re-parses each delta against the current spec at
archive time and refuses the merge unless every scenario that disappears is
either explicitly marked removed or accounted for by a `REMOVED` operation.

**3. It can leave a change half-verified.** OpenSpec has no concept of
acceptance evidence — nothing stops a change from being archived before anyone
confirmed the behavior it claims to add. cospec's verification ledger requires
every tracked behavior to resolve to evidence or an explicit, on-the-record
deferral before archive will proceed.

::: tip We eat our own dogfood cospec self-hosts — this repo's own `openspec/`
tree is managed by cospec, using the same schemas, gates, and archive verifier
documented here. :::

## See also

- [OpenSpec docs index](https://github.com/Fission-AI/OpenSpec/tree/main/docs)
- [OpenSpec concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)
- [Writing specs](https://github.com/Fission-AI/OpenSpec/blob/main/docs/writing-specs.md)
- [Glossary](https://github.com/Fission-AI/OpenSpec/blob/main/docs/glossary.md)
- [Commands reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md)
- [Getting started](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md)
- [Team workflow](https://github.com/Fission-AI/OpenSpec/blob/main/docs/team-workflow.md)
- [Types and artifacts](/concepts/types-and-artifacts)
- [Apply and archive](/concepts/apply-and-archive)
- [Verification](/concepts/verification)
- [Stores](/concepts/stores)
