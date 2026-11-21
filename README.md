# csv-reader-turbo

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/verad-xe/csv-reader-turbo/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/verad-xe/csv-reader-turbo/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for make.fun's csv-reader 1.0.0. `solve.js` exports `run(input)`, which returns exactly csv-reader's reading of a `{text, header}` input — `{columns, rows, errors}` under the same broken-row policy (stray CRs dropped, junk after a closing quote appended, unterminated quotes re-read as unquoted, ragged rows padded or cut with short_row/long_row errors) — while reading the text with slice-based field scans instead of building every field one character at a time. Fields are taken as slices between special characters (comma, quote, LF, CR) and are assembled from parts only when a field actually holds a special case, so clean CSV parses at full speed and broken rows cost no more than they must. `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## Run it

```sh
node main.ts
```

With `/input/cases.json` in place (or `MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` pointing elsewhere), this writes `/output/answers.json`. Node 22.18 or later, no dependencies, nothing to install.

---

<sub>Entered on [make.fun](https://make.fun/?ref=05egkt5w&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
