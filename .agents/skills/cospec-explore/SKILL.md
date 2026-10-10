---
name: cospec-explore
description: Investigate the codebase or a spec question without writing implementation code. Also use when the user says "cospec explore" or "openspec explore".
license: MIT
compatibility: Requires the cospec CLI (@aligned-team/cospec).
metadata:
  author: cospec
  generatedBy: cospec@0.11.0
  contentHash: sha256:d27460cd95944aef5141b0ab99f94ca1013ab153751efeba453a3c4ca19c8c0d
---

Investigate a question about the codebase, a spec, or a proposed change — in
thinking mode. Explore and explain; do not write implementation code.

**Project check:** These steps expect a project that already uses cospec. Before
the first step that writes anything (`cospec new`, `cospec archive`,
`cospec sync-specs`, or authoring an artifact file), confirm the project has a
root: run `cospec list --json` (with `--store <id>` when a store is selected,
since the store is then the root) and read `root`. A root object means the
project is set up. `"root": null` means it is not — there is no `openspec/`
directory here, and a write such as `cospec new` would create one as a side
effect. The command also exits non-zero, which is that answer rather than a
broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` entry's `message` starts
with `Declared in` or `Invalid store declaration in` and names this project's
`openspec/config.yaml` (or `config.yml`), the project does use cospec through a
store it declares, which this machine cannot resolve (the store is not
registered, or the `store:` line is malformed). Do not treat it as uninitialized
and do not take either branch below: stop before writing and show the user that
entry's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was
reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming
  cospec, naming this skill, or running its command. Stop using cospec and
  answer the request normally, as you would with no cospec installed. Do not ask
  them to set anything up and do not mention cospec setup.
- **Explicit cospec request**: the user named cospec, named this skill, or ran
  its command. Stop before writing and ask how to proceed: set this project up
  (`cospec init`), target a store they already have (`--store <id>`), or
  continue without cospec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run
`cospec init` until the user asks for it, do not hand-create `openspec/` files,
and do not let a command create it.

**Choosing a change:** When a step asks you to choose among changes and the
choice is not obvious, run `cospec list --json` (with `--store <id>` when a
store is selected) and keep its order, which is most recently modified first.
Never pass `--sort name`. Present the top 3-4 changes as options, each showing
its name, its type, its gate state, its task progress (for example "0/5 tasks",
"complete", or "no tasks"), and how recently it was modified, read from the
`lastModified` field. Mark the first option "(Recommended)", since the most
recently modified change is the likeliest one. Ask the user to pick, and never
guess.

## Ground yourself first

Three read-only commands, in this order:

- `cospec list --json` — the changes in flight: their slugs, types, and status.
- `cospec list --specs` — the project's durable capabilities. `cospec list` on
  its own never shows these; add `--json` for ids and requirement counts. This
  is the inventory of what the project already claims to do, and it is the thing
  you check before concluding that something is missing.
- `cospec context --json` — the resolved root and the project's registered
  stores. It never lists changes; that is what `cospec list` is for. Use
  `root.path` from this output whenever you need a path; never guess at the
  root.

To look at one capability without pulling a whole spec file into context, run
`cospec show "<spec-id>" --type spec --no-scenarios` — it returns that
capability's purpose and requirement texts. `--type spec` stops a change of the
same name from making the item ambiguous. That filtered read is an overview
only: before you conclude that a behavior is already covered, or that it should
change, read the relevant spec in full — scenarios included — with
`cospec show "<spec-id>" --type spec`.

Do NOT read `openspec/config.yaml` (or `config.yml`), `openspec/schemas/`, or
any other bookkeeping file by hand. The project's own `context` and `rules` are
injected into `cospec instructions <artifact> --change <slug> --json` and reach
you there, at the moment you write that artifact. They are constraints on your
thinking, not material to reproduce: do NOT copy them into the conversation or
into any artifact you write.

## What you may do without asking

- Read specs and changes: `cospec list --json`, `cospec list --specs`,
  `cospec show "<id>" --type spec`, `cospec status --change <slug> --json`,
  `cospec validate <slug>`.
- Read source, trace how things work, run read-only commands.

## Planning a change

When the user is thinking through work they might do, guide them toward shared
understanding with focused discovery questions. For open-ended discussion,
follow the conversation; do not impose an interview or a required output.

Before you ask a factual question, check. Read the specs, changes, source,
tests, and docs that would answer it, and do not ask the user to repeat a fact
you can verify yourself. Summarize what you found without reproducing project
context or rules. If the evidence is missing, conflicting, or out of reach, say
so and ask only for the clarification you need to proceed.

- **Follow dependencies.** Resolve the next blocking decision before the details
  that hang off it — the outcome and the scope before the API or the data model.
  Revisit downstream assumptions when an earlier answer changes, and skip
  branches that do not matter to this goal.
- **Keep questions focused.** Ask one question at a time, and say which decision
  it unlocks. Batch only if the user asks for a batch, and keep the batch small
  and related.
- **Offer grounded recommendations.** Where the evidence supports one, state
  your preferred option and why it fits, with the alternatives and their
  tradeoffs. Do not invent intent, priorities, or external constraints — ask
  when only the user can answer.
- **Keep the record in the conversation, not in files.** Separate confirmed
  decisions from proposed defaults and open questions. Silence is not
  acceptance, and accepting an answer — or a batch of recommendations — is not
  permission to write. Write confirmation is its own step, below.
- **Visual.** Use ASCII diagrams liberally when they'd help clarify thinking.

**Draw with plain ASCII only** — borders `+` `-` `|`, arrows `-->` `<--` `^` `v`,
markers `*` `x`. Unicode diagram glyphs can render at different widths across
terminals, fonts, and locales, so padded boxes and aligned tables can drift. Keep
every diagram character ASCII.

Stop asking once the user has enough clarity. Let them pause, pivot, or defer a
decision; do not exhaust every branch or force a proposal.

## Before the first write

Reads are free; writes are not. Before the first action that writes anything —
drafting or refining an artifact, and `cospec new` too, since it scaffolds files
— name the exact artifacts and files you would change and what you would put in
them, ask a direct yes/no question, and wait for the user's answer in a separate
message.

One case needs no yes/no question: **the user's own explicit request to capture
the exploration as a change is itself the confirmation.** It covers scaffolding
that change and writing the artifacts the request names, and nothing else — do
not re-ask for what they just asked for, and do ask before anything beyond it.
This holds only when the request is theirs. A "yes" to an offer you made
confirms only the scope your offer named, so name the change and the artifacts
in the offer.

Every other confirmation covers only the scope you described. Ask again before
widening it. Answering a design or clarifying question is never consent to
write, and neither is enthusiasm about an idea.

Once confirmed, create the change with `cospec new <type> <slug>` — never by
hand — and draft or refine each artifact via
`cospec instructions <artifact> --change <slug> --json`, following its template
and format exactly. When the requested capture is done, stop there and name
where the work continues: `$cospec-propose (Codex) or /cospec-propose (other agents)` writes any remaining planning
artifacts, and `$cospec-apply-change (Codex) or /cospec-apply-change (other agents)` implements the change once tasks exist. Capturing
an artifact never starts implementing it.

## What you must not do

- Do not write or edit application or source code. Workflow configuration counts
  as code: creating or editing `openspec/schemas/`, templates, or
  `openspec/config.yaml` is a change, not thinking.
- Do not run `cospec apply` or `cospec archive`. Implementation happens from
  `$cospec-apply-change (Codex) or /cospec-apply-change (other agents)`, never from explore mode.
- Do not create a new change unless the user explicitly asks. If the exploration
  concludes that work is warranted, recommend `$cospec-propose (Codex) or /cospec-propose (other agents) "<type>: <what>"`
  and stop.
- Do not hand-create a change directory under `openspec/changes/`. `cospec new`
  writes the metadata that makes a change real — and only after the user has
  confirmed.

Report findings clearly, cite the files you read, and end with one concrete
recommended next step — `$cospec-propose (Codex) or /cospec-propose (other agents) "<type>: <what>"` when the exploration
concluded that work is warranted, or `$cospec-apply-change (Codex) or /cospec-apply-change (other agents) <slug>` when the change it
belongs to already has tasks.
