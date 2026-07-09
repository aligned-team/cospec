## 1. Fix the message

- [x] 1.1 Update `resolveStore`'s "unknown store" error hint in
      `apps/cli/src/core/root.ts` to name `cospec store register <path>` /
      `cospec store ls` instead of the bare `openspec` commands.
- [x] 1.2 Sweep `apps/cli/src` for any other user-facing message recommending a
      bare `openspec <cmd>` where a `cospec` equivalent now exists; fix or
      confirm none found. Confirmed: only `root.ts` had a stale reference;
      `status.ts`'s legacy-schema hint and `doctor.ts`'s raw-inspection hint
      deliberately point at the wrapped binary's own richer output, not a
      leftover.
- [x] 1.3 Update the matching example in `apps/docs/concepts/stores.md` so the
      docs don't drift from the released error text.

## 2. Verify

- [x] 2.1 Run the existing `store-aware.test.ts` "unknown store id" test — it
      asserts a message prefix, not the literal old text, so it should still
      pass unmodified; confirmed no test hardcodes the old
      `openspec store register`/`ls` text. `bun test store-aware.test.ts` -> 3
      pass, 0 fail.
- [x] 2.2 Exercise `cospec status --change <slug> --store <bogus-id>` by hand
      and confirm the printed hint now reads
      `cospec store     register`/`cospec store ls`. Observed:
      `cospec: unknown store 'bogus-id-xyz' — register it with 'cospec     store register <path>' or check 'cospec store ls'. Registered     stores: probe-store`.
