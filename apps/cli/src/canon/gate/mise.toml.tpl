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
# cospec is not yet published to npm. Until it is, install from git and run via bunx, or add:
#   "npm:@aligned-team/conventional-openspec" = "0.1"
# For now, ensure `cospec` is on PATH (e.g. `bun link` a local checkout).

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
