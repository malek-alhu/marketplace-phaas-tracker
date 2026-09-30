# Contributing

Thanks for helping track this operation. Reports from CERTs, abuse desks, brand-protection teams,
researchers and victims are all welcome.

## Ground rules

- **Passive sources only.** CT logs, urlscan and other public scanners, passive DNS, DNS-over-HTTPS,
  public phishing feeds, screenshots you already have. **Never** probe, log in to, submit data to, or
  otherwise interact with a suspected phishing site or operator system.
- **No personal data.** Redact victims' names, phone numbers, emails and card data from anything you
  post. Operator contact points (e.g. the WhatsApp number used as a lure) are fine — they are IOCs.
- **Show your evidence.** Every indicator needs a source a second person can check (a urlscan result
  link, a CT log entry, a feed record). Unverifiable claims are not added.
- Mark confidence the way the docs do: **[H]** observed · **[M]** inferred · **[L]** weak.

## How to contribute

| You have… | Do this |
|---|---|
| A new domain, URL, IP or nameserver pair | Open an Issue with the **"Report an indicator"** form. It is reviewed before anything reaches the tracker or the public feeds. |
| A correction or a false positive | Open an Issue (or a PR against `docs/`) citing the artefact. Confirmed false leads go to [`docs/operation-dossier.md`](docs/operation-dossier.md) §13 and [`monitor/denylist.txt`](monitor/denylist.txt). |
| A detection rule or an improvement to one | PR against [`detection/`](detection/). Include what you validated it on (matches **and** non-matches). |
| Tracker code changes | PR. Run `bash monitor/tests/run.sh` first; add a test that pins the bug or behaviour you changed. |

## What makes an indicator "Operator A"

At least one of:
1. a kit content hash from [`monitor/fingerprints.txt`](monitor/fingerprints.txt) on a urlscan capture;
2. the per-victim URL shape `/a/<12-24 char token>?us=<code>`, or `/viewer/<b64>/<b64>/<id>`, served
   from **AS13335 (Cloudflare)**.

Brand look-alikes without either signal are recorded as candidates, not attributed. Many unrelated
crews phish the same marketplaces (see the Allegro Lokalnie note in dossier §13).

## Using the data

- Feeds in [`feeds/`](feeds/) are regenerated every 6 hours and are safe to pull automatically.
  Hacked legitimate sites that the operators abused as redirectors are deliberately left out, so the
  feeds never block a victim's own mail or hosting.
- Please credit the project when you republish the data.
