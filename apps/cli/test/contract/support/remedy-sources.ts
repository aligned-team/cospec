// Every line of the pinned dist (`@fission-ai/openspec` 1.13.1) that names a
// bare `openspec <command>`, keyed by module and trimmed source line (never by
// line number, so a pin that only shifts lines passes and one that adds or
// rewords a remedy fails), with where its text goes: the id of the
// `core/remedies.ts` entry that respells it, or why no cospec relay ever
// prints it. Read by `remedy-enumeration.test.ts`; also lists the lines of the
// sentences a `{cmd}` hole ends, which name no command themselves. A third
// list, `REACHABLE_OWNED`, names the lines a cospec relay prints unspelled on a
// successful answer, each with the roadmap PR that owns its spelling.

/** Why a line's text never reaches a cospec relay. */
export const notRelayed = {
  INIT: "only `openspec init` runs it; `cospec init` is native and never spawns the binary's `init`",
  UPDATE:
    "only `openspec update` runs it, or `config profile`'s apply step, which runs `update` inside the interactive `config profile` with no preset — a terminal handover (inherited stdio) no relay reads; cospec never spawns `update` (`cospec update` is native)",
  // The terminal-handover residual (design D11): what the binary can still
  // print inside a live interactive session, on the terminal cospec handed
  // it, where no relay reads. Recorded here, as cospec-roadmap ruled, and on
  // the docs' "How cospec relates to OpenSpec" page; `exceptions.yaml`
  // (capabilities cospec never implements) is untouched.
  HANDOVER_SESSION_PROFILE:
    "`config profile` with no preset, on a TTY once its pre-flight has cleared the handover (`commands/config.ts` runHandover): the interactive menu's session output, on the inherited terminal no relay reads; with no TTY on stdout or an unreadable config cospec runs the call piped and relays it respelled",
  HANDOVER_SESSION_WORKSET_OPEN:
    '`workset open` on a TTY for a saved workset with a surviving member folder (`commands/workset.ts` runWorksetOpen), when the tool it resolves cannot be found or launched: printed on the inherited terminal no relay reads; with no TTY, `CI` or `OPEN_SPEC_INTERACTIVE=0` cospec runs the call piped and relays it respelled',
  VERSION:
    "upstream's update check is off under the wrapped env (`OPENSPEC_TELEMETRY=0`, `WRAPPED_ENV`), and cospec has no `upgrade` command",
  TELEMETRY:
    'every spawn sets `OPENSPEC_TELEMETRY=0` (`WRAPPED_ENV` and both handovers), which turns the first-run notice off',
  TIP: 'every spawn sets `OPENSPEC_NO_COMPLETIONS=1` (`WRAPPED_ENV` and both handovers, `config` and `workset open`), which turns the first-run completions tip off',
  STORE_PATH:
    "raised only for `--store-path`: table rows refuse it in cospec's parser before any spawn, and forward rows answer the binary's refusal with cospec's own redirect (`relayStorePathRefusal`)",
  SHOW_EMPTY:
    "the binary's Nothing-to-show screen, printed only when commander leaves `show` no item: `cospec show` answers every such argv itself (`commands/show.ts` binaryAnswers — no token, an empty token, only declared flags with their values, a short value attached as `-r1`/`-r=1`/`-rr`) and never spawns the binary for it",
  VIEW_DIR:
    'names the `openspec/` directory, not a command, and `cospec view` refuses a root with no `openspec/` itself before spawning (`commands/view.ts`)',
  HIDDEN_OPTION:
    'the description of the hidden `--store-path` option (`.hideHelp()`), which no help screen prints; cospec prints its own help',
  EXPERIMENTAL:
    "`cospec experimental` is native (`commands/experimental.ts`): it prints its own respelled note and runs `cospec init`, never the binary's `experimental`",
  NOUN_CHANGE:
    'only the noun-form `openspec change …` commands run it; cospec has no `change` command',
  NOUN_CHANGE_NO_NAME:
    "ChangeCommand's no-name branches, reached by `openspec change show|validate` with no name: cospec has no `change` command, and `cospec show` never passes the binary an empty item (`commands/show.ts` binaryAnswers)",
  NOUN_CHANGE_VALIDATE:
    'ChangeCommand.validate, run only by `openspec change validate`; cospec has no `change` command',
  NOUN_SPEC: 'only the noun-form `openspec spec …` commands run it; cospec has no `spec` command',
  DEFAULT_NEW_CHANGE_HINT:
    "`validateChangeExists`'s fallback hint, used only when a caller passes none: every caller (`instructions` three times, `status`) passes its own `newChangeHint`, allowlisted on its own line, and `templates` never calls it (`templates.js` validates only the schema; probed `templates` with no schema, `--schema nope` in text and `--json`, `-- x`, `x`, `--bogus`, `--json` and `--store <id>` under node, in a planning root and in a rootless directory with a store registered, none printing a `Create one with` sentence)",
  COMPLETION:
    "`cospec completion` is native (`commands/completion.ts`) and never spawns the binary's `completion`",
} as const

