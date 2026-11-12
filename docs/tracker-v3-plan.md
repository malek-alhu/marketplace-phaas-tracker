# Tracker v3 — plan and builder instructions

Status: approved direction, not yet built. Written 2026-11-12.

This document is the complete brief for the model that will build tracker v3 in
Claude Code. It assumes you have not seen the analysis that led to it. Read
sections 1–5 before touching code, then work through the steps in section 6 in
order. Each step ends with tests that must pass before you start the next one.

---

## 1. What this repository is

A defensive threat-intelligence project about a marketplace phishing kit.

- **Research half** (`docs/`, `kit-analysis/`, `kit-source/`, `evidence/`,
  `detection/`, `screenshots/`): a finished teardown of the kit. Do not change
  it, except for the short documentation edits listed in step 8.
- **Tracker half** (`monitor/`, `feeds/`, `.github/workflows/`): a job that runs
  every 6 hours, looks for new domains serving the kit, and opens GitHub Issues.
  This is what you are rebuilding.

Two operators are tracked. **Operator A** runs the live Next.js kit on domains
that rotate roughly daily; it is the primary target. **Operator B** runs an
older PHP kit on a handful of fixed IPs; it is secondary and changes rarely.

The tracker finds Operator-A domains mainly through **content hashes**: every
kit page loads the same JavaScript chunks, and urlscan.io lets you search for
all scans that loaded a file with a given SHA-256 (`hash:<sha256>`). A hash that
is specific to the kit is called a **fingerprint**. When the operators rebuild
the kit all hashes change, so the tracker also learns new fingerprints from
scans of domains it already trusts. That learning step is called **chaining**.

## 2. Why it is being rebuilt

The current tracker (`monitor/check.sh`, 814 lines of bash) has been in a
runaway false-positive loop since 2026-10-14. Measured on 2026-11-12:

| Measure | Before the loop | Now |
|---|---|---|
| "Tier-1" alerts per run | 1–13 | up to 744 |
| November tier-1 alerts on a known kit apex | — | 2 of 8,581 |
| Tracked hosts (`state/tracked_hosts.tsv`) | ~350 | 47,659 |
| Auto-added apexes (`state/auto_apexes.txt`) | ~110 | 1,038, including `render.com`, `jotform.com` |
| Learned fingerprints | 16 seeds | 16 seeds + 218 learned |
| urlscan queries per run | ~270 | ~1,300, most rejected by quota |
| Run time | minutes | ~6 hours, cancelled at the Actions limit |
| Open Issues | few | 184 |

It also submitted about 2,170 **public** urlscan scans, tagged
`marketplace-phaas`, for hosts that have nothing to do with the kit.

### Root cause, in the order it happened

1. **The learning gate measured the wrong thing.** A new hash was accepted when
   it appeared alongside at least 2 "known kit domains" and fewer than 1,000
   scans in total. It never looked at how many *unknown* sites also served the
   file. On 2026-10-14T10:56Z hash `6930c2cc…` was accepted with 19 known
   domains in **78** scans, while the genuine kit chunks learned in the same run
   had 19 known domains in 22 scans. The other 56 scans were unrelated sites: it
   is a generic framework chunk. The next run promoted `aination.gr`,
   `render.com` and several `*.vercel.app` hosts.
2. **The gate double-counted.** It counted a scan's apex and its hostname as two
   separate known domains, so a single scan satisfied "at least 2". The log is
   full of `co-occurs with 2 known kit domains (1 scans)`.
3. **The tracker treated its own guesses as evidence.** "Known" included every
   auto-added apex and every tracked host, so each false positive made the next
   one easier to accept.
4. **Every hit was amplified.** A hash hit promoted the apex. A promoted apex
   then had its certificate history pulled, every urlscan scan of it imported
   (including the hosts those scans were redirected from), all of it resolved
   over DNS every run, and all of it labelled tier 1.
5. **Nothing was bounded.** No cap on new hosts, fingerprints, queries or alerts
   per run, and no check that a trusted fingerprint still behaved like one.

The September 2026 incident described in the README had the same shape through
a different door (auto-promoted IP addresses). The lesson for v3 is structural,
not a matter of tuning one threshold.

### Other defects to fix on the way

- `/a/<token>` alone, on Cloudflare, is accepted as a kit URL. It matched
  `dailyrss-website.versec.workers.dev`, which is now in the public blocklist
  `feeds/domains.txt`. `2gbpz6ock88lptu.icu` (`/a/master_global`) got in the
  same way and needs a human look.
- `hash:` search is unreliable without an API key. On 2026-11-12, keyless
  searches returned 0 results for seven fingerprints, including one with an
  authenticated hit a week earlier, and 1 result for an eighth. So the
  "keyless" tracker is close to blind on its main detector when `URLSCAN_KEY`
  is missing or rejected, and it reports that as a quiet run.
