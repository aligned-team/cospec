# Tasks

## 1. Shared resolution outcome

- [x] 1.1 Expose the resolution outcome from `apps/cli/src/core/openspec.ts`
      (project package dir vs embedded pin, without extracting) so
      `openspecBin()` and doctor consume one resolution path

## 2. Doctor fix

- [x] 2.1 Write the regression unit test for `checkOpenspecVersion` with no
      resolvable project copy — asserts no `openspec-resolve` ERROR and the
      embedded pinned source reported — and confirm it fails before the fix
- [x] 2.2 Teach doctor's openspec check the embedded fallback: report the
      embedded pinned copy as the source (read-only, no extraction), keep
      project-copy version assertion and `openspec-version` ERROR unchanged
- [x] 2.3 Unit-cover the unchanged project-copy paths (in-range clean,
      out-of-range ERROR)

## 3. README

- [x] 3.1 Delete the doctor caveat sentence from `README.md` and
      `apps/cli/README.md`, keeping the surrounding quickstart prose coherent

## 4. Gates

- [x] 4.1 Run the verification ledger rows and record evidence, then get
      `mise run check` green
