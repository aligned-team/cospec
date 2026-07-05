## Why

The first push to an empty remote crashes hk 1.48's pre-push file discovery: git
reports an all-zeros remote sha for a not-yet-existing branch, hk falls back to
`origin/HEAD`, and that ref cannot exist before the first push succeeds. This
blocked publishing the repo to github.com/aligned-team/cospec.

## What Changes

- `scripts/hooks/pre-push-gate` — detect the all-zeros remote sha while reading
  the hook's stdin ref lines and pass hk an explicit `--from-ref <synthetic
  empty root commit> --to-ref HEAD` range, so the gate diffs the entire tree
  (every file is new on a first push) instead of resolving a nonexistent
  `origin/HEAD`. (`--all` is not enough: hk 1.48 still resolves origin/HEAD.)

## Impact

- Local git pre-push hook behavior only; no workflows, jobs, or secrets.
- First pushes now run the gate over all files (stricter, not weaker); pushes
  to existing branches are unchanged.