- A failed DNS lookup counts toward marking a host dead, even when the resolver
  itself is failing.
- The tests cut blocks out of `check.sh` with `sed` and run them in isolation,
  so they pass while the whole run misbehaves.

## 3. Goals

Each goal has a check you can run.

| # | Goal | How it is verified |
|---|---|---|
| G1 | An Issue is opened only for a domain with direct kit evidence | Replay scenarios in step 2 and 3: unrelated domains produce 0 alerts |
| G2 | No run can grow state or alerts without bound | Scenario `burst`: breaker trips, nothing is learned or alerted |
| G3 | A bad fingerprint removes itself | Scenario `poisoned-fingerprint`: it is quarantined in the same run |
| G4 | Nothing unconfirmed is published | Feed and scan-submission tests in step 4 |
| G5 | One place to look | `STATUS.md` under 120 lines, regenerated every run |
| G6 | A run is cheap | Under 10 minutes, at most 150 urlscan requests, at most 1,200 DNS requests |
| G7 | The code is small and testable | One Node program, no npm dependencies, `node --test` runs everything offline in under 30 seconds |
| G8 | A blind run says so | Scenario `source-down`: status is `BLIND`, hosts are not marked dead |

Non-goals: changing the research documents, attributing the operators, or any
active probing of kit infrastructure.

## 4. Design

### 4.1 The one rule

**Trust flows one way: humans → machine. The machine never edits human files,
and nothing the machine inferred counts as evidence unless it passed the gates
below.**

Three trust levels:

| Level | Written by | Where it lives | Can it alert? | Does it count as evidence? |
|---|---|---|---|---|
| **Curated** | maintainer | `docs/indicators.csv`, `monitor/watchlist.txt`, `monitor/fingerprints.txt` | yes | yes |
| **Confirmed** | tracker, after passing a gate | `monitor/state/domains.tsv`, `monitor/state/learned_fingerprints.tsv` | yes | yes |
| **Candidate** | tracker | `monitor/state/candidates.tsv` | never | never |

A candidate is never queried, resolved, scanned, exported or used to judge
anything else. It waits for a human, or for stronger evidence in a later run.

### 4.2 Terms

- **Apex**: urlscan's `page.apexDomain` for a scan. If it is missing, the full
  hostname is its own apex. Never derive an apex by stripping labels yourself;
  that is how `googleusercontent.com` style hosts got grouped.
- **K, the known kit apex set**: curated Operator-A apexes plus confirmed
  Operator-A apexes. Rebuilt at the start of every run from the files above.
  Sites on the denylist and hacked legitimate sites (`victim` rows) are never
  in K.
- **Window**: scans from the last 30 days, which is also urlscan's search limit.

### 4.3 How a domain becomes confirmed

There are exactly three ways. Anything else is a candidate.

- **R1, two fingerprints.** The apex appears in the results of at least two
  different trusted fingerprints in this run. A real kit page loads many kit
  chunks; an unrelated site that happens to share one generic file does not
  share a second. When fewer than two fingerprints are trusted, R1 cannot fire
  and the run carries the health note `too-few-fingerprints`.
- **R2, strict URL shape.** A scan URL matches *both* parts of the per-victim
  link: path `/a/<12–24 chars of A-Za-z0-9_->` **and** query `us=` with one of
  `gm|dlm|sml|ym|cg`. Path alone, or an unknown `us=` value, is a candidate.
- **R3, curated.** A human added it to `watchlist.txt`.

A subdomain of an apex that is already confirmed is recorded under that apex
without a new alert.

Do not require Cloudflare. Since October genuine kit hosts
(`poland-payhub*.eu.cc`, `payu-nitro*.eu.cc`) have also been served from
`193.111.117.211` (AS207043). Record IP and ASN as information only.

### 4.4 How a fingerprint is learned, and how it is lost

Candidate hashes come only from the JavaScript chunks
(`/_next/static/chunks/*.js`) of a scan of a domain confirmed in this run.

Fingerprints are always judged against K **as it stood at the start of the
run**, never against domains confirmed during the same run.

For each candidate hash, search `hash:<sha256>` and compute, over the distinct
apexes in the results:

- `known` = apexes in K
- `unknown` = apexes not in K
- `total` = urlscan's reported total

**Learn it** only if `known ≥ 3` and `unknown ≤ max(2, 25% of distinct apexes)`
and `total ≤ 500`. Count apexes, never apex plus hostname. Otherwise write it to
candidates with those three numbers.

**Every run, every trusted fingerprint is re-judged** with the results of the
search the tracker already makes for it. If `unknown > max(5, 50% of distinct
apexes)` the fingerprint is **quarantined**: it contributes nothing to this run,
an event is logged, and the health Issue is raised. Quarantine applies to seeds
too, but the tracker records that in its own state; it never edits
`fingerprints.txt`.

