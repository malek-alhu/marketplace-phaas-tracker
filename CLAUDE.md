# Working in this repository

Defensive threat-intelligence research on a marketplace phishing kit, plus a
scheduled tracker that finds new domains serving it.

## Current work

The tracker is being rebuilt. The full brief is
[`docs/tracker-v3-plan.md`](docs/tracker-v3-plan.md). Read sections 1–5 of it
before changing anything under `monitor/`, then follow its steps in order.

## Rules that always apply

- **Passive only.** Query `urlscan.io` and public DNS-over-HTTPS resolvers.
  Never request a URL on a suspected phishing domain.
- **Do not read `kit-source/` or `evidence/captures/`.** They contain live
  phishing code and are not needed for tracker work.
- **Never submit a urlscan scan from a development session.** Only the
  scheduled workflow sets `SUBMIT_SCANS=1`.
- **Never print, log or commit an API key.**
- Humans own `monitor/watchlist.txt`, `monitor/denylist.txt`,
  `monitor/fingerprints.txt` and `docs/indicators.csv`. Tracker code reads them
  and never writes them.
- Do not rewrite git history, and do not push to `main`.

## Large files

Until step 5 of the plan is done these are mostly noise and very large. Use
`head`, `wc -l`, `awk` or `grep -c`; do not open them whole:
`monitor/findings.csv`, `monitor/monitor.log`, `monitor/discovered.csv`,
`monitor/state/*`.

## Tests

- New suite: `node --test monitor/tests` (offline, no dependencies).
- Old suite, until step 7 removes it: `bash monitor/tests/run.sh`.
