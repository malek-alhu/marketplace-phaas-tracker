# REA static-analysis evidence

`evidence-summary.json` (June/July build) and `evidence-summary-next2.json` (79 recovered Oct "next2" chunks) record the 2026-10-13 runs of [REA](https://github.com/morluto/rea)'s static JavaScript analyzer
over the recovered kit (the agent skill is vendored at `.claude/skills/reverse-engineer-anything/`). It holds the
Evidence/graph IDs, coverage, statistics and the 75 network/boundary/event/timer sinks (chunk sha256 + exact source
range), which is how the operator control plane in [`docs/kit-code-analysis.md` §6b](../../docs/kit-code-analysis.md)
was located. The full 109 MB Evidence record is not committed; reproduce it with:

```bash
mkdir -p /tmp/kit && for f in kit-source/decompressed/*.js.txt; do
  head -c1 "$f" | grep -q '<' || cp "$f" "/tmp/kit/$(basename "${f%.txt}")"; done
npx -y rea-agents@6.4.0 analyze-javascript-application /tmp/kit --artifact-format directory --format json > rea.json
```

Static only: REA parses the chunks, never executes them, and no network connection to kit infrastructure is made.