A fingerprint with no hit for 30 days is queried once a day instead of every
run. After 60 days with no hit it is retired and no longer queried.

### 4.5 Hard limits

All limits live in `monitor/lib/config.js` and nowhere else.

| Limit | Value | When exceeded |
|---|---|---|
| New confirmed apexes per run | 25 | Breaker: all of this run's new apexes become candidates, nothing is learned, health Issue |
| New apexes introduced by one fingerprint per run | 10 | That fingerprint is skipped this run and flagged |
| Fingerprints learned per run | 15 | Rest go to candidates |
| Hash searches per run | 60 | Most recently hit first |
| Total urlscan requests per run | 150 | Stop querying, mark run `DEGRADED` |
| Hosts resolved per run | 600 | Live hosts first, then oldest unchecked |
| Scans submitted to urlscan per run | 5 | Rest wait |
| Rows in `candidates.tsv` | 500, each expires after 30 days | Oldest dropped |

`ALLOW_BURST=1` lifts the first limit for one manual run, for example when
recovering after a kit rebuild. It must never be set in the scheduled workflow.

### 4.6 What a run does

```
load inputs + state
  └─ build K
query every active fingerprint          (hash search, 30-day window)
  └─ re-judge each fingerprint          (4.4)  → quarantine if impure
query the strict URL shape              (one search)
decide confirmations                    (4.3)  → apply limits (4.5)
for newly confirmed domains:
  ├─ fetch one scan result each (max 3) → candidate hashes → learn (4.4)
  └─ submit one public scan each (max 5, only with a key, only in CI)
resolve confirmed + curated hosts       (DNS over HTTPS, two resolvers)
  └─ update live / dead / retired
Operator B: page.ip search per curated origin, with the shared-IP breaker
write state, findings, STATUS.md, status.json, feeds, alert files
```

What is deliberately gone:

- Certificate-log queries. The kit uses wildcard certificates, the free API
  answered about 17 of 900 requests per run, and brand-word searches produced
  33,000 log-only rows and no confirmed domain. Step 9 describes an optional,
  bounded return.
- Importing every scan of a promoted apex and the hosts it was redirected from.
- Alerts for IP changes, certificates and "revivals". They appear in
  `STATUS.md` as information.
- `tier`. A row is confirmed or it is a candidate.

### 4.7 Files after the rebuild

Human inputs (the tracker only reads these):

| File | Format |
|---|---|
| `monitor/watchlist.txt` | `<entry> <kind> <operator>`; kind is `apex`, `origin` or `victim` (was `dnsonly`). Drop the `tier` column and all `token` rows |
| `monitor/denylist.txt` | unchanged |
| `monitor/fingerprints.txt` | `sha256<TAB>label<TAB>added<TAB>note`; human-reviewed seeds only |
| `docs/indicators.csv` | unchanged |

Tracker state (only the tracker writes these):

| File | One row per | Columns |
|---|---|---|
| `monitor/state/domains.tsv` | confirmed or curated host | `host apex operator status first_seen last_live fail_streak next_check evidence scan_uuid ip asn` |
| `monitor/state/learned_fingerprints.tsv` | fingerprint the tracker judged | `sha256 status added last_hit known unknown total source_scan` with status `trusted`, `quarantined` or `retired`; seeds get a row here too so their last hit and quarantine state have a home |
| `monitor/state/candidates.tsv` | thing awaiting review | `kind value reason evidence first_seen` |
| `monitor/state/runs.tsv` | run, newest 200 kept | `started duration_s status urlscan_ok urlscan_total dns_ok dns_total new_confirmed new_fingerprints quarantined candidates` |
| `monitor/state/status.json` | — | small machine-readable summary for the review routine |
| `monitor/findings.csv` | confirmed event, append-only | `time,event,indicator,operator,evidence,scan_uuid,matched_url,ip,asn` |
| `STATUS.md` (repo root) | — | the dashboard |

`status` for a host is `live`, `dead` or `retired`. `evidence` is `curated`,
`url`, or `hash:<label>+<label>`. `event` is one of `confirmed`, `subdomain`,
`dead`, `revived`, `fingerprint-learned`, `fingerprint-quarantined`, `breaker`.

Every value written to a `.tsv` or `.csv` passes through one escaping function
(tabs, newlines and commas removed or percent-encoded). Writes are atomic:
write a temp file, then rename.

### 4.8 Code layout

Node 20 or later, CommonJS, **no npm dependencies**, tests with the built-in
`node --test`.

