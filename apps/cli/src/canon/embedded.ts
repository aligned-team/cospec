// Embedded canon registry. Every canon file is statically imported with
// `{ type: 'file' }` so `bun build --compile` embeds it into the standalone
// executable ($bunfs), where `readFileSync` still works on the returned path.
// Under `bun run` the imports resolve to the on-disk absolute paths, so both
// modes read the same bytes. Loaders MUST resolve canon files through
// `canonFile()` — a `join(import.meta.dir, ...)` path does not exist inside
// the compiled binary (the standalone `cospec init` regression).
//
// Adding a canon file means adding its import + map entry here; `canonFile`
// throws on a miss so a forgotten entry fails loudly, not with a silent ENOENT
// only inside compiled binaries.

import applyInstruction from './apply-instruction.yaml' with { type: 'file' }
import artifactBlockingChanges from './artifacts/blocking-changes/meta.yaml' with { type: 'file' }
import artifactDesign from './artifacts/design/meta.yaml' with { type: 'file' }
import artifactProposal from './artifacts/proposal/meta.yaml' with { type: 'file' }
import artifactSpecs from './artifacts/specs/meta.yaml' with { type: 'file' }
import artifactTasks from './artifacts/tasks/meta.yaml' with { type: 'file' }
import artifactVerification from './artifacts/verification/meta.yaml' with { type: 'file' }
import gateCommitlint from './gate/commitlint.config.mjs.tpl' with { type: 'file' }
import gateHk from './gate/hk.pkl.tpl' with { type: 'file' }
import gateMise from './gate/mise.toml.tpl' with { type: 'file' }
import typeBuild from './types/build.yaml' with { type: 'file' }
import typeChore from './types/chore.yaml' with { type: 'file' }
import typeCi from './types/ci.yaml' with { type: 'file' }
import typeDocs from './types/docs.yaml' with { type: 'file' }
import typeFeat from './types/feat.yaml' with { type: 'file' }
import typeFix from './types/fix.yaml' with { type: 'file' }
import typePerf from './types/perf.yaml' with { type: 'file' }
import typeRefactor from './types/refactor.yaml' with { type: 'file' }
import typeRevert from './types/revert.yaml' with { type: 'file' }
import typeStyle from './types/style.yaml' with { type: 'file' }
import typeTest from './types/test.yaml' with { type: 'file' }
import workflowApply from './workflows/apply.md' with { type: 'file' }
import workflowArchive from './workflows/archive.md' with { type: 'file' }
import workflowContinue from './workflows/continue.md' with { type: 'file' }
import workflowExplore from './workflows/explore.md' with { type: 'file' }
import workflowHarness from './workflows/harness.yaml' with { type: 'file' }
import workflowPropose from './workflows/propose.md' with { type: 'file' }
import workflowSyncSpecs from './workflows/sync-specs.md' with { type: 'file' }

/** Canon-relative path -> readable file path (on-disk in dev, $bunfs compiled). */
const CANON_FILES: Record<string, string> = {
  'apply-instruction.yaml': applyInstruction,
  'artifacts/blocking-changes/meta.yaml': artifactBlockingChanges,
  'artifacts/design/meta.yaml': artifactDesign,
  'artifacts/proposal/meta.yaml': artifactProposal,
  'artifacts/specs/meta.yaml': artifactSpecs,
  'artifacts/tasks/meta.yaml': artifactTasks,
  'artifacts/verification/meta.yaml': artifactVerification,
  'gate/commitlint.config.mjs.tpl': gateCommitlint,
  'gate/hk.pkl.tpl': gateHk,
  'gate/mise.toml.tpl': gateMise,
  'types/build.yaml': typeBuild,
  'types/chore.yaml': typeChore,
  'types/ci.yaml': typeCi,
  'types/docs.yaml': typeDocs,
  'types/feat.yaml': typeFeat,
  'types/fix.yaml': typeFix,
  'types/perf.yaml': typePerf,
  'types/refactor.yaml': typeRefactor,
  'types/revert.yaml': typeRevert,
  'types/style.yaml': typeStyle,
  'types/test.yaml': typeTest,
  'workflows/apply.md': workflowApply,
  'workflows/archive.md': workflowArchive,
  'workflows/continue.md': workflowContinue,
  'workflows/explore.md': workflowExplore,
  'workflows/harness.yaml': workflowHarness,
  'workflows/propose.md': workflowPropose,
  'workflows/sync-specs.md': workflowSyncSpecs,
}

/** Resolve a canon-relative path to its embedded/readable file path. */
export function canonFile(rel: string): string {
  const path = CANON_FILES[rel]
  if (path === undefined) {
    throw new Error(`canon file not registered in canon/embedded.ts: ${rel}`)
  }
  return path
}
