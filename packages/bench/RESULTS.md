# cospec vs openspec — results

> **WARNING:** published while the working tree had uncommitted changes and the
> current branch was `worktree-bench-cospec-vs-openspec` (not `main`) — treat
> this as a point-in-time snapshot, not a release-verified result.

- commit:
  [`caf32af1414a`](https://github.com/aligned-team/cospec/commit/caf32af1414a77b367d4aa0cd27ef8e8d1941d37)
  on branch `worktree-bench-cospec-vs-openspec`
- published: 2026-07-21T17:20:34.706Z
- claude code: 2.1.211
- arms: cospec, openspec
- models: claude-opus-4-8/medium, claude-sonnet-5/high
- cells: 192 ran, 0 skipped, 192 total (repeats=3)
- judge: deepseek-v4-flash

| scenario      | arm      | model           | n   | quality | conformance\* | native-valid† | escaped‡ | review§ | plant¶ | task-done | dur(ms) | cost($) | tok-in | tok-out |
| ------------- | -------- | --------------- | --- | ------- | ------------- | ------------- | -------- | ------- | ------ | --------- | ------- | ------- | ------ | ------- |
| build         | cospec   | claude-opus-4-8 | 3   | 2.89    | 0.0           | 100%          | 0.0/4.0  | 1.3     | —      | 100%      | 151855  | 0.9172  | 52     | 6531    |
| build         | cospec   | claude-sonnet-5 | 3   | 2.56    | 0.0           | 100%          | 0.0/4.0  | 1.3     | —      | 100%      | 111314  | 0.7389  | 63     | 6172    |
| build         | openspec | claude-opus-4-8 | 3   | 2.98    | 0.0           | 100%          | 0.0/4.0  | 1.0     | —      | 100%      | 131645  | 0.7622  | 48     | 5536    |
| build         | openspec | claude-sonnet-5 | 3   | 2.87    | 0.0           | 100%          | 0.0/4.0  | 0.7     | —      | 100%      | 109022  | 0.7373  | 58     | 6323    |
| chore         | cospec   | claude-opus-4-8 | 3   | 2.82    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 116352  | 0.7753  | 46     | 5729    |
| chore         | cospec   | claude-sonnet-5 | 3   | 2.87    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 180659  | 1.0614  | 84     | 10887   |
| chore         | openspec | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 150118  | 0.9250  | 53     | 7323    |
| chore         | openspec | claude-sonnet-5 | 3   | 2.98    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 241867  | 1.0554  | 80     | 9340    |
| ci            | cospec   | claude-opus-4-8 | 3   | 2.91    | 0.0           | 100%          | 0.0/4.0  | 0.3     | —      | 100%      | 159387  | 0.9099  | 56     | 7591    |
| ci            | cospec   | claude-sonnet-5 | 3   | 2.53    | 0.0           | 100%          | 0.0/4.0  | 0.7     | —      | 100%      | 336897  | 1.6610  | 112    | 19282   |
| ci            | openspec | claude-opus-4-8 | 3   | 2.98    | 0.0           | 100%          | 0.0/4.0  | 0.3     | —      | 100%      | 117557  | 0.7265  | 45     | 5872    |
| ci            | openspec | claude-sonnet-5 | 3   | 2.93    | 0.0           | 100%          | 0.0/4.0  | 0.7     | —      | 100%      | 129419  | 0.8110  | 61     | 7758    |
| docs          | cospec   | claude-opus-4-8 | 3   | 2.58    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 136588  | 0.7636  | 43     | 6122    |
| docs          | cospec   | claude-sonnet-5 | 3   | 2.58    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 157839  | 0.9198  | 77     | 8877    |
| docs          | openspec | claude-opus-4-8 | 3   | 2.91    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 119024  | 0.7102  | 41     | 5765    |
| docs          | openspec | claude-sonnet-5 | 3   | 2.89    | 0.0           | 100%          | 0.0/4.0  | 0.0     | —      | 100%      | 112647  | 0.8358  | 63     | 7531    |
| feat          | cospec   | claude-opus-4-8 | 3   | 2.93    | 0.0           | 100%          | 0.0/8.0  | 0.0     | 0%     | 100%      | 176869  | 1.1778  | 61     | 9708    |
| feat          | cospec   | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.0/8.0  | 0.0     | 0%     | 100%      | 202117  | 1.2648  | 91     | 12462   |
| feat          | openspec | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/8.0  | 0.0     | 0%     | 100%      | 137739  | 0.9388  | 50     | 7117    |
| feat          | openspec | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.0/8.0  | 0.0     | 0%     | 100%      | 124809  | 0.8564  | 65     | 8397    |
| feat-hard     | cospec   | claude-opus-4-8 | 3   | 2.98    | 0.0           | 100%          | 0.0/10.0 | 0.0     | 0%     | 100%      | 311909  | 1.8171  | 83     | 14949   |
| feat-hard     | cospec   | claude-sonnet-5 | 3   | 2.98    | 0.0           | 100%          | 0.0/10.0 | 1.0     | 0%     | 100%      | 335962  | 1.5690  | 106    | 16759   |
| feat-hard     | openspec | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/10.0 | 0.7     | 0%     | 100%      | 162401  | 1.1118  | 52     | 10525   |
| feat-hard     | openspec | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.0/10.0 | 1.0     | 0%     | 100%      | 189259  | 1.0195  | 70     | 12554   |
| fix           | cospec   | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 127974  | 0.8833  | 44     | 7854    |
| fix           | cospec   | claude-sonnet-5 | 3   | 2.89    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 215935  | 1.3613  | 92     | 14094   |
| fix           | openspec | claude-opus-4-8 | 3   | 2.98    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 97909   | 0.6262  | 35     | 5029    |
| fix           | openspec | claude-sonnet-5 | 3   | 2.97    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 66441   | 0.4524  | 37     | 4314    |
| fix-hard      | cospec   | claude-opus-4-8 | 3   | 2.93    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 123254  | 0.7882  | 41     | 6635    |
| fix-hard      | cospec   | claude-sonnet-5 | 3   | 2.96    | 0.0           | 100%          | 0.3/9.0  | 0.0     | 0%     | 100%      | 151838  | 0.9650  | 63     | 10591   |
| fix-hard      | openspec | claude-opus-4-8 | 3   | 2.98    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 132876  | 0.8411  | 44     | 7926    |
| fix-hard      | openspec | claude-sonnet-5 | 3   | 2.98    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 220683  | 1.0565  | 68     | 13195   |
| perf          | cospec   | claude-opus-4-8 | 3   | 2.98    | 0.0           | 100%          | 0.0/4.0  | 1.3     | 0%     | 100%      | 187220  | 1.0236  | 50     | 9049    |
| perf          | cospec   | claude-sonnet-5 | 3   | 2.96    | 0.0           | 100%          | 0.0/4.0  | 1.7     | 0%     | 100%      | 163091  | 1.0443  | 70     | 11106   |
| perf          | openspec | claude-opus-4-8 | 3   | 2.93    | 0.0           | 100%          | 0.0/4.0  | 1.0     | 0%     | 100%      | 116103  | 1.0145  | 41     | 6810    |
| perf          | openspec | claude-sonnet-5 | 3   | 2.98    | 0.0           | 100%          | 0.0/4.0  | 1.3     | 0%     | 100%      | 113059  | 0.7162  | 53     | 7541    |
| perf-hard     | cospec   | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/8.0  | 0.3     | 0%     | 100%      | 190621  | 1.2556  | 57     | 11906   |
| perf-hard     | cospec   | claude-sonnet-5 | 3   | 2.91    | 0.0           | 100%          | 0.0/8.0  | 1.0     | 0%     | 100%      | 235726  | 1.4257  | 94     | 15932   |
| perf-hard     | openspec | claude-opus-4-8 | 3   | 2.91    | 0.0           | 100%          | 0.0/8.0  | 0.3     | 0%     | 100%      | 146268  | 0.9147  | 42     | 9243    |
| perf-hard     | openspec | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.0/8.0  | 1.0     | 0%     | 100%      | 204862  | 1.0286  | 68     | 12899   |
| refactor      | cospec   | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 176754  | 1.2280  | 53     | 11494   |
| refactor      | cospec   | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.3/5.0  | 0.0     | 0%     | 67%       | 204844  | 1.2607  | 85     | 13005   |
| refactor      | openspec | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 134807  | 0.8505  | 41     | 8525    |
| refactor      | openspec | claude-sonnet-5 | 3   | 2.98    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 239760  | 1.2022  | 84     | 13430   |
| refactor-hard | cospec   | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 188620  | 1.2993  | 65     | 11341   |
| refactor-hard | cospec   | claude-sonnet-5 | 3   | 2.98    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 187343  | 1.1923  | 85     | 13559   |
| refactor-hard | openspec | claude-opus-4-8 | 3   | 2.93    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 124800  | 0.8181  | 43     | 7666    |
| refactor-hard | openspec | claude-sonnet-5 | 3   | 2.87    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 184582  | 0.9531  | 69     | 10377   |
| revert        | cospec   | claude-opus-4-8 | 3   | 2.82    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 119638  | 0.8614  | 45     | 6519    |
| revert        | cospec   | claude-sonnet-5 | 3   | 2.89    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 152728  | 0.8594  | 60     | 9596    |
| revert        | openspec | claude-opus-4-8 | 3   | 2.96    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 101119  | 0.6793  | 36     | 5785    |
| revert        | openspec | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.0/5.0  | 0.0     | 0%     | 100%      | 99257   | 0.7375  | 57     | 6185    |
| revert-hard   | cospec   | claude-opus-4-8 | 3   | 2.91    | 0.0           | 100%          | 0.0/9.0  | 1.3     | 0%     | 100%      | 146815  | 0.9907  | 53     | 8254    |
| revert-hard   | cospec   | claude-sonnet-5 | 3   | 2.78    | 0.0           | 100%          | 0.0/9.0  | 0.0     | 0%     | 100%      | 168554  | 1.0356  | 74     | 10354   |
| revert-hard   | openspec | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/9.0  | 1.3     | 0%     | 100%      | 138967  | 0.6930  | 37     | 5934    |
| revert-hard   | openspec | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.0/9.0  | 1.0     | 0%     | 100%      | 281723  | 0.9241  | 65     | 9402    |
| style         | cospec   | claude-opus-4-8 | 3   | 2.47    | 0.0           | 100%          | 0.0/5.0  | 0.0     | —      | 100%      | 120160  | 0.8177  | 48     | 6591    |
| style         | cospec   | claude-sonnet-5 | 3   | 2.67    | 0.0           | 100%          | 0.0/5.0  | 0.0     | —      | 100%      | 124069  | 0.7305  | 58     | 7212    |
| style         | openspec | claude-opus-4-8 | 3   | 2.93    | 0.0           | 100%          | 0.0/5.0  | 0.0     | —      | 100%      | 124366  | 0.7675  | 45     | 6511    |
| style         | openspec | claude-sonnet-5 | 3   | 2.87    | 0.0           | 100%          | 0.0/5.0  | 0.0     | —      | 100%      | 235460  | 0.9803  | 70     | 9352    |
| test          | cospec   | claude-opus-4-8 | 3   | 2.73    | 0.0           | 100%          | 0.0/5.0  | 0.7     | —      | 100%      | 128935  | 0.8123  | 49     | 6474    |
| test          | cospec   | claude-sonnet-5 | 3   | 2.80    | 0.0           | 100%          | 0.0/5.0  | 0.0     | —      | 100%      | 144611  | 0.8255  | 73     | 7071    |
| test          | openspec | claude-opus-4-8 | 3   | 3.00    | 0.0           | 100%          | 0.0/5.0  | 0.0     | —      | 100%      | 107504  | 0.6952  | 42     | 5848    |
| test          | openspec | claude-sonnet-5 | 3   | 3.00    | 0.0           | 100%          | 0.0/5.0  | 0.0     | —      | 100%      | 144310  | 0.8638  | 69     | 8561    |

\* conformance = mean schema-conformance issue count (errors+warnings) from a
post-hoc `cospec validate --json --strict` pass — cospec's OWN opinionated
rubric applied to BOTH arms after the fact. It is NOT a defect measure: a
nonzero count for the openspec arm means "does not match cospec's schema," not
"is broken." † native-valid = each arm validating its OWN output with its OWN
validator (`cospec validate` for the cospec arm, `openspec validate` for the
openspec arm) — the actual pass/fail bar per tool, reported alongside
conformance for contrast. ‡ escaped = mean FAILED count / mean total count from
the scenario's held-out hidden-test suite (`scenarios/hidden/<id>/`, never seen
by the agent) — the PRIMARY, tool-neutral defect signal, scored identically for
both arms; contrast with conformance\*, which is cospec's own rubric applied
only post-hoc. § review = mean CONFIRMED adversarial-review defect count — bugs
an ARM-BLIND reviewer found in the produced code diff that survived a refutation
pass (see `src/review.ts`). A dash means review did not run for this group (off
by default; enable with `--review`, or run `--review-report <dir>` over a past
run). Reviewers never learn which arm produced a diff. ¶ plant = share of cells
that caught this scenario's PLANTED latent bug — a defect seeded ADJACENT to
(never inside) the task subject, never mentioned by the prompt (see
`scenarios/planted/<id>/`). A dash means this scenario has no plant. Measures
whether the workflow's verification discipline surfaces a nearby defect;
distinct from escaped‡, which is scored against the task the prompt actually
asked for — a plant left unfixed is never double-counted there.