```
monitor/
  run.js               CLI. Flags: --dry-run  --replay <dir>  --record <dir>  --now <ISO>  --root <dir>
  lib/config.js        every threshold and limit
  lib/classify.js      pure: URL shape, purity verdict, Cloudflare ranges, escaping
  lib/decide.js        pure: (inputs, state, observations, config, now) → { state, events, alerts, candidates, health }
  lib/sources.js       urlscan + DoH clients with a request budget and health counters; live or replay transport
  lib/store.js         read and write the files in 4.7, with schema checks
  lib/report.js        STATUS.md, status.json, Issue bodies
  export-feeds.js      existing; change its inputs only
  kit-body.js          existing; leave as is
  heal-bodies.sh       existing; change the file it reads kit scans from
  tests/
    unit/*.test.js
    replay/<scenario>/   requests/*.json  state-before/  expected/
```

`decide.js` must do no I/O and must not read the clock; it receives `now`. That
is what makes the end-to-end scenarios deterministic.

**Record and replay.** `sources.js` sends every request through a transport.
The live transport calls `fetch`. The replay transport maps a request to a file
in `<scenario>/requests/` by a stable key (service, plus the query string with
the API key removed) and fails the test on a request that has no file.
`--record <dir>` runs live and saves each response under that key, so a real
incident can be turned into a regression test. Strip the API key from anything
written to disk.

## 5. Rules for the builder

Safety and scope:

1. **Passive only.** Talk to `urlscan.io`, `dns.google`, `1.1.1.1` and, in step
   9, certificate-log APIs. Never request a URL on a suspected kit domain.
2. **Never submit a urlscan scan during development.** Submission is enabled
   only when `SUBMIT_SCANS=1`, which only the scheduled workflow sets.
3. **Never read `kit-source/` or `evidence/captures/`.** They hold live
   phishing code and are irrelevant to this work.
4. **Never print, log or commit the urlscan key.**
5. Do not edit `docs/`, `kit-analysis/`, `detection/` or `evidence/` except
   where step 8 says so.
6. Do not rewrite git history. Noise is removed from the working tree in a
   normal commit; history keeps it.
7. Work on the branch your session names. Do not push to `main`. Open a pull
   request only when the maintainer asks.
8. Do not close or comment on Issues before step 8, and show the maintainer the
   list first.

Keeping the work cheap:

9. These files are large and almost entirely noise. Do not open them whole; use
   `head`, `wc -l`, `awk` or `grep -c`: `monitor/findings.csv` (153k lines),
   `monitor/monitor.log` (158k), `monitor/discovered.csv` (100k),
   `monitor/state/*` (up to 103k each).
10. Read `monitor/check.sh` and `monitor/parse.js` once, for behaviour to carry
    over. They are the specification of the old system, not code to port line
    by line.
11. Commit at the end of every step with the step number in the message. Run
    the step's tests before committing and paste the summary line in your
    report.
12. If a test in this plan cannot pass as written, stop and say why. Do not
    weaken the assertion.

About the urlscan key: steps 1–5 need no network. Step 6 needs
authenticated `hash:` search. Ask the maintainer for a key through the
session's credential request for host `urlscan.io`, header `API-Key`. If that is
not available, use the fallback described in step 6.

## 6. Steps

### Step 1 — Skeleton and pure classifiers

Goal: the test harness exists and the small pure functions are right.

Build `lib/config.js`, `lib/classify.js`, `tests/unit/`. In `classify.js`:

- `kitUrlVerdict(url)` → `strict`, `partial` or `none` (4.3, R2).
- `judgeFingerprint(results, total, K, mode)` → `{ known, unknown, total, verdict }`
  where mode is `learn` or `keep` (4.4).
- `apexOf(result)` (4.2).
- `isCloudflareIp(ip)`: implement real CIDR matching from Cloudflare's published
  list (`https://www.cloudflare.com/ips-v4` and `ips-v6`), stored as a constant
  with the date it was copied. Do not carry over the glob patterns in
  `check.sh`; several are wrong (`188.114.96.0/20` is encoded as `.96–.99`,
  `197.234.240.0/22` and `198.41.128.0/17` are loose or incomplete).
- `isBogonIp(ip)`, `isDenied(value, denylist)` including the trailing-dot IPv4
  prefix form, `isVictimHost(host, victims)`, `escapeField(value)`.

Tests, all in `tests/unit/classify.test.js`:

- `kitUrlVerdict`: `strict` for `https://x.test/a/OGr5enRKway5VGSL?us=dlm` and
  for `?foo=1&us=gm`; `partial` for `/a/Fksp41ggPJonkxGAZR_b8X` with no query,
  for `/a/master_global`, and for `?us=zz`; `none` for
  `https://autonocion.com/us/gm-is-finally-solving-x`.
