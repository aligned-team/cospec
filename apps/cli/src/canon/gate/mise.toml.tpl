[settings]
# experimental is required for the [hooks] postinstall below to fire — without it
# `hk install --mise` never runs and no git hook gets wired.
experimental = true
lockfile = true

[env]
HK_MISE = "1"

[tools]
bun = "1"
hk = "1"
pkl = "0.31"
"npm:@commitlint/cli" = "20"
"npm:@commitlint/config-conventional" = "20"
oxlint = "1"
oxfmt = "0.56"
# cospec itself, pinned to the release this template shipped with. `cospec init`
# adds this line to an existing mise.toml; the release workflow re-stamps the
# version on every bump (scripts/mise-tasks/release/set-version).
"npm:@aligned-team/cospec" = "0.5.1"

[hooks]
postinstall = "hk install --mise"

[tasks."cospec:validate"]
description = "Validate one openspec change or all changes"
run = "cospec validate --changes --strict"

[tasks."cospec:validate:all"]
description = "Strictly validate every openspec change and spec"
run = "cospec validate --all --strict"

[tasks."cospec:new"]
description = "Create a new typed change: mise run cospec:new -- <type> <slug>"
run = "cospec new"

[tasks."cospec:apply"]
description = "Run the apply gate for a change: mise run cospec:apply -- <slug>"
run = "cospec apply"

[tasks."cospec:archive"]
description = "Archive a completed change: mise run cospec:archive -- <slug>"
run = "cospec archive"