/** Whole module trees no cospec relay prints from, and why. */
export const NOT_RELAYED_TREES: readonly (readonly [prefix: string, reason: string])[] = [
  [
    'core/templates/',
    'skill and command bodies the binary writes into a project for `init`/`update`; cospec composes its own from canon and never spawns either',
  ],
  [
    'core/github-copilot/',
    'GitHub Copilot cloud files written only by `init --copilot-cloud`/`update`, which cospec never spawns',
  ],
  [
    'core/completions/generators/',
    "shell completion scripts for `openspec completion`; `cospec completion` is native and never spawns the binary's",
  ],
]

/** [module under dist/, trimmed source line, remedy id or not-relayed reason]. */
export const REMEDY_SOURCES: readonly (readonly [file: string, line: string, where: string])[] = [
  [
    'core/worksets.js',
    "? `Saved worksets: ${savedNames.join(', ')}. See them with: openspec workset list`",
    'workset/saved-list',
  ],
  [
    'core/worksets.js',
    ': `Create it first: openspec workset create ${name}`,',
    'workset/create-first',
  ],
  [
    'core/worksets.js',
    'fix: `Choose another name, or remove it first: openspec workset remove ${workset.name}`,',
    'workset/remove-first',
  ],
  [
    'core/global-config.js',
    '\'Fix it with "openspec config edit", or reset it with "openspec config reset --all".\');',
    'config/invalid-file',
  ],
  [
    'core/update.js',
    "throw new Error(`No OpenSpec directory found. Run 'openspec init' first.`);",
    notRelayed.UPDATE,
  ],
  [
    'core/update.js',
    'console.log(chalk.dim(`Re-run "openspec update" and accept the move to ${migration.to}/ to resume updates.`));',
    notRelayed.UPDATE,
  ],
  [
    'core/update.js',
    'console.log(chalk.dim(\'Run "openspec init" to set up tools.\'));',
    notRelayed.UPDATE,
  ],
  [
    'core/update.js',
    "`Run 'openspec config set delivery both' to generate skills.`));",
    notRelayed.UPDATE,
  ],
  [
    'core/update.js',
    'console.log(chalk.dim("GitHub Copilot cloud coding-agent files are available (opt-in). Enable with \'openspec init --copilot-cloud\'."));',
    notRelayed.UPDATE,
  ],
  [
    'core/update.js',
    "console.log(chalk.yellow(`Detected new ${toolNoun}: ${newToolNames.join(', ')}. Run 'openspec init' to add ${pronoun}.`));",
    notRelayed.UPDATE,
  ],
  [
    'core/update.js',
    'console.log(chalk.dim(`Note: ${extraWorkflows.length} extra workflows not in profile (use \\`openspec config profile\\` to manage)`));',
    notRelayed.UPDATE,
  ],
  [
    'core/update.js',
    'console.log(chalk.dim(`Run \\`openspec config profile\\` to add ${pronoun}, or \\`openspec config profile core\\` to use the core set.`));',
    notRelayed.UPDATE,
  ],
  [
    'core/migration.js',
    "console.log(`New in this version: ${proposeReference}. Try 'openspec config profile core' for the streamlined experience.`);",
    notRelayed.UPDATE,
  ],
  [
    'core/specs-apply.js',
    '`openspec validate --strict reports it as too brief.`);',
    'archive/purpose-too-brief',
  ],
  [
    'core/root-selection.js',
    'return `Run openspec store doctor ${id} to inspect it.`;',
    'root/store-doctor',
  ],
  [
    'core/root-selection.js',
    'fix: `Run openspec store setup ${id} or openspec store register <path> first.`,',
    'root/no-registered-stores',
  ],
  [
    'core/root-selection.js',
    "fix: 'Pass a registered store id, or run openspec store list.',",
    'root/unknown-store',
  ],
  [
    'core/root-selection.js',
    '? `Register the store (openspec store register <path> --id ${pointer.value}) or edit ${pointer.filePath} to name a registered store.`',
    'root/declared-unknown-store',
  ],
  [
    'core/root-selection.js',
    '? `Register the store (openspec store register <path> --id ${id}) or clear the stale global default (openspec config unset defaultStore).`',
    'root/stale-default-store',
  ],
  [
    'core/root-selection.js',
    "throw new RootSelectionError('--store-path is not supported. Register the path with openspec store register <path>, then select it with --store <id>.', 'store_path_not_supported', {",
    notRelayed.STORE_PATH,
  ],
  [
    'core/root-selection.js',
    "fix: 'openspec store register <path>, then rerun with --store <id>.',",
    notRelayed.STORE_PATH,
  ],
  [
    'core/root-selection.js',
    "throw new RootSelectionError(`No OpenSpec root found in the current directory or its ancestors. Registered stores: ${registeredIds.join(', ')}. Pass --store <id> to use one, or run openspec init to create a local root.`, 'no_root_with_registered_stores', {",
    'root/no-root-registered',
  ],
  [
    'core/root-selection.js',
    "fix: `Rerun with --store <id> (registered: ${registeredIds.join(', ')}) or run openspec init.`,",
    'root/no-root-registered-fix',
  ],
  [
    'core/root-selection.js',
    "throw new RootSelectionError('No OpenSpec root found from the current directory.', 'no_openspec_root', { target: 'openspec.root', fix: 'Run openspec init to create a root here.' });",
    'root/no-root-fix',
  ],
  [
    'core/relationship-health.js',
    "status.push(warning('relationship_registry_unreadable', 'The store registry is unreadable; reference health cannot be checked.', 'Run: openspec store doctor'));",
    'references/store-doctor',
  ],
  [
    'core/references.js',
    'return `git clone -- ${remote} ${quoted} && openspec store register ${quoted} --id ${id}`;',
    'references/clone',
  ],
  [
    'core/references.js',
    'return `Get a checkout from a teammate and run: openspec store register <path> --id ${id}`;',
    'references/get-checkout',
  ],
  [
    'core/references.js',
    'return `openspec show <spec-id> --type spec --store ${storeId}`;',
    'references/fetch',
  ],
  [
    'core/references.js',
    "warning('reference_registry_unreadable', `Referenced store '${id}' cannot be checked: the store registry is unreadable.`, 'Run: openspec store doctor'),",
    'references/store-doctor',
  ],
  [
    'core/references.js',
    "warning('reference_root_unhealthy', `Referenced store '${id}' is registered but not usable (${inspection.kind.replace(/_/g, ' ')}).`, `Run: openspec store doctor ${id}`),",
    'references/store-doctor-id',
  ],
  [
    'core/references.js',
    "entry.status.push(warning('reference_index_truncated', `Referenced store '${id}' index truncated at the 50KB budget (${low} of ${specs.length} specs listed).`, `List the rest directly: openspec list --specs --store ${id}`));",
    'references/list-rest',
  ],
  [
    'core/completion-tip.js',
    'export const COMPLETION_TIP_MESSAGE = "Tip: Run \'openspec completion install\' for shell completions";',
    notRelayed.TIP,
  ],
  ['core/view.js', "console.error(chalk.red('No openspec directory found'));", notRelayed.VIEW_DIR],
  [
    'core/view.js',
    "console.log(chalk.dim(`\\nUse ${chalk.white('openspec list --changes')} or ${chalk.white('openspec list --specs')} for detailed views`));",
    'view/footer',
  ],
  [
    'core/version-check.js',
    'lines.push(\'  Then run "openspec update" again to pick up new workflows.\');',
    notRelayed.VERSION,
  ],
  [
    'core/version-check.js',
    'console.log(chalk.dim(\'  Run "openspec update" to pick up the new workflows.\'));',
    notRelayed.VERSION,
  ],
  [
    'core/change-status-policy.js',
    'const command = `openspec instructions ${readyArtifact.id} --change "${input.changeName}"${storeFlag} --json`;',
    'status/next-artifact',
  ],
  [
    'core/change-status-policy.js',
    'const command = `openspec instructions apply --change "${input.changeName}"${storeFlag} --json`;',
    'status/next-apply',
  ],
  [
    'core/change-status-policy.js',
    'return { command, sentence: `Run ${command} before writing that artifact.` };',
    'status/next-artifact-sentence',
  ],
  [
    'core/change-status-policy.js',
    'sentence: `All planning artifacts are complete. Run ${command} to inspect implementation progress.`,',
    'status/next-apply-sentence',
  ],
  [
    'core/onboarding-commands.js',
    '`Add ${pronoun} with \\`openspec config profile\\`.`,',
    notRelayed.UPDATE,
  ],
  [
    'core/init.js',
    '`). Fix or remove the store: line before running openspec init.`);',
    notRelayed.INIT,
  ],
  [
    'core/init.js',
    'console.log(chalk.dim("Skipped GitHub Copilot cloud files (opt-in). Enable with \'openspec init --copilot-cloud\'."));',
    notRelayed.INIT,
  ],
  [
    'core/init.js',
    "`Run 'openspec config set delivery both' to generate skills.`));",
    notRelayed.INIT,
  ],
  [
    'core/init.js',
    'console.log("Done. Run \'openspec config profile\' to configure your workflows.");',
    notRelayed.INIT,
  ],
  [
    'core/archive.js',
    'return `${withStoreFlag(root, `openspec archive ${flags}`)} -- ${quoteChangeName(changeName)}`;',
    'archive/rerun-dash',
  ],
  [
    'core/archive.js',
    'return withStoreFlag(root, `openspec archive ${quoteChangeName(changeName)} ${flags}`);',
    'archive/rerun',
  ],
  [
    'core/archive.js',
    "throw new ArchiveBlockedError('archive_change_name_required', 'A change name is required: archive --json is non-interactive.', withStoreFlag(root, 'openspec archive <change-name> --json'));",
    'archive/name-required-json',
  ],
  [
    'core/archive.js',
    "throw new ArchiveBlockedError('archive_validation_failed', `Validation failed for change '${changeName}'.`, `Run ${withStoreFlag(root, `openspec validate ${changeName}`)} for details, fix the errors, or rerun with --no-validate.`);",
    'archive/validation-failed',
  ],
  [
    'core/archive.js',
    "throw new ArchiveBlockedError('archive_confirmation_required', 'Skipping validation requires confirmation: rerun with --yes.', withStoreFlag(root, 'openspec archive <change-name> --json --no-validate --yes'));",
    'archive/no-validate-yes',
  ],
  [
    'core/archive.js',
    "throw new ArchiveBlockedError('archive_confirmation_required', `Updating ${specUpdates.length} spec(s) requires confirmation: rerun with --yes.`, withStoreFlag(root, 'openspec archive <change-name> --json --yes'));",
    'archive/specs-yes',
  ],
  [
    'core/archive.js',
    '`Run ${withStoreFlag(root, `openspec validate ${specName}`)} after fixing the change deltas.`);',
    'archive/validate-spec',
  ],
  [
    'core/archive.js',
    "throw new ArchiveBlockedError('archive_change_name_required', 'A change name is required: no terminal is available to choose one from a list.', withStoreFlag(root, `openspec archive <change-name> ${rerunFlags(options).join(' ')}`));",
    'archive/name-required',
  ],
  [
    'core/archive.js',
    "throw new ArchiveBlockedError('archive_change_name_required', 'A change name is required: no answer could be read from stdin.', withStoreFlag(root, `openspec archive <change-name> ${rerunFlags(options).join(' ')}`));",
    'archive/name-required',
  ],
  [
    'core/archive.js',
    "}, () => new ArchiveBlockedError('archive_tasks_incomplete', `${incompleteTasks} incomplete task(s) found for change '${describeChangeName(changeName)}', and no answer could be read from stdin.`, `Complete the tasks or rerun with ${rerunCommand(root, changeName, options)}`));",
    'archive/tasks-rerun',
  ],
  [
    'core/validation/constants.js',
    "PURPOSE_IS_PLACEHOLDER: 'Purpose section is still a placeholder rather than a Purpose anyone wrote (the sentence `openspec archive` ' +",
    'validation/purpose-placeholder',
  ],
  [
    'core/validation/constants.js',
    'GUIDE_NO_DELTAS: \'No deltas found. Ensure your change has a specs/ directory with capability folders (e.g. specs/http-server/spec.md) containing .md files that use delta headers (## ADDED/MODIFIED/REMOVED/RENAMED Requirements) and that each requirement includes at least one "#### Scenario:" block. If this change intentionally modifies no specs (pure refactor, tooling, docs), set "skip_specs: true" in the change\\\'s .openspec.yaml instead. Tip: run "openspec change show <change-id> --json --deltas-only" to inspect parsed deltas.\',',
    'validation/no-deltas-tip',
  ],
  [
    'core/store/operations.js',
    'fix: `openspec store setup ${id} --path ~/openspec/${id}`,',
    'store/setup-example',
  ],
  [
    'core/store/operations.js',
    "fix: 'openspec store register /path/to/store',",
    'store/register-example',
  ],
  [
    'core/store/operations.js',
    "fix: 'Rerun openspec store setup to re-evaluate the directory.',",
    'store/setup-reevaluate',
  ],
  [
    'core/store/operations.js',
    ": 'Run openspec store setup for a new store, or point register at a checkout whose openspec/ files are present.',",
    'store/setup-or-register',
  ],
  [
    'core/store/operations.js',
    "? `One checkout per store id is supported, and '${metadata.id}' is already registered. Run openspec store unregister ${metadata.id} first to register this checkout instead.`",
    'store/one-checkout',
  ],
  [
    'core/store/operations.js',
    'fix: \'Run "openspec store unregister <id>" if you only want to forget this local registry entry.\',',
    'store/unregister-entry',
  ],
  [
    'core/store/operations.js',
    "const unregister = nested.map((other) => `openspec store unregister ${other.id}`).join(', then ');",
    'store/unregister-nested',
  ],
  [
    'core/store/operations.js',
    "fix: `Unregister or remove ${nested.length === 1 ? 'that store' : 'those stores'} first (${unregister}), or run \"openspec store unregister ${id}\" to forget '${id}' without deleting files.`,",
    'store/remove-nested',
  ],
  [
    'core/store/operations.js',
    'fix: `Run openspec store register /path/to/${entry.id} --id ${entry.id}.`,',
    'store/register-missing',
  ],
  [
    'core/store/operations.js',
    "fix: 'Run openspec store list to see registered stores.',",
    'store/list-registered',
  ],
  [
    'core/validation/task-checkboxes.js',
    '\'so "openspec list" and "openspec status" report no work and "openspec archive" \' +',
    'validation/zero-tasks',
  ],
  [
    'core/store/registry.js',
    'fix: `Use the existing registration, or run openspec store unregister ${id} first to switch this id to a different checkout.`,',
    'store/unregister-first',
  ],
  [
    'core/store/registry.js',
    "fix: 'Run openspec store list to see registered stores.',",
    'store/list-registered',
  ],
  [
    'core/store/registry.js',
    'fix: `Create ${getStoreMetadataPath(storeRoot)} or rerun "openspec store register <path>".`,',
    'store/metadata-rerun',
  ],
  [
    'core/store/registry.js',
    "fix: 'Register a store with openspec store register <path>, then select it with --store <id>.',",
    'store/register-then-select',
  ],
  [
    'commands/workset-input.js',
    "? `Install '${opener.command}' or run: openspec workset open ${worksetName} --tool ${alternative}`",
    'workset/tool-alternative',
  ],
  [
    'commands/workset-input.js',
    "? `Install '${opener.command}' or run: openspec workset open ${worksetName} --tool ${alternative}`",
    notRelayed.HANDOVER_SESSION_WORKSET_OPEN,
  ],
  [
    'commands/workset-input.js',
    ": `Install '${opener.command}', then rerun: openspec workset open ${worksetName}`,",
    'workset/tool-rerun',
  ],
  [
    'commands/workset-input.js',
    ": `Install '${opener.command}', then rerun: openspec workset open ${worksetName}`,",
    notRelayed.HANDOVER_SESSION_WORKSET_OPEN,
  ],
  [
    'commands/workset-input.js',
    'fix: `Install one of: ${commands}. Then rerun: openspec workset open ${worksetName}`,',
    'workset/no-tool',
  ],
  [
    'commands/workset-input.js',
    'fix: `Install one of: ${commands}. Then rerun: openspec workset open ${worksetName}`,',
    notRelayed.HANDOVER_SESSION_WORKSET_OPEN,
  ],
  [
    'commands/show.js',
    "console.error('Pass --type change|spec, or use: openspec change show / openspec spec show');",
    'show/ambiguous-noun-form',
  ],
  [
    'commands/show.js',
    "console.error(`  ${withStoreFlag(root, 'openspec show <item>')}`);",
    notRelayed.SHOW_EMPTY,
  ],
  [
    'commands/show.js',
    "console.error(`  ${withStoreFlag(root, 'openspec show <item> --type change')}`);",
    notRelayed.SHOW_EMPTY,
  ],
  [
    'commands/show.js',
    "console.error(`  ${withStoreFlag(root, 'openspec show <item> --type spec')}`);",
    notRelayed.SHOW_EMPTY,
  ],
  ['commands/show.js', "console.error('  openspec change show');", notRelayed.SHOW_EMPTY],
  ['commands/show.js', "console.error('  openspec spec show');", notRelayed.SHOW_EMPTY],
  [
    'commands/config.js',
    'console.error(\'Fix it with "openspec config edit", or reset it with "openspec config reset --all".\');',
    'config/invalid-file',
  ],
  [
    'commands/config.js',
    "console.log(colorize('Warning: Global config is not applied to this project. Run `openspec update` to sync.'));",
    'config/drift-warning',
  ],
  [
    'commands/config.js',
    "console.log(colorize('Warning: Global config is not applied to this project. Run `openspec update` to sync.'));",
    notRelayed.HANDOVER_SESSION_PROFILE,
  ],
  [
    'commands/config.js',
    "console.log('Config updated. Run `openspec update` in your projects to apply.');",
    'config/profile-applied',
  ],
  [
    'commands/config.js',
    "console.log('Config updated. Run `openspec update` in your projects to apply.');",
    notRelayed.HANDOVER_SESSION_PROFILE,
  ],
  [
    'commands/config.js',
    'console.error(\'Use "openspec config list" to see available keys.\');',
    'config/list-keys',
  ],
  [
    'commands/config.js',
    "console.error('Usage: openspec config reset --all [-y]');",
    'config/reset-usage',
  ],
  [
    'commands/config.js',
    "console.error('Interactive mode required. Use `openspec config profile core` or set config via environment/flags.');",
    'config/profile-interactive-required',
  ],
  [
    'commands/config.js',
    "console.log('Run `openspec update` in your other projects to apply.');",
    notRelayed.HANDOVER_SESSION_PROFILE,
  ],
  [
    'commands/config.js',
    'console.error(`\\`openspec update\\` failed: ${asErrorMessage(error)}`);',
    notRelayed.HANDOVER_SESSION_PROFILE,
  ],
  [
    'cli/index.js',
    "return new Option('--store-path <path>', 'Not supported; register the path with \"openspec store register <path>\" and use --store <id>').hideHelp();",
    notRelayed.HIDDEN_OPTION,
  ],
  [
    'cli/index.js',
    'console.log(\'Note: "openspec experimental" is deprecated. Use "openspec init" instead.\');',
    notRelayed.EXPERIMENTAL,
  ],
  [
    'cli/index.js',
    'console.error(\'Warning: The "openspec change ..." commands are deprecated. Prefer verb-first commands (e.g., "openspec list", "openspec validate --changes").\');',
    notRelayed.NOUN_CHANGE,
  ],
  [
    'cli/index.js',
    '.description(\'List all active changes (DEPRECATED: use "openspec list" instead)\')',
    notRelayed.NOUN_CHANGE,
  ],
  [
    'cli/index.js',
    'console.error(\'Warning: "openspec change list" is deprecated. Use "openspec list".\');',
    notRelayed.NOUN_CHANGE,
  ],
  [
    'commands/change.js',
    'console.error(\'Hint: use "openspec change list" to view available changes.\');',
    notRelayed.NOUN_CHANGE_NO_NAME,
  ],
  [
    'commands/change.js',
    '`Run "openspec status --change ${changeName}" to see which artifact comes next.`);',
    'change/no-proposal',
  ],
  [
    'commands/change.js',
    "bullets.push('- Debug parsed deltas: openspec change show <id> --json --deltas-only');",
    notRelayed.NOUN_CHANGE_VALIDATE,
  ],
  [
    'commands/schema.js',
    'suggestion: \'Use --force to overwrite or "openspec schema fork" to copy\',',
    'schema/fork-suggestion',
  ],
  [
    'commands/schema.js',
    'console.error(\'Use --force to overwrite or "openspec schema fork" to copy\');',
    'schema/fork-suggestion',
  ],
  [
    'commands/schema.js',
    'console.log(`  3. Use with: openspec new --schema ${name}`);',
    'schema/use-with',
  ],
  [
    'commands/spec.js',
    'console.error(\'Warning: The "openspec spec ..." commands are deprecated. Prefer verb-first commands (e.g., "openspec show", "openspec validate --specs").\');',
    notRelayed.NOUN_SPEC,
  ],
  [
    'commands/validate.js',
    "console.error(`  ${withStoreFlag(root, 'openspec validate --all')}`);",
    'validate/hint-all',
  ],
  [
    'commands/validate.js',
    "console.error(`  ${withStoreFlag(root, 'openspec validate --changes')}`);",
    'validate/hint-changes',
  ],
  [
    'commands/validate.js',
    "console.error(`  ${withStoreFlag(root, 'openspec validate --specs')}`);",
    'validate/hint-specs',
  ],
  [
    'commands/validate.js',
    "console.error(`  ${withStoreFlag(root, 'openspec validate <item-name>')}`);",
    'validate/hint-item',
  ],
  [
    'commands/validate.js',
    "console.error('Pass --type change|spec, or use: openspec change validate / openspec spec validate');",
    'validate/ambiguous-noun-form',
  ],
  [
    'commands/validate.js',
    'bullets.push(`- Debug parsed deltas: ${withStoreFlag(root, `openspec show ${id} --json --deltas-only`)}`);',
    'validate/debug-deltas',
  ],
  [
    'commands/validate.js',
    'console.log(`Details: openspec validate ${firstFailure.id} --type ${firstFailure.type}${storeFlag}`);',
    'validate/details',
  ],
  [
    'commands/store.js',
    "fix: 'openspec store setup <id> --path ~/openspec/<id> --json',",
    'store/setup-example-json',
  ],
  [
    'commands/store.js',
    "fix: `openspec store setup ${id ?? '<id>'} --path ~/openspec/${id ?? '<id>'}`,",
    'store/setup-example',
  ],
  ['commands/store.js', 'fix: `openspec store remove ${id} --yes`,', 'store/remove-yes'],
  [
    'commands/store.js',
    'fix: \'Run "openspec store unregister <id>" if you only want to forget the local registration.\',',
    'store/unregister-registration',
  ],
  [
    'commands/store.js',
    'console.log(`  openspec new change <change-id> --store ${payload.store.id}`);',
    'store/new-change-in-store',
  ],
  [
    'commands/store.js',
    '? `Share it: teammates clone ${shareRemote} and run openspec store register <path>.`',
    'store/share-it',
  ],
  [
    'commands/store.js',
    "console.log('  openspec store setup team-context --path ~/openspec/team-context');",
    'store/setup-team-example',
  ],
  [
    'commands/store.js',
    "console.log('  openspec store register /path/to/store');",
    'store/register-example',
  ],
  [
    'commands/store.js',
    "? `Unknown command '${attempted[0]}' for 'openspec store'. Store subcommands: ${storeSubcommandsLine}.`",
    'store/unknown-subcommand',
  ],
  [
    'commands/store.js',
    ": `Missing subcommand for 'openspec store'. Store subcommands: ${storeSubcommandsLine}.`;",
    'store/missing-subcommand',
  ],
  [
    'commands/store.js',
    "let example = 'openspec new change <change-id> --store <id>';",
    'store/lifecycle-example',
  ],
  [
    'commands/store.js',
    'example = `openspec new change ${changeId} --store <id>`;',
    'store/lifecycle-example-new',
  ],
  [
    'commands/store.js',
    "example = `openspec ${attempted.join(' ')} --store <id>`;",
    'store/lifecycle-example-other',
  ],
  [
    'commands/store.js',
    "? `Error: unknown command '${attempted[0]}' for 'openspec store'.`",
    'store/unknown-subcommand-error',
  ],
  [
    'commands/store.js',
    ': "Error: missing subcommand for \'openspec store\'.");',
    'store/missing-subcommand-error',
  ],
  [
    'commands/workflow/instructions.js',
    "const changeName = await validateChangeExists(options.change, projectRoot, root.changesDir, { newChangeHint: withStoreFlag(root, 'openspec new change <name>') });",
    'workflow/new-change-hint',
  ],
  [
    'commands/workflow/instructions.js',
    'return (`${verb} \\`openspec instructions ${target} --change ${changeName}\\`` +',
    'instructions/create-it',
  ],
  [
    'commands/workflow/instructions.js',
    'return (`${verb} \\`openspec instructions ${target} --change ${changeName}\\`` +',
    'instructions/create-each',
  ],
  [
    'commands/workflow/instructions.js',
    '` (\\`openspec status --change ${changeName}\\` shows what is left).`);',
    'instructions/create-it',
  ],
  [
    'commands/workflow/instructions.js',
    '` (\\`openspec status --change ${changeName}\\` shows what is left).`);',
    'instructions/create-each',
  ],
  [
    'commands/workflow/instructions.js',
    "const warnings = (await findUnreadDeltaFiles(path.join(changeDir, 'specs'))).map((file) => `specs/${file.path} is not a capability's spec.md, so \\`openspec validate ${changeName}\\` rejects it and archive never merges it. ` +",
    'instructions/unread-delta',
  ],
  [
    'commands/workflow/instructions.js',
    '`This change has no delta specs and does not declare \\`skip_specs: true\\`, so \\`openspec validate ${changeName}\\` fails on it. ` +',
    'instructions/no-delta-specs',
  ],
  [
    'commands/workflow/instructions.js',
    '`Write the delta specs before implementing (\\`openspec instructions ${specTarget} --change ${changeName}\\`), ` +',
    'instructions/no-delta-specs',
  ],
  [
    'commands/workflow/instructions.js',
    "const changeName = await validateChangeExists(options.change, root.path, root.changesDir, { newChangeHint: withStoreFlag(root, 'openspec new change <name>') });",
    'workflow/new-change-hint',
  ],
  [
    'commands/workflow/new-change.js',
    'console.log(`Next: ${withStoreFlag(root, `openspec status --change ${payload.change.id}`)}`);',
    'new-change/next',
  ],
  [
    'commands/workflow/new-change.js',
    "console.log(chalk.dim('Run `openspec init` to finish setting this project up, or delete that directory if you meant a different project.'));",
    'new-change/implicit-root',
  ],
  [
    'commands/completion.js',
    'console.error(`Usage: openspec completion ${operationName} [shell]`);',
    notRelayed.COMPLETION,
  ],
  [
    'commands/workflow/status.js',
    "const newChangeHint = withStoreFlag(root, 'openspec new change <name>');",
    'workflow/new-change-hint',
  ],
  [
    'commands/workflow/status.js',
    'console.log(`No active changes. Create one with: ${newChangeHint}`);',
    'workflow/no-active-create',
  ],
  [
    'commands/workflow/shared.js',
    "const newChangeHint = hints.newChangeHint ?? 'openspec new change <name>';",
    notRelayed.DEFAULT_NEW_CHANGE_HINT,
  ],
  [
    'commands/workflow/shared.js',
    'throw new Error(`No changes found. Create one with: ${newChangeHint}`);',
    'workflow/no-changes-create',
  ],
  [
    'commands/workflow/shared.js',
    "throw new Error(`Change '${changeName}' not found. No changes exist. Create one with: ${newChangeHint}`);",
    'workflow/not-found-create',
  ],
  [
    'commands/workset.js',
    'fix: `Open in VS Code or Cursor: openspec workset open ${name} --tool code`,',
    'workset/open-in-code',
  ],
  [
    'commands/workset.js',
    'fix: `Open in VS Code or Cursor: openspec workset open ${name} --tool code`,',
    notRelayed.HANDOVER_SESSION_WORKSET_OPEN,
  ],
  [
    'commands/workset.js',
    'console.log(`Open it any time with: openspec workset open ${workset.name}`);',
    'workset/open-any-time',
  ],
  [
    'commands/workset.js',
    "fix: 'openspec workset create <name> --member <path>',",
    'workset/create-example',
  ],
  [
    'commands/workset.js',
    'fix: `openspec workset create ${name} --member <path> --member <name>=<path>`,',
    'workset/create-named-example',
  ],
  [
    'commands/workset.js',
    "console.log('No worksets saved. Create one with: openspec workset create');",
    'workset/none-saved',
  ],
  [
    'commands/workset.js',
    "fix: 'Inspect worksets with: openspec workset list --json',",
    'workset/inspect',
  ],
  [
    'commands/workset.js',
    'fix: `Recompose it: openspec workset remove ${name} --yes && openspec workset create ${name} --member <path>`,',
    'workset/recompose',
  ],
  ['commands/workset.js', 'fix: `openspec workset open ${name} --tool <id>`,', 'workset/open-tool'],
  [
    'commands/workset.js',
    'fix: `Run: openspec workset open ${name} --tool ${alternative}`,',
    'workset/open-alternative',
  ],
  [
    'commands/workset.js',
    'fix: `Run: openspec workset open ${name} --tool ${alternative}`,',
    notRelayed.HANDOVER_SESSION_WORKSET_OPEN,
  ],
  ['commands/workset.js', 'fix: `openspec workset remove ${name} --yes`,', 'workset/remove-yes'],
  [
    'commands/workset.js',
    "? `Unknown command '${attempted[0]}' for 'openspec workset'. Workset subcommands: ${subcommandsLine}.`",
    'workset/unknown-subcommand',
  ],
  [
    'commands/workset.js',
    ": `Missing subcommand for 'openspec workset'. Workset subcommands: ${subcommandsLine}.`;",
    'workset/missing-subcommand',
  ],
  [
    'telemetry/index.js',
    "console.error('Note: OpenSpec collects anonymous usage stats. Opt out: OPENSPEC_TELEMETRY=0 or openspec config set telemetry.enabled false');",
    notRelayed.TELEMETRY,
  ],
  // The built-in `spec-driven` schema's own instruction text and proposal
  // template (`schemas/spec-driven/schema.yaml`, `templates/proposal.md`),
  // printed only by `instructions` for a change on that schema: spelled
  // through `SCHEMA_LINES` (`core/remedies.ts`) when the schema resolves from
  // the package, never on a project or user copy (the user's own text).
  [
    'schemas/spec-driven/schema.yaml',
    "run `openspec list --specs` for the project's capability inventory, then",
    'spec-driven/proposal-list-specs',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    '`openspec show "<spec-id>" --type spec --json --no-scenarios` for any that',
    'spec-driven/proposal-show-json',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'error. `openspec list` without `--specs` lists in-flight changes, not',
    'spec-driven/proposal-list-changes',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'scenarios, with `openspec show "<spec-id>" --type spec` (same `--store` rule).',
    'spec-driven/proposal-show',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'modified) or explicitly opt out of specs: `openspec validate` rejects a',
    'spec-driven/proposal-validate',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    '- Modified capabilities: use the exact existing path from `openspec/specs/<capability-path>/` when creating the delta at `specs/<capability-path>/spec.md`. Run `openspec list --specs` to confirm that path before writing the delta, appending `--store "<id>"` only for a registered standalone store - a mistyped or invented path targets a capability that does not exist rather than the one you meant. Do not move or rename the capability.',
    'spec-driven/specs-modified-path',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'sets `skip_specs: true` (no spec-level behavior change) - `openspec validate`',
    'spec-driven/specs-skip-validate',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'one or two sentences (50+ characters, or `openspec validate --strict`',
    'spec-driven/specs-validate-strict',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'directly. `planningHome.root` comes from the `openspec instructions ...',
    'spec-driven/specs-planning-home',
  ],
  [
    'schemas/spec-driven/templates/proposal.md',
    'must set `skip_specs: true` in its .openspec.yaml - openspec validate rejects',
    'spec-driven/template-proposal-validate',
  ],
]