- `judgeFingerprint`, learn mode: 19 known + 3 unknown, total 22 → learn.
  19 known + 40 unknown, total 78 → reject (the October hash). One scan whose
  apex and hostname are both in K → `known = 1`, reject. 2 known + 0 unknown →
  reject. 10 known + 1 unknown, total 900 → reject.
- `judgeFingerprint`, keep mode: 20 known + 8 unknown → keep. 4 known + 30
  unknown → quarantine.
- Reuse the four JSON files in `monitor/tests/fixtures/` as inputs where they
  fit.
- Denylist prefix `23.82.16.` denies `23.82.16.53` and not `23.82.160.1`.
- `escapeField` output never contains a tab, newline or comma.

Pass when: `node --test monitor/tests/unit` is green, and
`bash monitor/tests/run.sh` still passes because the old code is untouched.

### Step 2 — The decision engine

Goal: all policy in one pure function, proven against scenarios before any
network code exists.

Build `lib/decide.js` and `tests/unit/decide.test.js`. Observations are plain
objects: fingerprint search results, URL-shape search results, scan results for
chaining, DNS answers, origin search results, and per-source health.

Scenarios, each a small hand-written fixture:

| Name | Given | Expect |
|---|---|---|
| `quiet` | fingerprints return only apexes in K | no events, no alerts, state unchanged apart from `last_hit` |
| `rotation` | two fingerprints both return apexes `n1`, `n2` not in K | both confirmed with evidence `hash:a+b`, one alert listing two domains |
| `single-hit` | one fingerprint returns unknown apex `u1` | `u1` is a candidate with reason `single-fingerprint`, no alert |
| `single-then-second` | previous state has `u1` as candidate; now a second fingerprint returns it | `u1` confirmed |
| `strict-url` | URL search returns `…/a/<16>?us=sml` on unknown apex | confirmed with evidence `url` |
| `partial-url` | `/a/<22>` with no `us=` | candidate, no alert |
| `generic-chunk` | chaining offers a hash with 19 known, 40 unknown | not learned, candidate row carries `19/40/78` |
| `double-count` | chaining offers a hash seen in one scan of a known apex | not learned |
| `poisoned-fingerprint` | a trusted fingerprint returns 4 known and 30 unknown; one healthy fingerprint also lists two of those 30 | quarantined; none of the 30 is confirmed, because a quarantined fingerprint does not count toward R1; the two become candidates; health raised |
| `burst` | 40 apexes each satisfy R1 | breaker: 0 confirmed, 40 candidates with reason `breaker`, nothing learned, health raised |
| `burst-allowed` | same with `allowBurst` | 40 confirmed |
| `per-fingerprint-cap` | one fingerprint introduces 15 unknown apexes | that fingerprint skipped and flagged |
| `subdomain` | scan of `olx.k1.test` where `k1.test` is confirmed | `subdomain` event, no alert |
| `denied` | results include a denylisted apex and a subdomain of a `victim` | neither appears in any output |
| `decay` | host fails DNS 8 runs in a row | `dead`, next check 24 h later |
| `revive` | dead host resolves | `live`, `revived` event, no alert |
| `source-down-dns` | both resolvers report errors | no `fail_streak` change, health `BLIND` for DNS |
| `source-down-urlscan` | every urlscan request failed, or the key was rejected | health `BLIND`, fingerprints keep their `last_hit`, no retirement |
| `stale-fingerprints` | no fingerprint hit for 7 days, sources healthy | health note `fingerprints-stale` |
| `operator-b` | curated origin returns one new domain; another origin returns 60 domains | first recorded for the weekly digest; second trips the shared-IP breaker and records nothing |
| `idempotent` | run `decide` twice with the same observations, feeding the first output state in | second run produces no events and identical state |

Pass when: every scenario is a named test and all are green.

### Step 3 — Sources, storage and the runnable program

Goal: `node monitor/run.js` works end to end, offline, from recorded responses.

Build `lib/sources.js`, `lib/store.js`, `run.js`.

- urlscan search with the key, and without it only for the URL-shape query.
  With no key, or a 401/403/429 on a `hash:` search, the run's urlscan health is
  `BLIND`. Never treat an error as an empty result.
- One retry with backoff on network failure. A per-run request counter enforces
  the limits in 4.5.
- DNS: query both resolvers for A and AAAA; a host is resolved if either
  answers; a resolver is unhealthy if more than half its requests fail.
- `store.js` validates column counts on read and refuses to write a file whose
  row count dropped by more than half unless the caller passes an explicit
  `allowShrink` (the migration in step 5 does).
- `run.js --dry-run` prints what it would write and writes nothing.

Build three replay scenarios under `tests/replay/` with full
`requests/`, `state-before/` and `expected/` directories: `rotation`,
`generic-chunk` and `source-down`. Synthetic domains must use the `.test` TLD.

