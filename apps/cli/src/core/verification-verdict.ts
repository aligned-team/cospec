// The verification verdict `status` and `list` report for a change on disk. It
// is the archive gate's own verdict (`computeVerificationVerdict`: unresolved
// and unparseable rows) plus every `verification/*` ERROR that `cospec archive`'s
// validation step raises on `verification.md` — so `archiveReady` cannot say yes
// while archive refuses the ledger on `verification/deferred-reason`,
// `verification/structure`, `verification/evidence-required` and the rest. Kept
// apart from ./verification.ts because the rules import that parser.
//
// Two gates, split the way archive splits them. The gate's own verdict (unresolved
// and unparseable rows) applies only where the type and `schemaVersion` enforce
// `verification`. Archive's validation runs the ledger rules whenever the type
// *declares* `verification` and the file exists — a `build`/`ci`/`revert` ledger,
// or a v1 `fix`/`feat`/`perf`/`refactor` one, is validated though not required —
// so those errors block here too, with `declared` still false.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isCospecType, TYPE_ARTIFACTS } from './rules/type-facts.ts'
import { verificationRules } from './rules/verification.ts'
import { computeVerificationVerdict, type VerificationVerdict } from './verification.ts'

/** The change facts the ledger rules read besides the ledger itself. */
export interface VerdictChange {
  id: string
  /** the change's schema/type name. */
  schema: string
}

/**
 * The verdict for the change at `changeDir`: reads its `verification.md` (absent
 * is `undefined`) and computes the verdict `status`, `list` and the archive gate
 * share. `applyRequires` is the artifact set the change's type and
 * `schemaVersion` enforce; when it omits `verification` the verdict is
 * undeclared and the file is read only if the type still declares it, to name
 * the `verification/*` errors archive's validation would refuse on.
 */
export function readVerificationVerdict(
  changeDir: string,
  change: VerdictChange,
  applyRequires: readonly string[],
  extraLayers: readonly string[] = [],
): VerificationVerdict {
  const declared = applyRequires.includes('verification')
  const validated =
    declared ||
    (isCospecType(change.schema) && TYPE_ARTIFACTS[change.schema].declared.includes('verification'))
  const path = join(changeDir, 'verification.md')
  const text = validated && existsSync(path) ? readFileSync(path, 'utf8') : undefined
  const verdict = computeVerificationVerdict(declared, declared ? text : undefined)
  if (text === undefined) return verdict

  // `row-grammar` is already the verdict's "do not parse" reason. Only ERRORs
  // block: a surface-promoted row rule is an ERROR under `--strict` alone, and
  // archive validates without it — so the proposal's `## Surfaces`, which feed
  // only those rules, need not be read.
  const issues = verificationRules(
    { id: change.id, verificationText: text, proposalText: undefined },
    { name: change.schema, applyRequires: [...applyRequires] },
    { strict: false, extraLayers },
  ).filter((i) => i.level === 'ERROR' && i.rule !== 'verification/row-grammar')
  return {
    ...verdict,
    blockedReasons: [
      ...verdict.blockedReasons,
      ...issues.map(
        (i) => `${i.rule}${i.line === undefined ? '' : ` (line ${i.line})`}: ${i.message}`,
      ),
    ],
  }
}
