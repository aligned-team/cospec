# Security Policy

## Scope

This policy covers the cospec (conventional openspec) codebase. There is no
hosted service — cospec is a command-line tool that runs on a developer's
machine and in CI.

Out of scope: third-party dependencies (report those upstream, including
[`@fission-ai/openspec`](https://github.com/Fission-AI/OpenSpec)), and any model
provider used by the optional advisory eval.

## Supported versions

Only the latest release is supported. No patches are backported to older
versions.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Report privately via:

- **GitHub private security advisory** — open a draft advisory at
  `github.com/aligned-team/cospec/security/advisories/new`
- **Email** — `engineering@aligned.team` (PGP not required; plain text is fine)

Include a description of the issue, reproduction steps, and your assessment of
impact. A CVE is not required.

Areas of particular interest: the wrapped-command execution path
(`core/openspec.ts` spawns the resolved OpenSpec binary), the harness
file-writing layer, and the eval's jailed tools (`run_command` allowlist and
`write_file` path jail in `e2e/eval/agent.ts`).

## Response expectations

This is an open-source project maintained by [Aligned](https://aligned.team).
There is no SLA, no dedicated security team, and no warranty of any kind (see
[LICENSE](LICENSE)).

Best-effort goals (not commitments):

- Acknowledgement within 7 days
- Assessment (valid / not valid / needs more info) within 14 days
- Fix timeline depends on severity and maintainer availability

Reporters who follow responsible disclosure (no public disclosure before a fix
is available or 90 days, whichever comes first) will be credited in the release
notes if they wish.

## Limitations of liability

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. See
[LICENSE](LICENSE). Nothing in this policy creates any obligation beyond what
the MIT License provides.