## Repeat spread (n>1 only)

| scenario      | arm      | model           | n   | duration(ms) min/max/stddev | cost($) min/max/stddev  |
| ------------- | -------- | --------------- | --- | --------------------------- | ----------------------- |
| build         | cospec   | claude-opus-4-8 | 3   | 137948/177190 (±21975)      | 0.8087/0.9918 (±0.0961) |
| build         | cospec   | claude-sonnet-5 | 3   | 86838/127295 (±21525)       | 0.6505/0.8635 (±0.1110) |
| build         | openspec | claude-opus-4-8 | 3   | 120338/147698 (±14284)      | 0.6351/0.8696 (±0.1184) |
| build         | openspec | claude-sonnet-5 | 3   | 101705/114591 (±6618)       | 0.6380/0.8351 (±0.0986) |
| chore         | cospec   | claude-opus-4-8 | 3   | 107322/122108 (±7918)       | 0.6141/0.8913 (±0.1440) |
| chore         | cospec   | claude-sonnet-5 | 3   | 156614/199151 (±21805)      | 0.8999/1.1538 (±0.1403) |
| chore         | openspec | claude-opus-4-8 | 3   | 135895/173212 (±20178)      | 0.8448/0.9862 (±0.0725) |
| chore         | openspec | claude-sonnet-5 | 3   | 114727/449055 (±180968)     | 0.8241/1.3620 (±0.2768) |
| ci            | cospec   | claude-opus-4-8 | 3   | 148220/179470 (±17429)      | 0.8364/0.9948 (±0.0798) |
| ci            | cospec   | claude-sonnet-5 | 3   | 139172/449752 (±171806)     | 0.8970/2.2670 (±0.6986) |
| ci            | openspec | claude-opus-4-8 | 3   | 99918/130264 (±15763)       | 0.6661/0.7874 (±0.0606) |
| ci            | openspec | claude-sonnet-5 | 3   | 84075/176503 (±46239)       | 0.5622/1.1515 (±0.3052) |
| docs          | cospec   | claude-opus-4-8 | 3   | 111646/151368 (±21724)      | 0.6915/0.8150 (±0.0643) |
| docs          | cospec   | claude-sonnet-5 | 3   | 94201/196719 (±55563)       | 0.6640/1.0499 (±0.2215) |
| docs          | openspec | claude-opus-4-8 | 3   | 103967/145461 (±22969)      | 0.6935/0.7416 (±0.0272) |
| docs          | openspec | claude-sonnet-5 | 3   | 103790/125060 (±11072)      | 0.8026/0.8967 (±0.0527) |
| feat          | cospec   | claude-opus-4-8 | 3   | 141424/211105 (±34856)      | 1.0076/1.3168 (±0.1570) |
| feat          | cospec   | claude-sonnet-5 | 3   | 151732/241699 (±45946)      | 0.9660/1.4739 (±0.2656) |
| feat          | openspec | claude-opus-4-8 | 3   | 124652/146814 (±11613)      | 0.7073/1.0967 (±0.2048) |
| feat          | openspec | claude-sonnet-5 | 3   | 108995/135261 (±13930)      | 0.7810/0.9068 (±0.0665) |
| feat-hard     | cospec   | claude-opus-4-8 | 3   | 283407/347861 (±32866)      | 1.5086/2.0497 (±0.2784) |
| feat-hard     | cospec   | claude-sonnet-5 | 3   | 258497/406213 (±74122)      | 1.2476/1.8114 (±0.2901) |
| feat-hard     | openspec | claude-opus-4-8 | 3   | 155669/172947 (±9249)       | 1.0771/1.1632 (±0.0454) |
| feat-hard     | openspec | claude-sonnet-5 | 3   | 160310/209555 (±25738)      | 0.9387/1.1205 (±0.0926) |
| fix           | cospec   | claude-opus-4-8 | 3   | 105432/164835 (±32186)      | 0.7995/1.0505 (±0.1447) |
| fix           | cospec   | claude-sonnet-5 | 3   | 119729/289093 (±87002)      | 0.8125/1.8361 (±0.5158) |
| fix           | openspec | claude-opus-4-8 | 3   | 78218/115208 (±18611)       | 0.5442/0.6975 (±0.0772) |
| fix           | openspec | claude-sonnet-5 | 3   | 13937/93113 (±45471)        | 0.1241/0.6651 (±0.2884) |
| fix-hard      | cospec   | claude-opus-4-8 | 3   | 50771/165826 (±63091)       | 0.2607/1.0897 (±0.4584) |
| fix-hard      | cospec   | claude-sonnet-5 | 3   | 132246/180751 (±25561)      | 0.8884/1.0908 (±0.1098) |
| fix-hard      | openspec | claude-opus-4-8 | 3   | 118808/143986 (±12847)      | 0.7947/0.8675 (±0.0403) |
| fix-hard      | openspec | claude-sonnet-5 | 3   | 158534/339124 (±102615)     | 0.8448/1.3139 (±0.2378) |
| perf          | cospec   | claude-opus-4-8 | 3   | 142457/242265 (±50692)      | 0.8662/1.2517 (±0.2022) |
| perf          | cospec   | claude-sonnet-5 | 3   | 142682/201628 (±33394)      | 0.8925/1.2772 (±0.2047) |
| perf          | openspec | claude-opus-4-8 | 3   | 101523/134632 (±16904)      | 0.9009/1.2413 (±0.1964) |
| perf          | openspec | claude-sonnet-5 | 3   | 94683/122460 (±15916)       | 0.6469/0.7595 (±0.0607) |
| perf-hard     | cospec   | claude-opus-4-8 | 3   | 157127/214330 (±29831)      | 0.9478/1.4549 (±0.2704) |
| perf-hard     | cospec   | claude-sonnet-5 | 3   | 155258/334759 (±91179)      | 1.0817/1.8423 (±0.3855) |
| perf-hard     | openspec | claude-opus-4-8 | 3   | 131877/166394 (±17959)      | 0.8150/1.0586 (±0.1276) |
| perf-hard     | openspec | claude-sonnet-5 | 3   | 148814/298052 (±81257)      | 0.9887/1.0649 (±0.0382) |
| refactor      | cospec   | claude-opus-4-8 | 3   | 170477/186970 (±8924)       | 1.1054/1.3436 (±0.1193) |
| refactor      | cospec   | claude-sonnet-5 | 3   | 177072/251129 (±40350)      | 1.1424/1.3816 (±0.1196) |
| refactor      | openspec | claude-opus-4-8 | 3   | 124150/154383 (±16976)      | 0.7479/1.0097 (±0.1398) |
| refactor      | openspec | claude-sonnet-5 | 3   | 200214/306245 (±57921)      | 0.9847/1.3256 (±0.1890) |
| refactor-hard | cospec   | claude-opus-4-8 | 3   | 188282/189063 (±401)        | 1.2651/1.3530 (±0.0470) |
| refactor-hard | cospec   | claude-sonnet-5 | 3   | 179147/200957 (±11871)      | 1.1312/1.2402 (±0.0557) |
| refactor-hard | openspec | claude-opus-4-8 | 3   | 113738/132501 (±9823)       | 0.8001/0.8522 (±0.0295) |
| refactor-hard | openspec | claude-sonnet-5 | 3   | 111974/310681 (±109623)     | 0.7710/1.1620 (±0.1969) |
| revert        | cospec   | claude-opus-4-8 | 3   | 108469/126012 (±9705)       | 0.8104/0.8991 (±0.0458) |
| revert        | cospec   | claude-sonnet-5 | 3   | 76722/281285 (±111950)      | 0.5050/1.3975 (±0.4737) |
| revert        | openspec | claude-opus-4-8 | 3   | 86901/112917 (±13176)       | 0.5955/0.7267 (±0.0728) |
| revert        | openspec | claude-sonnet-5 | 3   | 93469/107099 (±7043)        | 0.6770/0.8019 (±0.0625) |
| revert-hard   | cospec   | claude-opus-4-8 | 3   | 140172/150865 (±5799)       | 0.8436/1.0858 (±0.1292) |
| revert-hard   | cospec   | claude-sonnet-5 | 3   | 122180/219415 (±48773)      | 0.7449/1.2100 (±0.2535) |
| revert-hard   | openspec | claude-opus-4-8 | 3   | 36334/252701 (±108610)      | 0.1937/1.1307 (±0.4715) |
| revert-hard   | openspec | claude-sonnet-5 | 3   | 211421/317804 (±60890)      | 0.7910/1.0552 (±0.1321) |
| style         | cospec   | claude-opus-4-8 | 3   | 112426/134813 (±12696)      | 0.6975/0.9233 (±0.1136) |
| style         | cospec   | claude-sonnet-5 | 3   | 80911/185387 (±54554)       | 0.5054/1.0227 (±0.2651) |
| style         | openspec | claude-opus-4-8 | 3   | 109041/149005 (±21549)      | 0.6259/0.9516 (±0.1670) |
| style         | openspec | claude-sonnet-5 | 3   | 171373/272614 (±55736)      | 0.8715/1.0375 (±0.0943) |
| test          | cospec   | claude-opus-4-8 | 3   | 113484/147627 (±17301)      | 0.7152/0.9620 (±0.1315) |
| test          | cospec   | claude-sonnet-5 | 3   | 126468/179566 (±30279)      | 0.6959/1.0720 (±0.2135) |
| test          | openspec | claude-opus-4-8 | 3   | 94913/123069 (±14312)       | 0.5730/0.7673 (±0.1063) |
| test          | openspec | claude-sonnet-5 | 3   | 139289/152644 (±7268)       | 0.7780/0.9124 (±0.0746) |

