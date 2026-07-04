// hk.pkl — scaffolded by `cospec init --gate` (jdx/hk config).
// commit-msg lints the message and warns on type/change mismatches; pre-commit validates the
// staged openspec changes and reconciles blocker check-offs; pre-push validates everything.
// All openspec access goes through `cospec` — never bare `openspec`.
amends "package://github.com/jdx/hk/releases/download/v1.48.0/hk@1.48.0#/Config.pkl"

local tsGlobs = List("**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs")

// oxlint/oxfmt blocks are written only into fresh repos; existing repos keep their own linters.
local linters = new Mapping<String, Step> {
  ["oxfmt"] {
    glob = tsGlobs
    check = "oxfmt --check {{files}}"
    fix = "oxfmt {{files}}"
    batch = true
    prefix = "mise exec --"
  }
  ["oxlint"] {
    glob = tsGlobs
    check = "oxlint {{files}}"
    fix = "oxlint --fix {{files}}"
    batch = true
    prefix = "mise exec --"
  }
}

hooks {
  ["commit-msg"] {
    steps {
      ["commitlint"] {
        check = "bunx commitlint --edit {{commit_msg_file}}"
        exclusive = true
      }
      ["cospec-check-commit"] {
        check = #"cospec check-commit "{{commit_msg_file}}""#
      }
    }
  }
  ["pre-commit"] {
    fix = true
    stash = "git"
    steps = new {
      ...linters
      ["cospec-validate"] {
        glob = List("openspec/changes/**")
        exclude = List("openspec/changes/archive/**")
        check = "cospec validate --changes --strict"
        exclusive = true
      }
      ["cospec-sync-blockers"] {
        glob = List("openspec/changes/**")
        exclude = List("openspec/changes/archive/**")
        check = "cospec sync-blockers --check"
        fix = "cospec sync-blockers"
      }
    }
  }
  ["pre-push"] {
    steps {
      ["cospec-validate-all"] {
        check = "cospec validate --all --strict"
        exclusive = true
      }
    }
  }
}