/**
 * The roadmap PRs that own the spelling of a line R1 relays untouched on a
 * successful answer: instructions' reference block is upstream-spellings'
 * (cospec-roadmap's confirmed ruling, round 16). (`schema init`'s
 * `3. Use with:` line, once owned by root-resolution-parity, is spelled by
 * `schema.ts` itself; context's reference block, and the next-step lines of
 * workset and config, by passthrough-json-and-doctor.)
 */
export const OWNERS = ['upstream-spellings'] as const

/** The cospec commands that relay a successful answer as the binary wrote it. */
export const SUCCESS_RELAYS = ['instructions'] as const

/**
 * [module under dist/, trimmed source line, the cospec command whose successful
 * answer relays it unspelled, the roadmap PR that owns its spelling]. Each line
 * is reachable: the binary prints it at exit 0 and the relay writes that
 * answer byte-for-byte (`relayRespelled` respells a failed answer only;
 * `workset.ts`, `config.ts` and `runPassthrough` relay stdout as written). A
 * line here may also be an allowlist entry that failure relays respell.
 */
export const REACHABLE_OWNED: readonly (readonly [
  file: string,
  line: string,
  relay: (typeof SUCCESS_RELAYS)[number],
  owner: (typeof OWNERS)[number],
])[] = [
  // `assembleReferenceIndex`'s entries: instructions' `<referenced_stores>`
  // block and `references[]`. (context's `Referenced stores` / `Not
  // available on this machine` sections and `members[]` carry the same lines,
  // spelled by `commands/context.ts` from its document's command fields.)
  ...(
    [
      'return `git clone -- ${remote} ${quoted} && openspec store register ${quoted} --id ${id}`;',
      'return `Get a checkout from a teammate and run: openspec store register <path> --id ${id}`;',
      'return `openspec show <spec-id> --type spec --store ${storeId}`;',
      "warning('reference_registry_unreadable', `Referenced store '${id}' cannot be checked: the store registry is unreadable.`, 'Run: openspec store doctor'),",
      "warning('reference_root_unhealthy', `Referenced store '${id}' is registered but not usable (${inspection.kind.replace(/_/g, ' ')}).`, `Run: openspec store doctor ${id}`),",
      "entry.status.push(warning('reference_index_truncated', `Referenced store '${id}' index truncated at the 50KB budget (${low} of ${specs.length} specs listed).`, `List the rest directly: openspec list --specs --store ${id}`));",
    ] as const
  ).map((line) => ['core/references.js', line, 'instructions', 'upstream-spellings'] as const),
  // The built-in `spec-driven` schema's own instruction text and proposal
  // template (`schemas/spec-driven/schema.yaml`, `templates/proposal.md`):
  // for a change on that schema (never on one of cospec's 11 typed schemas),
  // `cospec instructions <artifact> --change <id>` is a thin passthrough
  // (`commands/instructions.ts`) that relays the binary's successful answer
  // untouched, so this text reaches the user unspelled.
  [
    'schemas/spec-driven/schema.yaml',
    "run `openspec list --specs` for the project's capability inventory, then",
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    '`openspec show "<spec-id>" --type spec --json --no-scenarios` for any that',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'error. `openspec list` without `--specs` lists in-flight changes, not',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'scenarios, with `openspec show "<spec-id>" --type spec` (same `--store` rule).',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'modified) or explicitly opt out of specs: `openspec validate` rejects a',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    '- Modified capabilities: use the exact existing path from `openspec/specs/<capability-path>/` when creating the delta at `specs/<capability-path>/spec.md`. Run `openspec list --specs` to confirm that path before writing the delta, appending `--store "<id>"` only for a registered standalone store - a mistyped or invented path targets a capability that does not exist rather than the one you meant. Do not move or rename the capability.',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'sets `skip_specs: true` (no spec-level behavior change) - `openspec validate`',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'one or two sentences (50+ characters, or `openspec validate --strict`',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/schema.yaml',
    'directly. `planningHome.root` comes from the `openspec instructions ...',
    'instructions',
    'upstream-spellings',
  ],
  [
    'schemas/spec-driven/templates/proposal.md',
    'must set `skip_specs: true` in its .openspec.yaml - openspec validate rejects',
    'instructions',
    'upstream-spellings',
  ],
]