Tests in `tests/replay.test.js`: for each scenario, copy `state-before` to a
temp directory, run `run.js --replay <scenario> --root <tmp> --now <fixed>`, and
compare every state file and `STATUS.md` byte for byte with `expected/`. Add:

- a replay with a missing response file fails loudly;
- running the same scenario a second time on its own output changes no file;
- fixtures hold response bodies only, never request headers, and no file under
  `tests/replay/` contains the string `API-Key`.

Pass when: `node --test monitor/tests` is green and finishes in under 30
seconds with the network disabled.

### Step 4 — Reporting, feeds and alert files

Goal: the outputs a human reads are short and trustworthy.

`STATUS.md`, in this order, under 120 lines:

1. One status line: `OK`, `DEGRADED` or `BLIND`, the run time, and the reason
   when not `OK`.
2. **New since the last run**: confirmed domains with evidence and a urlscan
   link.
3. **Live kit domains**: grouped by apex, with first seen, last live, IP and
   ASN. Cap at 40 apexes, newest first, then "and N more in
   `state/domains.tsv`".
4. **Fingerprints**: counts by status, newest hit, any quarantined.
5. **Waiting for review**: candidate counts by reason and the 10 newest.
6. **Last 10 runs**: one line each from `runs.tsv`.

Alert files, written by `run.js` and consumed by the workflow, both ignored by
git:

- `monitor/ALERT_CONFIRMED.md`: the body for one Issue, present only when at
  least one new apex was confirmed. A table of domain, evidence, urlscan link,
  live or not, IP and ASN. Wrap domains in backticks so GitHub does not link
  them.
- `monitor/ALERT_HEALTH.md`: present when status is `BLIND`, a breaker tripped,
  a fingerprint was quarantined, or fingerprints are stale.

`export-feeds.js`: take domains from `docs/indicators.csv` as it does now, plus
rows in `state/domains.tsv` with operator A whose evidence is `url` or
`hash:…`. Never read candidates, and keep the existing exclusion of denylisted
entries and `victim` sites. "Live" is `status == live`.

Scan submission (`SUBMIT_SCANS=1` and a key): only hosts confirmed in this run,
at most 5, with the tags the current tracker uses (`marketplace-phaas`,
`auto-monitor`).

Tests:

- `STATUS.md` from the `rotation` scenario matches the golden file and is under
  120 lines.
- With a state of 300 live apexes it is still under 120 lines.
- A candidate never appears in any file under `feeds/`.
- A `victim` host and its subdomains never appear under `feeds/`.
- With `SUBMIT_SCANS` unset the replay transport records zero submission
  requests; with it set, at most 5, and only for hosts confirmed in that run.
- `ALERT_CONFIRMED.md` is absent in `quiet` and `generic-chunk`, present in
  `rotation`.

Pass when: `node --test monitor/tests` is green.

### Step 5 — Reset the state (offline)

Goal: the repository holds only data that traces back to human review.

Write `monitor/migrate-2026-11.js`, run it once, commit its output, and keep the
script for the record.

The **trusted baseline T0** is the union of:

- `docs/indicators.csv` rows with type `domain` and operator `A`;
- `monitor/watchlist.txt` rows of kind `apex`, operator `A`;
- apexes in `monitor/discovered.csv` with status `promoted` and a timestamp
  **before 2026-10-14T00:00:00Z** (about 110 rows, all kit-shaped names).

That gives about 312 apexes. Print the list and its size.

Then:

1. `state/domains.tsv`: one row per T0 apex, plus hosts from the old
   `tracked_hosts.tsv` whose name is a T0 apex or ends in `.<T0 apex>`. Carry
   over first seen, last OK and status (`active` → `live`). Expect about 360
   rows.
2. `findings.csv`: keep old rows whose indicator is under a T0 apex **and**
   whose time is before 2026-10-14T00:00:00Z, converted to the new columns with
   event `confirmed`. Expect a few hundred rows.
3. `fingerprints.txt`: the 16 seed rows only, in the new format.
4. `state/learned_fingerprints.tsv`: the 218 learned hashes with status
   `quarantined` and note `unverified-2026-11`, so nothing queries them until
   step 6 clears them.
5. `watchlist.txt`: new three-column format; `dnsonly` → `victim`; delete the
   20 `token` rows; add `193.111.117.211` to `candidates.tsv`, not to the
   watchlist (see section 8).
6. Delete from the working tree: `state/auto_apexes.txt`,
   `state/tracked_hosts.tsv`, `state/seen_*.txt`, `state/ct_pending.tsv`,
   `state/scanned.txt`, `state/pending_opb.txt`, `state/health_down.txt`,
   `state/initialized`, `discovered.csv`, `scans.csv`, `monitor.log`,
   `migrate-2026-09.sh`, `migrate-2026-09-hashpivot.tsv`.
