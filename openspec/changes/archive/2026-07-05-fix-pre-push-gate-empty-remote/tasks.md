## 1. Handle empty-remote first push in the pre-push gate

- [x] 1.1 Detect the all-zeros remote sha in `scripts/hooks/pre-push-gate` and
      pass `hk run pre-push` an explicit
      `--from-ref <synthetic empty root     commit> --to-ref HEAD` range for
      that case
- [x] 1.2 shellcheck passes on the script; the wrapper run end-to-end with
      simulated first-push stdin (slow profile) gates the whole tree green