## Paired comparison (cospec vs openspec, matched cells)

Matches cells with the same scenario id + model + repeat; skipped cells are
excluded. Lower is better for every metric below. `conformance issues` is
cospec's own post-hoc schema-conformance rubric applied to BOTH arms (see the
summary table's `conformance*` column) — not a defect count. A group is "not
distinguishable at this n" whenever the two arms' value ranges overlap, or there
are fewer than 2 matched pairs — this harness never asserts a winner off a
single repeat.

| scenario      | model           | metric             | pairs | cospec wins | openspec wins | ties | verdict                                             |
| ------------- | --------------- | ------------------ | ----- | ----------- | ------------- | ---- | --------------------------------------------------- |
| build         | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| build         | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| build         | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| build         | claude-opus-4-8 | review defects     | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| build         | claude-sonnet-5 | cost($)            | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| build         | claude-sonnet-5 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| build         | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| build         | claude-sonnet-5 | review defects     | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| chore         | claude-opus-4-8 | cost($)            | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| chore         | claude-opus-4-8 | duration(ms)       | 3     | 3           | 0             | 0    | cospec wins 3/3 (sign test p=0.250)                 |
| chore         | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| chore         | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| chore         | claude-sonnet-5 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| chore         | claude-sonnet-5 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| chore         | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| chore         | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| ci            | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| ci            | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| ci            | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| ci            | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| ci            | claude-sonnet-5 | cost($)            | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| ci            | claude-sonnet-5 | duration(ms)       | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| ci            | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| ci            | claude-sonnet-5 | review defects     | 3     | 1           | 1             | 1    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-opus-4-8 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-opus-4-8 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-sonnet-5 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-sonnet-5 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| docs          | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| feat          | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| feat          | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| feat          | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| feat          | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| feat          | claude-sonnet-5 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| feat          | claude-sonnet-5 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| feat          | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| feat          | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| feat-hard     | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| feat-hard     | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| feat-hard     | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| feat-hard     | claude-opus-4-8 | review defects     | 3     | 2           | 0             | 1    | not distinguishable at this n (n=3, ranges overlap) |
| feat-hard     | claude-sonnet-5 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| feat-hard     | claude-sonnet-5 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| feat-hard     | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| feat-hard     | claude-sonnet-5 | review defects     | 3     | 1           | 1             | 1    | not distinguishable at this n (n=3, ranges overlap) |
| fix           | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| fix           | claude-opus-4-8 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| fix           | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| fix           | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| fix           | claude-sonnet-5 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| fix           | claude-sonnet-5 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| fix           | claude-sonnet-5 | conformance issues | 2     | 0           | 0             | 2    | not distinguishable at this n (n=2, ranges overlap) |
| fix           | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| fix-hard      | claude-opus-4-8 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| fix-hard      | claude-opus-4-8 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| fix-hard      | claude-opus-4-8 | conformance issues | 2     | 0           | 0             | 2    | not distinguishable at this n (n=2, ranges overlap) |
| fix-hard      | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| fix-hard      | claude-sonnet-5 | cost($)            | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| fix-hard      | claude-sonnet-5 | duration(ms)       | 3     | 3           | 0             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| fix-hard      | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| fix-hard      | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| perf          | claude-opus-4-8 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| perf          | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| perf          | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| perf          | claude-opus-4-8 | review defects     | 3     | 0           | 1             | 2    | not distinguishable at this n (n=3, ranges overlap) |
| perf          | claude-sonnet-5 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| perf          | claude-sonnet-5 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| perf          | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| perf          | claude-sonnet-5 | review defects     | 3     | 0           | 1             | 2    | not distinguishable at this n (n=3, ranges overlap) |
| perf-hard     | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| perf-hard     | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| perf-hard     | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| perf-hard     | claude-opus-4-8 | review defects     | 3     | 1           | 1             | 1    | not distinguishable at this n (n=3, ranges overlap) |
| perf-hard     | claude-sonnet-5 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| perf-hard     | claude-sonnet-5 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| perf-hard     | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| perf-hard     | claude-sonnet-5 | review defects     | 3     | 1           | 1             | 1    | not distinguishable at this n (n=3, ranges overlap) |
| refactor      | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| refactor      | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| refactor      | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| refactor      | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| refactor      | claude-sonnet-5 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| refactor      | claude-sonnet-5 | duration(ms)       | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| refactor      | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| refactor      | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| refactor-hard | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| refactor-hard | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| refactor-hard | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| refactor-hard | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| refactor-hard | claude-sonnet-5 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| refactor-hard | claude-sonnet-5 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| refactor-hard | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| refactor-hard | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| revert        | claude-opus-4-8 | cost($)            | 3     | 0           | 3             | 0    | openspec wins 3/3 (sign test p=0.250)               |
| revert        | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert        | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| revert        | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| revert        | claude-sonnet-5 | cost($)            | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert        | claude-sonnet-5 | duration(ms)       | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert        | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| revert        | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| revert-hard   | claude-opus-4-8 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert-hard   | claude-opus-4-8 | duration(ms)       | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert-hard   | claude-opus-4-8 | conformance issues | 2     | 0           | 0             | 2    | not distinguishable at this n (n=2, ranges overlap) |
| revert-hard   | claude-opus-4-8 | review defects     | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert-hard   | claude-sonnet-5 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert-hard   | claude-sonnet-5 | duration(ms)       | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| revert-hard   | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| revert-hard   | claude-sonnet-5 | review defects     | 3     | 2           | 0             | 1    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-opus-4-8 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-opus-4-8 | duration(ms)       | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-opus-4-8 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-sonnet-5 | cost($)            | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-sonnet-5 | duration(ms)       | 3     | 3           | 0             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| style         | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-opus-4-8 | cost($)            | 3     | 1           | 2             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-opus-4-8 | duration(ms)       | 3     | 0           | 3             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-opus-4-8 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-opus-4-8 | review defects     | 3     | 0           | 1             | 2    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-sonnet-5 | cost($)            | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-sonnet-5 | duration(ms)       | 3     | 2           | 1             | 0    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-sonnet-5 | conformance issues | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
| test          | claude-sonnet-5 | review defects     | 3     | 0           | 0             | 3    | not distinguishable at this n (n=3, ranges overlap) |