7. Remove `dailyrss-website.versec.workers.dev` from every source that feeds
   `feeds/`. Move `2gbpz6ock88lptu.icu` to candidates with reason
   `partial-url-needs-review`.
8. Regenerate `feeds/` and `STATUS.md` with `run.js --replay` on an empty
   scenario so no network is needed.

Tests in `tests/unit/state-invariants.test.js`, which stay in the suite
permanently:

- every host in `domains.tsv` is, or is under, an apex that is curated or has a
  `confirmed` row in `findings.csv`;
- `domains.tsv` has fewer than 1,000 rows and no duplicate host;
- no host ends in a shared-platform suffix: `vercel.app`, `workers.dev`,
  `pages.dev`, `googleusercontent.com`, `sslip.io`, `railway.app`,
  `squarespace.com`, `azurefd.net`, `azurecontainerapps.io`, `hs-sites.com`,
  `edgeone.dev`, `retool.com`, `github.io`, `netlify.app`;
- nothing on the denylist is in any state file or feed;
- every `findings.csv` row has 9 columns;
- `monitor/` is under 3 MB (`du -sk`);
- `feeds/domains.txt` contains neither of the two domains in item 7.

Pass when: `node --test monitor/tests` is green and you have reported the row
counts of each new file next to the old ones.

### Step 6 — Re-validate fingerprints against live data

Goal: decide, with evidence, which of the 234 hashes are real fingerprints, and
bring the confirmed set up to date. This is the only step that needs the key
during development.

1. Write `monitor/tools/revalidate.js`. For each seed and each quarantined
   learned hash it runs one authenticated `hash:` search, applies
   `judgeFingerprint` in `learn` mode against K built from the step-5 state,
   and prints a table: hash, label, known, unknown, total, verdict.
2. Run it with `--record monitor/tests/replay/revalidate-2026-11/` so the
   responses become a fixture. 234 searches at one per second is about four
   minutes. If the quota runs out, stop, report how far it got, and continue the
   next day from where it stopped; make the script resumable.
3. Apply the verdicts: passing learned hashes become `trusted`; failing ones
   stay `quarantined` with their numbers. A seed that fails is reported to the
   maintainer and left in place.
4. Do one live bootstrap run: `node monitor/run.js --record <dir>` with
   `SUBMIT_SCANS` unset. If the breaker trips, do not set `ALLOW_BURST` on your
   own. Report the candidate list to the maintainer and wait.
5. Trim the recorded fixture to the hashes that matter and add a permanent
   test: hash `6930c2cc…` and at least four others learned on or after
   2026-10-14 are rejected; `next2-chunk-01` (`0e944f2d…`) is accepted.

If no key can be provided to the session: add a workflow
`.github/workflows/tracker-revalidate.yml` triggered by a push to `claude/**`
that changes `monitor/tools/revalidate.js`, which runs the script with the
`URLSCAN_KEY` secret and commits the recorded fixture and verdict table back to
the same branch. `kit-body-heal.yml` already uses this pattern.

Pass when: the verdict table is committed under
`docs/incidents/2026-11-fingerprint-revalidation.md`, the new permanent test is
green, and after the bootstrap run the state invariants from step 5 still hold.

Expectation, so you can tell if something is off: most hashes learned between
2026-10-03 and 2026-10-13 should pass, most learned later should fail, and the
bootstrap run should confirm tens of apexes, not hundreds.

### Step 7 — Switch the workflow over

Goal: the scheduled job runs v3 and can no longer run for hours.

Rewrite `.github/workflows/infra-monitor.yml`:

1. `timeout-minutes: 20` on the job.
2. Steps: checkout, Node 20, `node --test monitor/tests`,
   `node monitor/run.js` with `URLSCAN_KEY` and `SUBMIT_SCANS=1`,
   `node monitor/export-feeds.js .`, commit, alerts.
3. Commit only `monitor/state`, `monitor/findings.csv`, `STATUS.md`, `feeds`
   and the kit-body archive directories. Rebase before pushing and fail the job
   if the push fails, instead of the current `git push || true`.
4. Confirmed alert: if `monitor/ALERT_CONFIRMED.md` exists, open one Issue with
   labels `operator-a` and `kit-confirmed`.
5. Health alert: if `monitor/ALERT_HEALTH.md` exists, comment on the open
   `tracker-health` Issue, or open one if none is open. When the file is absent
   and such an Issue is open, comment "recovered" once and leave closing to the
   maintainer.
6. Keep the Monday Operator-B digest job, reading the Operator-B rows the new
   state holds.
7. If `URLSCAN_KEY` is empty the run must end `BLIND` and raise the health
   alert. Add a test for that using the replay transport.

Then delete `monitor/check.sh`, `monitor/parse.js`, `monitor/snapshot.js`,
`monitor/tests/run.sh` and `monitor/tests/fixtures/` once their useful cases
live in the new suite. Update `heal-bodies.sh` to read kit scans from the new
`findings.csv`, and port its existing tests to `node --test`.

Tests:

- `node --test monitor/tests` is green with the old files gone.
- Both workflow files parse as YAML (`actionlint` if available, otherwise
  `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml`).
- `grep -rn "check\.sh\|parse\.js\|tracked_hosts\|auto_apexes\|NEW_TIER1" .github monitor README.md CONTRIBUTING.md`
  returns only historical notes.
- After the maintainer merges and triggers one manual run: it finishes in under
  10 minutes, the commit it makes touches fewer than 10 files, and `STATUS.md`
  says `OK`.

### Step 8 — Documentation and Issue cleanup

Goal: someone opening the repository cold understands the tracker in five
minutes, and the Issue list means something again.

Documentation:

- `README.md`: replace the sections "The live infrastructure tracker" and the
  `monitor/` data dictionary with about 60 lines: what it watches, the three
  trust levels, the three confirmation rules, the limits, where to look
  (`STATUS.md`), how to run it, and how to review candidates. State plainly that
  the main detector needs `URLSCAN_KEY`. Fix the claim that Operator A is always
  behind Cloudflare.
- `docs/incidents/2026-10-fingerprint-poisoning.md`: section 2 of this plan,
  with the numbers.
- `monitor/review-prompt.md`: rewrite for the new model. The routine reviews
  `kit-confirmed` Issues and the candidate list in `STATUS.md`, gives a verdict
  per item, and suggests edits to the three human files. It still never commits.
  Remove the drift procedure's "≥2 known domains and total < 1000" rule and
  point it at `judgeFingerprint`'s thresholds instead.
- `CONTRIBUTING.md` and the Issue template: match the new file names.
- Add a short "How to" list to the README: add a domain, deny a domain, approve
  a candidate, add a seed fingerprint, recover after a kit rebuild.

Issue cleanup, after showing the maintainer the numbers:

1. Open one Issue titled "Incident: fingerprint poisoning 2026-10-14 →
   2026-11-12" linking the incident document. List every indicator from the
   noise Issues that is under a confirmed apex after step 6, so nothing real is
   lost.
2. Close every open Issue labelled `operator-a` created on or after
   2026-10-14, as "not planned", with one comment linking the incident Issue.
   Do this with one script run in a workflow (`gh issue list … | gh issue
   close`), with a dry run first whose output the maintainer approves. Do not
   close them one tool call at a time.
3. Leave earlier Issues and anything labelled `claude-reviewed` alone.

Pass when: the README tracker section is under 80 lines, every file path it
mentions exists, and the open `operator-a` Issue count equals the number of
confirmed alerts raised by v3.

### Step 9 — Optional: certificate logs as context

Only if the maintainer asks for it after two weeks of v3 running cleanly.

For at most 10 live confirmed apexes per run, in rotation, ask certspotter for
subdomains. New names are stored under their apex as `subdomain` events and
resolved on later runs. They never alert, never count toward K as new apexes,
and never trigger a search of their own. Add a scenario proving a certificate
for an unrelated or dead name changes nothing but a candidate row.

## 7. Definition of done

- All of `node --test monitor/tests` passes offline in under 30 seconds.
- Three consecutive scheduled runs finish in under 10 minutes with status `OK`.
- `monitor/` is under 3 MB and each run's commit is small.
- `STATUS.md` shows only domains with evidence links.
- Zero open Issues that are not either a confirmed kit domain, the incident
  record, or tracker health.
- The README explains the tracker without referring to tiers, auto-promotion or
  the deleted files.

## 8. Decisions waiting for the maintainer

These are not the builder's to make.

1. **Disable the scheduled `infra-monitor` workflow now** (Actions tab →
   infra-monitor → Disable workflow) until step 7 is merged. Every run that
   still executes submits more public scans of unrelated sites.
2. **`193.111.117.211` (AS207043).** Since October, 48 findings show genuine kit
   hostnames resolving here instead of Cloudflare. It may be an exposed origin
   or another proxy. Worth a manual look and, if it holds up, an entry in
   `docs/indicators.csv`.
3. **The ~2,170 public urlscan scans of unrelated hosts.** They carry the
   `marketplace-phaas` tag under the account that owns `URLSCAN_KEY`. Consider
   asking urlscan support to remove the tag or the scans.
4. **`2gbpz6ock88lptu.icu`.** In the public blocklist on thin evidence; confirm
   or remove.
5. **Rotate `URLSCAN_KEY`** if it was ever shared outside Actions secrets.
